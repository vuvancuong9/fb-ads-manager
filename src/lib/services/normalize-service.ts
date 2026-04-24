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

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────
// Normalize Ads: raw_ads_rows -> ads_daily_stats
// ─────────────────────────────────────────────────────────────────
async function normalizeAdsFile(
  uploadedFileId: string | null
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  let q = supabaseAdmin.from('raw_ads_rows').select('*').limit(50000)
  if (uploadedFileId) q = q.eq('uploaded_file_id', uploadedFileId)

  const { data: raws, error } = await q
  if (error) return { ok: false, inserted: 0, error: 'load raw_ads_rows: ' + error.message }
  if (!raws || raws.length === 0) return { ok: true, inserted: 0 }

  const records = raws.map((r: Record<string, unknown>) => {
    const subRaw = String(r.sub_id || '')
    const subNorm = parseSubId(subRaw) || subRaw
    const tk = parseTkAff(subRaw) || null
    return {
      report_date: r.report_date,
      sub_id_raw: subRaw,
      sub_id_normalized: subNorm,
      tk_aff: tk,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      adset_id: r.adset_id,
      adset_name: r.adset_name,
      ad_id: r.ad_id || `fallback_${r.id}`,
      ad_name: r.ad_name,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      updated_at: new Date().toISOString(),
    }
  })

  let inserted = 0
  let upsertErr: { message: string } | null = null
  const batch = 500
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin
      .from('ads_daily_stats')
      .upsert(slice, { onConflict: 'report_date,ad_id,sub_id_raw' })
    if (e) { upsertErr = e; break }
    inserted += slice.length
  }

  if (upsertErr) return { ok: false, inserted, error: 'upsert ads_daily_stats: ' + upsertErr.message }
  return { ok: true, inserted }
}

// ─────────────────────────────────────────────────────────────────
// Normalize Orders: raw_order_rows -> orders
// ─────────────────────────────────────────────────────────────────
async function normalizeOrdersFile(
  uploadedFileId: string | null
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  let q = supabaseAdmin.from('raw_order_rows').select('*').limit(50000)
  if (uploadedFileId) q = q.eq('uploaded_file_id', uploadedFileId)

  const { data: raws, error } = await q
  if (error) return { ok: false, inserted: 0, error: 'load raw_order_rows: ' + error.message }
  if (!raws || raws.length === 0) return { ok: true, inserted: 0 }

  const records = raws.map((r: Record<string, unknown>) => {
    const subRaw = String(r.sub_id || '')
    const subNorm = parseSubId(subRaw) || subRaw
    const tk = parseTkAff(subRaw) || String(r.tk_aff || '')
    return {
      report_date: r.report_date,
      order_id: r.order_id,
      sub_id_raw: subRaw,
      sub_id_normalized: subNorm,
      tk_aff: tk,
      commission: Number(r.commission) || 0,
      order_amount: Number(r.order_amount) || 0,
      status: r.status,
    }
  })

  let inserted = 0
  let insErr: { message: string } | null = null
  const batch = 500
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin
      .from('orders')
      .upsert(slice, { onConflict: 'order_id' })
    if (e) { insErr = e; break }
    inserted += slice.length
  }

  if (insErr) return { ok: false, inserted, error: 'upsert orders: ' + insErr.message }
  return { ok: true, inserted }
}

// ─────────────────────────────────────────────────────────────────
// Rebuild subid_daily_summary
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

  // daily map: "date::sub" -> daily record
  const dailyMap = new Map<string, {
    report_date: string; sub_id_normalized: string; tk_aff: string | null
    ads_spend: number; order_count: number; total_commission: number
  }>()

  // total map: sub -> totals
  const totalMap = new Map<string, { ads: number; orders: number; comm: number; tk: string | null }>()
  let latestDay: string | null = null

  for (const a of adsRows || []) {
    const d = dayKey(a.report_date as string)
    if (!d) continue
    if (!latestDay || d > latestDay) latestDay = d
    const sub = String(a.sub_id_normalized || '')
    const key = `${d}::${sub}`
    const cur = dailyMap.get(key) ?? { report_date: d, sub_id_normalized: sub, tk_aff: a.tk_aff as string | null, ads_spend: 0, order_count: 0, total_commission: 0 }
    cur.ads_spend += Number(a.spend) || 0
    if (a.tk_aff && !cur.tk_aff) cur.tk_aff = a.tk_aff as string
    dailyMap.set(key, cur)

    const t = totalMap.get(sub) ?? { ads: 0, orders: 0, comm: 0, tk: null }
    t.ads += Number(a.spend) || 0
    if (a.tk_aff && !t.tk) t.tk = a.tk_aff as string
    totalMap.set(sub, t)
  }

  for (const o of orderRows || []) {
    const d = dayKey(o.report_date as string)
    if (!d) continue
    if (!latestDay || d > latestDay) latestDay = d
    const sub = String(o.sub_id_normalized || '')
    const key = `${d}::${sub}`
    const cur = dailyMap.get(key) ?? { report_date: d, sub_id_normalized: sub, tk_aff: o.tk_aff as string | null, ads_spend: 0, order_count: 0, total_commission: 0 }
    cur.order_count += 1
    cur.total_commission += Number(o.commission) || 0
    if (o.tk_aff && !cur.tk_aff) cur.tk_aff = o.tk_aff as string
    dailyMap.set(key, cur)

    const t = totalMap.get(sub) ?? { ads: 0, orders: 0, comm: 0, tk: null }
    t.orders += 1
    t.comm += Number(o.commission) || 0
    if (o.tk_aff && !t.tk) t.tk = o.tk_aff as string
    totalMap.set(sub, t)
  }

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
      roi_daily,
      total_ads_all_time: t.ads,
      total_orders_all_time: t.orders,
      total_commission_all_time: t.comm,
      roi_total,
      has_ads_latest_day: has_latest_day,
      action_suggestion: suggestion,
      action_reason: reason,
      updated_at: new Date().toISOString(),
    }
  })

  let inserted = 0
  let upErr: { message: string } | null = null
  const batch = 500
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin
      .from('subid_daily_summary')
      .upsert(slice, { onConflict: 'report_date,sub_id_normalized' })
    if (e) { upErr = e; break }
    inserted += slice.length
  }

  if (upErr) return { ok: false, error: 'upsert summary: ' + upErr.message }
  return { ok: true, summaryRows: inserted, latestDate: latestDay ?? undefined }
}

// ─────────────────────────────────────────────────────────────────
// Public: runNormalize — goi tu upload route truc tiep
// ─────────────────────────────────────────────────────────────────
export async function runNormalize(input: NormalizeInput): Promise<NormalizeResult> {
  const { uploadedFileId, type } = input
  try {
    const result: NormalizeResult = { ok: true, type }

    if (type === 'ads' || type === 'all') {
      result.ads = await normalizeAdsFile(uploadedFileId || null)
    }
    if (type === 'orders' || type === 'all') {
      result.orders = await normalizeOrdersFile(uploadedFileId || null)
    }

    result.summary = await rebuildSubIdSummary()
    result.ok = (result.ads?.ok ?? true) && (result.orders?.ok ?? true) && (result.summary?.ok ?? true)
    return result
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
