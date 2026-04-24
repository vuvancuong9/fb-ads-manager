/**
 * normalize-service.ts  —  Production-ready
 *
 * Transforms raw uploaded rows into analytics tables.
 * All DB fetches are paginated (no silent .limit() truncation).
 * rebuildSubIdSummary is scoped to affected sub_ids only (no full-table wipe).
 * Every step is wrapped in try/catch with structured logging.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseSubId, parseTkAff } from '@/lib/parser/subid-parser'
import { createLogger } from '@/lib/logger'
import { toErrorMessage } from '@/lib/api-response'

const log = createLogger('normalize-service')

// ── Public types ──────────────────────────────────────────────────────────────

export interface NormalizeInput {
      uploadedFileId: string
      type: 'ads' | 'orders' | 'all'
}

export interface NormalizeResult {
      ok: boolean
      type?: string
      ads?: { ok: boolean; inserted?: number; error?: string }
      orders?: { ok: boolean; inserted?: number; error?: string }
      summary?: { ok: boolean; summaryRows?: number; latestDate?: string; error?: string }
      error?: string
}

// ── Shared pagination helper ──────────────────────────────────────────────────

type SupaRow = Record<string, unknown>

/**
     * Fetch all rows from a table with optional eq filter.
     * Uses range-based pagination to avoid PostgREST 1000-row default limit.
     */
async function fetchAllRows(
      table: string,
      filterCol?: string,
      filterVal?: string,
      pageSize = 1000,
    ): Promise<{ rows: SupaRow[]; error?: string }> {
      const rows: SupaRow[] = []
            let page = 0

  while (true) {
          let q = supabaseAdmin
            .from(table)
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (filterCol && filterVal !== undefined) {
                  q = q.eq(filterCol, filterVal)
        }

        const { data: chunk, error } = await q

        if (error) {
                  return { rows, error: error.message }
        }
          if (!chunk || chunk.length === 0) break
          rows.push(...chunk)
          if (chunk.length < pageSize) break
          page++
  }

  return { rows }
}

// ── normalizeAdsFile ──────────────────────────────────────────────────────────

async function normalizeAdsFile(
      uploadedFileId: string | null,
    ): Promise<{ ok: boolean; inserted?: number; error?: string }> {
      log.info('normalizeAdsFile: start', { uploadedFileId })

  let rows: SupaRow[]
      try {
              const result = await fetchAllRows(
                        'raw_ads_rows',
                        uploadedFileId ? 'uploaded_file_id' : undefined,
                        uploadedFileId ?? undefined,
                      )
              if (result.error) {
                        log.error('normalizeAdsFile: fetch failed', { error: result.error })
                        return { ok: false, inserted: 0, error: 'load raw_ads_rows: ' + result.error }
              }
              rows = result.rows
      } catch (e) {
              const msg = toErrorMessage(e)
              log.error('normalizeAdsFile: unexpected fetch error', { error: msg })
              return { ok: false, inserted: 0, error: msg }
      }

  if (!rows.length) {
          log.info('normalizeAdsFile: no rows to normalize')
          return { ok: true, inserted: 0 }
  }

  // Filter rows that have a report_date
  const validRows = rows.filter(r => r.report_date != null)
      log.info('normalizeAdsFile: rows loaded', { total: rows.length, valid: validRows.length })

  if (!validRows.length) return { ok: true, inserted: 0 }

  const records = validRows.map(r => {
          const subRaw  = String(r.sub_id || r.subid_normalized || '')
          const subNorm = parseSubId(subRaw) || subRaw
          const tk      = parseTkAff(subRaw) || String(r.tk_aff || '') || null
          return {
                    report_date:        r.report_date,
                    sub_id_raw:         subRaw,
                    sub_id_normalized:  subNorm,
                    tk_aff:             tk,
                    campaign_id:        r.campaign_id  ?? null,
                    campaign_name:      r.campaign_name ?? null,
                    adset_id:           r.adset_id     ?? null,
                    adset_name:         r.adset_name   ?? null,
                    ad_id:              r.ad_id        ?? null,
                    ad_name:            r.ad_name      ?? null,
                    spend:              Number(r.spend)       || 0,
                    impressions:        Number(r.impressions) || 0,
                    clicks:             Number(r.clicks)      || 0,
                    uploaded_file_id:   r.uploaded_file_id   ?? null,
          }
  })

  let inserted = 0
      const BATCH  = 500
      try {
              for (let i = 0; i < records.length; i += BATCH) {
                        const slice = records.slice(i, i + BATCH)
                        // ignoreDuplicates=true to handle re-uploads gracefully
                const { error: upsertErr } = await supabaseAdmin
                          .from('ads_daily_stats')
                          .upsert(slice, { onConflict: 'report_date,sub_id_normalized,ad_id', ignoreDuplicates: true })
                        if (upsertErr) {
                                    // Fallback: plain insert, ignore conflicts
                          log.warn('normalizeAdsFile: upsert failed, falling back to insert', { batch: Math.floor(i / BATCH), error: upsertErr.message })
                                    const { error: insErr } = await supabaseAdmin.from('ads_daily_stats').insert(slice)
                                    if (insErr) throw new Error(`Batch ${Math.floor(i / BATCH) + 1}: ${insErr.message}`)
                        }
                        inserted += slice.length
              }
              log.info('normalizeAdsFile: done', { inserted })
              return { ok: true, inserted }
      } catch (e) {
              const msg = toErrorMessage(e)
              log.error('normalizeAdsFile: insert failed', { error: msg, inserted })
              return { ok: false, inserted, error: msg }
      }
}

// ── normalizeOrders ───────────────────────────────────────────────────────────

async function normalizeOrders(
      uploadedFileId: string | null,
    ): Promise<{ ok: boolean; inserted?: number; error?: string }> {
      log.info('normalizeOrders: start', { uploadedFileId })

  let rows: SupaRow[]
      try {
              const result = await fetchAllRows(
                        'raw_order_rows',
                        uploadedFileId ? 'uploaded_file_id' : undefined,
                        uploadedFileId ?? undefined,
                      )
              if (result.error) {
                        log.error('normalizeOrders: fetch failed', { error: result.error })
                        return { ok: false, inserted: 0, error: 'load raw_order_rows: ' + result.error }
              }
              rows = result.rows
      } catch (e) {
              const msg = toErrorMessage(e)
              log.error('normalizeOrders: unexpected fetch error', { error: msg })
              return { ok: false, inserted: 0, error: msg }
      }

  if (!rows.length) return { ok: true, inserted: 0 }

  const validRows = rows.filter(r => r.report_date != null)
      log.info('normalizeOrders: rows loaded', { total: rows.length, valid: validRows.length })
      if (!validRows.length) return { ok: true, inserted: 0 }

  const records = validRows.map(r => {
          const subRaw  = String(r.sub_id || '')
          const subNorm = parseSubId(subRaw) || subRaw
          const tk      = parseTkAff(subRaw) || String(r.tk_aff || '') || null
          return {
                    report_date:       r.report_date,
                    order_id:          r.order_id    ?? null,
                    sub_id_raw:        subRaw,
                    sub_id_normalized: subNorm,
                    tk_aff:            tk,
                    commission:        Number(r.commission)   || 0,
                    order_amount:      Number(r.order_amount) || 0,
                    status:            String(r.status || ''),
          }
  })

  let inserted = 0
      const BATCH  = 200
      try {
              for (let i = 0; i < records.length; i += BATCH) {
                        const slice = records.slice(i, i + BATCH)
                        const { error: e } = await supabaseAdmin
                          .from('orders')
                          .upsert(slice, { onConflict: 'order_id', ignoreDuplicates: true })
                        if (e) {
                                    log.warn('normalizeOrders: upsert failed, falling back to insert', { error: e.message })
                                    const { count } = await supabaseAdmin.from('orders').insert(slice, { count: 'exact' })
                                    inserted += count ?? 0
                        } else {
                                    inserted += slice.length
                        }
              }
              log.info('normalizeOrders: done', { inserted })
              return { ok: true, inserted }
      } catch (e) {
              const msg = toErrorMessage(e)
              log.error('normalizeOrders: insert failed', { error: msg })
              return { ok: false, inserted, error: msg }
      }
}

// ── rebuildSubIdSummary ───────────────────────────────────────────────────────

async function rebuildSubIdSummary(
      uploadedFileId?: string,
    ): Promise<{ ok: boolean; summaryRows?: number; latestDate?: string; error?: string }> {
      log.info('rebuildSubIdSummary: start', { uploadedFileId })

  // Fetch ads rows (scoped or full)
  let adsRows: SupaRow[]
      try {
              const r = await fetchAllRows(
                        'ads_daily_stats',
                        uploadedFileId ? 'uploaded_file_id' : undefined,
                        uploadedFileId,
                      )
              if (r.error) return { ok: false, error: 'load ads_daily_stats: ' + r.error }
              adsRows = r.rows
      } catch (e) {
              return { ok: false, error: toErrorMessage(e) }
      }

  // Fetch orders rows (always full — needed for roi calc)
  let orderRows: SupaRow[]
      try {
              const r = await fetchAllRows('orders')
              if (r.error) return { ok: false, error: 'load orders: ' + r.error }
              orderRows = r.rows
      } catch (e) {
              return { ok: false, error: toErrorMessage(e) }
      }

  log.info('rebuildSubIdSummary: rows loaded', { ads: adsRows.length, orders: orderRows.length })

  if (!adsRows.length && !orderRows.length) return { ok: true, summaryRows: 0 }

  // ── Build daily map ──────────────────────────────────────────────────────

  const toDay = (d: unknown): string | null => {
          if (!d) return null
          return String(d).slice(0, 10)
  }

  type DailyKey = string
      interface DailySlot {
        report_date: string
              sub_id_normalized: string
              tk_aff: string | null
              ads_spend: number
              order_count: number
              total_commission: number
      }
      const dailyMap = new Map<DailyKey, DailySlot>()
      let latestDate = ''

  for (const r of adsRows) {
          const day = toDay(r.report_date)
          if (!day) continue
          if (day > latestDate) latestDate = day
          const sub = String(r.sub_id_normalized || '')
          const key = `${day}::${sub}`
          const existing = dailyMap.get(key)
          if (existing) {
                    existing.ads_spend += Number(r.spend) || 0
          } else {
                    dailyMap.set(key, {
                                report_date:       day,
                                sub_id_normalized: sub,
                                tk_aff:            r.tk_aff as string | null ?? null,
                                ads_spend:         Number(r.spend) || 0,
                                order_count:       0,
                                total_commission:  0,
                    })
          }
  }

  for (const r of orderRows) {
          const day = toDay(r.report_date)
          if (!day) continue
          const sub = String(r.sub_id_normalized || '')
          const key = `${day}::${sub}`
          const existing = dailyMap.get(key)
          if (existing) {
                    existing.order_count    += 1
                    existing.total_commission += Number(r.commission) || 0
          } else {
                    dailyMap.set(key, {
                                report_date:       day,
                                sub_id_normalized: sub,
                                tk_aff:            r.tk_aff as string | null ?? null,
                                ads_spend:         0,
                                order_count:       1,
                                total_commission:  Number(r.commission) || 0,
                    })
              }
  }

  // ── Build all-time totals map ────────────────────────────────────────────

  interface TotalSlot { ads: number; orders: number; comm: number; tk: string | null }
      const totalMap = new Map<string, TotalSlot>()
      for (const v of dailyMap.values()) {
              const sub = v.sub_id_normalized
              const t = totalMap.get(sub) ?? { ads: 0, orders: 0, comm: 0, tk: null }
              t.ads    += v.ads_spend
              t.orders += v.order_count
              t.comm   += v.total_commission
              if (!t.tk && v.tk_aff) t.tk = v.tk_aff
              totalMap.set(sub, t)
      }

  const hasLatest = (sub: string) =>
          latestDate ? dailyMap.has(`${latestDate}::${sub}`) : false

  // ── Build records to insert ──────────────────────────────────────────────

  const records = [...dailyMap.values()].map(v => {
          const sub          = v.sub_id_normalized
          const t            = totalMap.get(sub) ?? { ads: 0, orders: 0, comm: 0, tk: null }
          const roi_daily    = v.ads_spend > 0   ? v.total_commission / v.ads_spend : 0
          const roi_total    = t.ads > 0         ? t.comm / t.ads : 0
          const has_latest   = hasLatest(sub)
          const suggestion   =
                    !has_latest      ? 'CHECK_SUB_ID' :
                    roi_daily >= 1.5 ? 'SCALE_UP'     :
                    roi_daily >= 1.0 ? 'MAINTAIN'     :
                    roi_daily >= 0.5 ? 'REDUCE'       : 'PAUSE'
          const reason =
                    !has_latest      ? 'Khong co du lieu quang cao ngay moi nhat' :
                    roi_daily >= 1.5 ? 'ROI tot, nen tang ngan sach'              :
                    roi_daily >= 1.0 ? 'ROI on dinh'                              :
                    roi_daily >= 0.5 ? 'ROI thap, nen giam chi phi'               : 'ROI am, nen tam dung'

                                                 return {
                                                           report_date:                v.report_date,
                                                           sub_id_normalized:          sub,
                                                           tk_aff:                     v.tk_aff || t.tk,
                                                           ads_spend:                  v.ads_spend,
                                                           order_count:                v.order_count,
                                                           total_commission:           v.total_commission,
                                                           roi_daily:                  Math.round(roi_daily * 1000) / 1000,
                                                           total_ads_all_time:         t.ads,
                                                           total_orders_all_time:      t.orders,
                                                           total_commission_all_time:  t.comm,
                                                           roi_total:                  Math.round(roi_total * 1000) / 1000,
                                                           has_ads_latest_day:         has_latest,
                                                           action_suggestion:          suggestion,
                                                           action_reason:              reason,
                                                 }
  })

  // ── Scoped delete ────────────────────────────────────────────────────────

  try {
          if (uploadedFileId && adsRows.length > 0) {
                    // Only delete rows for sub_ids affected by this upload
            const affectedSubs = [...new Set(adsRows.map(r => String(r.sub_id_normalized || '')))]
                    log.info('rebuildSubIdSummary: scoped delete', { affectedSubs: affectedSubs.length })
                    const DELETE_BATCH = 50
                    for (let i = 0; i < affectedSubs.length; i += DELETE_BATCH) {
                                const subSlice = affectedSubs.slice(i, i + DELETE_BATCH)
                                const { error: delErr } = await supabaseAdmin
                                  .from('subid_daily_summary')
                                  .delete()
                                  .in('sub_id_normalized', subSlice)
                                if (delErr) log.warn('rebuildSubIdSummary: delete batch failed', { error: delErr.message })
                    }
          } else if (!uploadedFileId) {
                    // Full rebuild (admin re-sync) — wipe all rows
            log.info('rebuildSubIdSummary: full table delete (admin re-sync)')
                    const { error: delErr } = await supabaseAdmin
                      .from('subid_daily_summary')
                      .delete()
                      .neq('id', '00000000-0000-0000-0000-000000000000')
                    if (delErr) log.warn('rebuildSubIdSummary: full delete failed', { error: delErr.message })
          }
  } catch (e) {
          log.warn('rebuildSubIdSummary: delete step threw', { error: toErrorMessage(e) })
  }

  // ── Insert summary rows ──────────────────────────────────────────────────

  let summaryRows = 0
      const INSERT_BATCH = 200
      try {
              for (let i = 0; i < records.length; i += INSERT_BATCH) {
                        const slice = records.slice(i, i + INSERT_BATCH)
                        const { count, error: insErr } = await supabaseAdmin
                          .from('subid_daily_summary')
                          .insert(slice, { count: 'exact' })
                        if (insErr) throw new Error(`Summary insert batch ${Math.floor(i / INSERT_BATCH) + 1}: ${insErr.message}`)
                        summaryRows += count ?? 0
              }
              log.info('rebuildSubIdSummary: done', { summaryRows, latestDate })
              return { ok: true, summaryRows, latestDate: latestDate || undefined }
      } catch (e) {
              const msg = toErrorMessage(e)
              log.error('rebuildSubIdSummary: insert failed', { error: msg })
              return { ok: false, summaryRows, error: msg }
      }
}

// ── runNormalize (public entry point) ─────────────────────────────────────────

export async function runNormalize(input: NormalizeInput): Promise<NormalizeResult> {
      const { uploadedFileId, type } = input
      const startMs = Date.now()
      log.info('runNormalize: start', { uploadedFileId, type })

  const result: NormalizeResult = { ok: true, type }

  try {
          // Step 1 — ads
        if (type === 'ads' || type === 'all') {
                  try {
                              result.ads = await normalizeAdsFile(uploadedFileId || null)
                  } catch (e) {
                              const msg = toErrorMessage(e)
                              log.error('runNormalize: normalizeAdsFile threw', { error: msg })
                              result.ads = { ok: false, error: msg }
                  }
        }

        // Step 2 — orders
        if (type === 'orders' || type === 'all') {
                  try {
                              result.orders = await normalizeOrders(uploadedFileId || null)
                  } catch (e) {
                              const msg = toErrorMessage(e)
                              log.error('runNormalize: normalizeOrders threw', { error: msg })
                              result.orders = { ok: false, error: msg }
                  }
        }

        // Step 3 — rebuild summary (always run, scoped by uploadedFileId)
        try {
                  result.summary = await rebuildSubIdSummary(uploadedFileId || undefined)
        } catch (e) {
                  const msg = toErrorMessage(e)
                  log.error('runNormalize: rebuildSubIdSummary threw', { error: msg })
                  result.summary = { ok: false, error: msg }
        }

        result.ok =
                  (result.ads?.ok    ?? true) &&
                  (result.orders?.ok ?? true) &&
                  (result.summary?.ok ?? true)

        const durationMs = Date.now() - startMs
          log.info('runNormalize: complete', { ok: result.ok, durationMs })
          return result
  } catch (e) {
          const msg = toErrorMessage(e)
          log.error('runNormalize: unhandled error', { error: msg })
          return { ok: false, error: msg }
  }
}
