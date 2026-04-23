import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseSubId, parseTkAff } from '@/lib/parser/subid-parser'

export const maxDuration = 60
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

async function normalizeAds(uploadedFileId: string | null) {
  let q = supabaseAdmin.from('raw_ads_rows').select('*').limit(50000)
  if (uploadedFileId) q = q.eq('uploaded_file_id', uploadedFileId)
  const { data: raws, error } = await q
  if (error) return { ok: false, error: 'load raw_ads_rows: ' + error.message }
  if (!raws || !raws.length) return { ok: true, type: 'ads', inserted: 0, message: 'no rows' }

  const records = raws.map((r: any) => {
    const subRaw = r.sub_id || ''
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
  let upsertErr: any = null
  const batch = 500
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin.from('ads_daily_stats').upsert(slice, { onConflict: 'report_date,ad_id,sub_id_raw' })
    if (e) { upsertErr = e; break }
    inserted += slice.length
  }
  if (upsertErr) return { ok: false, type: 'ads', inserted, error: 'upsert ads_daily_stats: ' + upsertErr.message, detail: upsertErr }
  return { ok: true, type: 'ads', inserted }
}

async function normalizeOrders(uploadedFileId: string | null) {
  let q = supabaseAdmin.from('raw_order_rows').select('*').limit(100000)
  if (uploadedFileId) q = q.eq('uploaded_file_id', uploadedFileId)
  const { data: raws, error } = await q
  if (error) return { ok: false, error: 'load raw_order_rows: ' + error.message }
  if (!raws || !raws.length) return { ok: true, type: 'orders', inserted: 0, message: 'no rows' }

  const records = raws.map((r: any) => {
    const subRaw = r.sub_id || ''
    const subNorm = parseSubId(subRaw) || subRaw
    const tk = r.tk_aff || parseTkAff(subRaw) || null
    return {
      report_date: r.report_date,
      order_id: r.order_id,
      sub_id_raw: subRaw,
      sub_id_normalized: subNorm,
      tk_aff: tk,
      commission: Number(r.commission) || 0,
      order_amount: Number(r.order_amount) || 0,
      status: r.status || null,
    }
  })

  let inserted = 0
  let insErr: any = null
  const batch = 500
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin.from('orders').insert(slice)
    if (e) { insErr = e; break }
    inserted += slice.length
  }
  if (insErr) return { ok: false, type: 'orders', inserted, error: 'insert orders: ' + insErr.message, detail: insErr }
  return { ok: true, type: 'orders', inserted }
}

async function rebuildSummary() {
  const { data: adsRows, error: adsErr } = await supabaseAdmin.from('ads_daily_stats').select('report_date, sub_id_normalized, tk_aff, spend')
  if (adsErr) return { ok: false, error: 'load ads: ' + adsErr.message }
  const { data: orderRows, error: ordErr } = await supabaseAdmin.from('orders').select('report_date, sub_id_normalized, tk_aff, commission, order_amount')
  if (ordErr) return { ok: false, error: 'load orders: ' + ordErr.message }

  const dailyMap = new Map<string, any>()
  const totalMap = new Map<string, { ads: number, orders: number, comm: number, tk: string | null }>()
  let latestDay: string | null = null

  for (const a of adsRows || []) {
    const d = dayKey(a.report_date as any); if (!d) continue
    if (!latestDay || d > latestDay) latestDay = d
    const sub = a.sub_id_normalized || ''
    const key = `${d}::${sub}`
    const cur = dailyMap.get(key) || { report_date: a.report_date, sub_id_normalized: sub, tk_aff: a.tk_aff, ads_spend: 0, order_count: 0, total_commission: 0 }
    cur.ads_spend += Number(a.spend) || 0
    if (a.tk_aff && !cur.tk_aff) cur.tk_aff = a.tk_aff
    dailyMap.set(key, cur)
    const t = totalMap.get(sub) || { ads: 0, orders: 0, comm: 0, tk: a.tk_aff || null }
    t.ads += Number(a.spend) || 0
    if (a.tk_aff && !t.tk) t.tk = a.tk_aff
    totalMap.set(sub, t)
  }

  for (const o of orderRows || []) {
    const d = dayKey(o.report_date as any); if (!d) continue
    if (!latestDay || d > latestDay) latestDay = d
    const sub = o.sub_id_normalized || ''
    const key = `${d}::${sub}`
    const cur = dailyMap.get(key) || { report_date: o.report_date, sub_id_normalized: sub, tk_aff: o.tk_aff, ads_spend: 0, order_count: 0, total_commission: 0 }
    cur.order_count += 1
    cur.total_commission += Number(o.commission) || 0
    if (o.tk_aff && !cur.tk_aff) cur.tk_aff = o.tk_aff
    dailyMap.set(key, cur)
    const t = totalMap.get(sub) || { ads: 0, orders: 0, comm: 0, tk: o.tk_aff || null }
    t.orders += 1
    t.comm += Number(o.commission) || 0
    if (o.tk_aff && !t.tk) t.tk = o.tk_aff
    totalMap.set(sub, t)
  }

  const subsWithLatestAds = new Set<string>()
  for (const a of adsRows || []) {
    const d = dayKey(a.report_date as any)
    if (d && d === latestDay && (Number(a.spend) || 0) > 0) {
      subsWithLatestAds.add(a.sub_id_normalized || '')
    }
  }

  const records: any[] = []
  for (const [key, v] of dailyMap) {
    const sub = v.sub_id_normalized
    const t = totalMap.get(sub) || { ads: 0, orders: 0, comm: 0, tk: null }
    const roi_daily = v.ads_spend > 0 ? v.total_commission / v.ads_spend : 0
    const roi_total = t.ads > 0 ? t.comm / t.ads : 0
    const has_latest = subsWithLatestAds.has(sub)
    let suggestion = 'KEEP'
    let reason = 'ROI on muc tieu'
    if (roi_daily < 0.3 && v.ads_spend >= 100000) { suggestion = 'PAUSE'; reason = `ROI ${roi_daily.toFixed(2)} < 0.3 va chi phi ${Math.round(v.ads_spend)}` }
    else if (roi_daily >= 0.3 && roi_daily < 0.8) { suggestion = 'REDUCE_20'; reason = `ROI ${roi_daily.toFixed(2)} duoi nguong` }
    else if (roi_daily >= 0.8 && roi_daily < 1.3) { suggestion = 'KEEP'; reason = `ROI ${roi_daily.toFixed(2)} on dinh` }
    else if (roi_daily >= 1.3 && v.order_count >= 2) { suggestion = 'INCREASE_20'; reason = `ROI ${roi_daily.toFixed(2)} cao, ${v.order_count} don` }
    records.push({
      report_date: v.report_date,
      sub_id_normalized: sub,
      tk_aff: v.tk_aff,
      ads_spend: v.ads_spend,
      order_count: v.order_count,
      total_commission: v.total_commission,
      roi_daily,
      total_ads_all_time: t.ads,
      total_orders_all_time: t.orders,
      total_commission_all_time: t.comm,
      roi_total,
      has_ads_latest_day: has_latest,
      action_suggestion: suggestion,
      action_reason: reason,
      updated_at: new Date().toISOString(),
    })
  }

  let inserted = 0
  let upErr: any = null
  const batch = 500
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch)
    const { error: e } = await supabaseAdmin.from('subid_daily_summary').upsert(slice, { onConflict: 'report_date,sub_id_normalized' })
    if (e) { upErr = e; break }
    inserted += slice.length
  }
  if (upErr) return { ok: false, error: 'upsert summary: ' + upErr.message, detail: upErr, inserted }
  return { ok: true, summaryRows: inserted, latestDate: latestDay }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const uploadedFileId: string | null = body?.uploadedFileId || null
    const type: 'ads' | 'orders' | 'all' = body?.type || 'all'
    const result: any = { ok: true }
    if (type === 'ads' || type === 'all') result.ads = await normalizeAds(type === 'ads' ? uploadedFileId : null)
    if (type === 'orders' || type === 'all') result.orders = await normalizeOrders(type === 'orders' ? uploadedFileId : null)
    result.summary = await rebuildSummary()
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('normalize fatal:', e)
    return NextResponse.json({ ok: false, error: 'Loi khong xac dinh: ' + (e?.message || String(e)) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
