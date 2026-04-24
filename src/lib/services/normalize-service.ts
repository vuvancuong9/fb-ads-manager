import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseSubId, parseTkAff } from '@/lib/parser/subid-parser'

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

// ─────────────────────────────────────────────────────────────────
// normalizeAdsFile: raw_ads_rows -> ads_daily_stats
// ─────────────────────────────────────────────────────────────────
async function normalizeAdsFile(
  uploadedFileId: string | null
): Promise<{ ok: boolean; inserted?: number; error?: string }> {
  let q = supabaseAdmin.from('raw_ads_rows').select('*').limit(50000)
  if (uploadedFileId) q = q.eq('uploaded_file_id', uploadedFileId)

  const { data: raws, error } = await q
  if (error) return { ok: false, inserted: 0, error: 'load raw_ads_rows: ' + error.message }
  if (!raws || raws.length === 0) return { ok: true, inserted: 0 }

  // Chi xu ly cac rows co report_date hop le
  const validRaws = raws.filter((r: Record<string, unknown>) => r.report_date != null)
  if (validRaws.length === 0) return { ok: true, inserted: 0 }

  const records = validRaws.map((r: Record<string, unknown>) => {
    const subRaw = String(r.sub_id || r.subid_normalized || '')
    const subNorm = parseSubId(subRaw) || subRaw
    const tk = parseTkAff(subRaw) || String(r.tk_aff || '') || null
    return {
      report_date: r.report_date,
      sub_id_raw: subRaw,
      sub_id_normalized: subNorm,
      tk_aff: tk,
      campaign_id: r.campaign_id || null,
      campaign_name: r.campaign_name || null,
      adset_id: r.adset_id || null,
      adset_name: r.adset_name || null,
      ad_id: r.ad_id || null,
      ad_name: r.ad_name || null,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
    }
  })

  let inserted = 0
  let upsertErr = ''
  const batch = 200

  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin
      .from('ads_daily_stats')
      .upsert(slice, { onConflict: 'report_date,ad_id,ad_name,sub_id_raw', ignoreDuplicates: false })
    if (e) {
      upsertErr = e.message
      // Fallback: insert without upsert (bo qua duplicate)
      const { count, error: insE } = await supabaseAdmin
        .from('ads_daily_stats')
        .insert(slice, { count: 'exact' })
      if (!insE) inserted += count ?? 0
    } else {
      inserted += slice.length
    }
  }

  if (upsertErr) return { ok: false, inserted, error: 'upsert ads: ' + upsertErr }
  return { ok: true, inserted }
}

// ─────────────────────────────────────────────────────────────────
// normalizeOrders: raw_order_rows -> orders
// ─────────────────────────────────────────────────────────────────
async function normalizeOrders(
  uploadedFileId: string | null
): Promise<{ ok: boolean; inserted?: number; error?: string }> {
  let q = supabaseAdmin.from('raw_order_rows').select('*').limit(50000)
  if (uploadedFileId) q = q.eq('uploaded_file_id', uploadedFileId)

  const { data: raws, error } = await q
  if (error) return { ok: false, inserted: 0, error: 'load raw_order_rows: ' + error.message }
  if (!raws || raws.length === 0) return { ok: true, inserted: 0 }

  const validRaws = raws.filter((r: Record<string, unknown>) => r.report_date != null)
  if (validRaws.length === 0) return { ok: true, inserted: 0 }

  const records = validRaws.map((r: Record<string, unknown>) => {
    const subRaw = String(r.sub_id || '')
    const subNorm = parseSubId(subRaw) || subRaw
    const tk = parseTkAff(subRaw) || String(r.tk_aff || '') || null
    return {
      report_date: r.report_date,
      order_id: r.order_id || null,
      sub_id_raw: subRaw,
      sub_id_normalized: subNorm,
      tk_aff: tk,
      commission: Number(r.commission) || 0,
      order_amount: Number(r.order_amount) || 0,
      status: String(r.status || ''),
    }
  })

  let inserted = 0
  const batch = 200

  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin
      .from('orders')
      .upsert(slice, { onConflict: 'order_id', ignoreDuplicates: true })
    if (e) {
      // Fallback insert
      const { count } = await supabaseAdmin.from('orders').insert(slice, { count: 'exact' })
      inserted += count ?? 0
    } else {
      inserted += slice.length
    }
  }

  return { ok: true, inserted }
}

// ─────────────────────────────────────────────────────────────────
// rebuildSubIdSummary: ads_daily_stats + orders -> subid_daily_summary
// ─────────────────────────────────────────────────────────────────
async function rebuildSubIdSummary(): Promise<{
  ok: boolean
  summaryRows?: number
  latestDate?: string
  error?: string
}> {
  const { data: adsRows, error: adsErr } = await supabaseAdmin
    .from('ads_daily_stats')
    .select('report_date, sub_id_normalized, tk_aff, spend')
  if (adsErr) return { ok: false, error: 'load ads: ' + adsErr.message }

  const { data: orderRows, error: ordErr } = await supabaseAdmin
    .from('orders')
    .select('report_date, sub_id_normalized, tk_aff, commission, order_amount')
  if (ordErr) return { ok: false, error: 'load orders: ' + ordErr.message }

  if (!adsRows?.length && !orderRows?.length) return { ok: true, summaryRows: 0 }

  // Map by (report_date_day, sub_id_normalized)
  type DayKey = string
  type SubKey = string
  const dailyMap = new Map<DayKey, {
    report_date: string
    sub_id_normalized: string
    tk_aff: string | null
    ads_spend: number
    order_count: number
    total_commission: number
  }>()

  const toDay = (d: unknown): string | null => {
    if (!d) return null
    const s = String(d)
    return s.slice(0, 10)
  }

  let latestDate = ''

  for (const r of (adsRows ?? [])) {
    const day = toDay(r.report_date)
    if (!day) continue
    if (day > latestDate) latestDate = day
    const sub = r.sub_id_normalized || ''
    const key = `${day}::${sub}`
    const existing = dailyMap.get(key)
    if (existing) {
      existing.ads_spend += Number(r.spend) || 0
    } else {
      dailyMap.set(key, {
        report_date: day,
        sub_id_normalized: sub,
        tk_aff: r.tk_aff || null,
        ads_spend: Number(r.spend) || 0,
        order_count: 0,
        total_commission: 0,
      })
    }
  }

  for (const r of (orderRows ?? [])) {
    const day = toDay(r.report_date)
    if (!day) continue
    const sub = r.sub_id_normalized || ''
    const key = `${day}::${sub}`
    const existing = dailyMap.get(key)
    if (existing) {
      existing.order_count += 1
      existing.total_commission += Number(r.commission) || 0
    } else {
      dailyMap.set(key, {
        report_date: day,
        sub_id_normalized: sub,
        tk_aff: r.tk_aff || null,
        ads_spend: 0,
        order_count: 1,
        total_commission: Number(r.commission) || 0,
      })
    }
  }

  // Total per sub
  type TotalKey = SubKey
  const totalMap = new Map<TotalKey, { ads: number; orders: number; comm: number; tk: string | null }>()
  for (const v of dailyMap.values()) {
    const sub = v.sub_id_normalized
    const t = totalMap.get(sub) ?? { ads: 0, orders: 0, comm: 0, tk: null }
    t.ads += v.ads_spend
    t.orders += v.order_count
    t.comm += v.total_commission
    if (!t.tk && v.tk_aff) t.tk = v.tk_aff
    totalMap.set(sub, t)
  }

  const latestDay = latestDate
  const has_latest = (sub: string) =>
    latestDay ? dailyMap.has(`${latestDay}::${sub}`) : false

  const records = [...dailyMap.values()].map((v) => {
    const sub = v.sub_id_normalized
    const t = totalMap.get(sub) ?? { ads: 0, orders: 0, comm: 0, tk: null }
    const roi_daily = v.ads_spend > 0 ? v.total_commission / v.ads_spend : 0
    const roi_total = t.ads > 0 ? t.comm / t.ads : 0
    const has_latest_day = has_latest(sub)
    const suggestion =
      !has_latest_day ? 'CHECK_SUB_ID' :
      roi_daily >= 1.5 ? 'SCALE_UP' :
      roi_daily >= 1.0 ? 'MAINTAIN' :
      roi_daily >= 0.5 ? 'REDUCE' : 'PAUSE'
    const reason =
      !has_latest_day ? 'Khong co du lieu quang cao ngay moi nhat' :
      roi_daily >= 1.5 ? 'ROI tot, nen tang ngan sach' :
      roi_daily >= 1.0 ? 'ROI on dinh' :
      roi_daily >= 0.5 ? 'ROI thap, nen giam chi phi' : 'ROI am, nen tam dung'

    return {
      report_date: v.report_date,
      sub_id_normalized: sub,
      tk_aff: v.tk_aff || t.tk,
      ads_spend: v.ads_spend,
      order_count: v.order_count,
      total_commission: v.total_commission,
      roi_daily: Math.round(roi_daily * 1000) / 1000,
      total_ads_all_time: t.ads,
      total_orders_all_time: t.orders,
      total_commission_all_time: t.comm,
      roi_total: Math.round(roi_total * 1000) / 1000,
      has_ads_latest_day: has_latest_day,
      action_suggestion: suggestion,
      action_reason: reason,
    }
  })

  // Delete old and re-insert
  await supabaseAdmin.from('subid_daily_summary').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  let summaryRows = 0
  const batch = 200
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { count } = await supabaseAdmin.from('subid_daily_summary').insert(slice, { count: 'exact' })
    summaryRows += count ?? 0
  }

  return { ok: true, summaryRows, latestDate: latestDate || undefined }
}

// ─────────────────────────────────────────────────────────────────
// runNormalize — goi tu upload route truc tiep
// ─────────────────────────────────────────────────────────────────
export async function runNormalize(input: NormalizeInput): Promise<NormalizeResult> {
  const { uploadedFileId, type } = input
  try {
    const result: NormalizeResult = { ok: true, type }

    if (type === 'ads' || type === 'all') {
      result.ads = await normalizeAdsFile(uploadedFileId || null)
    }
    if (type === 'orders' || type === 'all') {
      result.orders = await normalizeOrders(uploadedFileId || null)
    }

    // Rebuild summary sau moi lan normalize
    result.summary = await rebuildSubIdSummary()

    result.ok = (result.ads?.ok ?? true) && (result.orders?.ok ?? true) && (result.summary?.ok ?? true)
    return result
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
