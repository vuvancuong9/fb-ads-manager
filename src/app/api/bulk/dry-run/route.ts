import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type BulkAction = 'pause' | 'resume' | 'increase_budget' | 'decrease_budget'

const ACTION_LABEL: Record<BulkAction, string> = {
  pause: 'Tat ads',
  resume: 'Bat ads',
  increase_budget: 'Tang ngan sach',
  decrease_budget: 'Giam ngan sach',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const action: BulkAction = body?.action
    const subIds: string[] = Array.isArray(body?.subIds) ? body.subIds : []
    const percent: number = Number(body?.percent) || 20
    if (!action || !ACTION_LABEL[action]) {
      return NextResponse.json({ ok: false, error: 'Hanh dong khong hop le' }, { status: 400 })
    }
    if (subIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'Chua chon Sub ID nao' }, { status: 400 })
    }

    const { data: latestRow } = await supabaseAdmin
      .from('subid_daily_summary').select('report_date')
      .order('report_date', { ascending: false }).limit(1).maybeSingle()
    if (!latestRow) {
      return NextResponse.json({ ok: false, error: 'Chua co du lieu summary' }, { status: 400 })
    }
    const latestDay = (latestRow.report_date as string).substring(0, 10)
    const startIso = `${latestDay}T00:00:00Z`
    const endIso = `${latestDay}T23:59:59Z`

    const { data: summaryRows, error: sErr } = await supabaseAdmin
      .from('subid_daily_summary').select('sub_id_normalized, tk_aff, ads_spend, order_count, total_commission, roi_daily, action_suggestion')
      .in('sub_id_normalized', subIds)
      .gte('report_date', startIso).lte('report_date', endIso)
    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 })

    const summaryMap = new Map<string, any>()
    for (const r of summaryRows || []) summaryMap.set((r as any).sub_id_normalized, r)

    const { data: adsRows, error: aErr } = await supabaseAdmin
      .from('ads_daily_stats').select('sub_id_normalized, ad_id, campaign_id, campaign_name, adset_id, adset_name, spend')
      .in('sub_id_normalized', subIds)
      .gte('report_date', startIso).lte('report_date', endIso)
    if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 })

    const adByCampaign = new Map<string, { campaign_id: string | null, campaign_name: string | null, sub_id: string, adsCount: number, spend: number }>()
    for (const r of adsRows || []) {
      const sub = (r as any).sub_id_normalized
      const campId = (r as any).campaign_id || ''
      const key = sub + '::' + campId
      const cur = adByCampaign.get(key) || { campaign_id: (r as any).campaign_id, campaign_name: (r as any).campaign_name, sub_id: sub, adsCount: 0, spend: 0 }
      cur.adsCount += 1
      cur.spend += Number((r as any).spend) || 0
      adByCampaign.set(key, cur)
    }

    const items = subIds.map(sub => {
      const sum = summaryMap.get(sub)
      const camps = Array.from(adByCampaign.values()).filter(c => c.sub_id === sub)
      const targetCampaigns = camps.length
      let proposed: any = { action, label: ACTION_LABEL[action] }
      if (action === 'increase_budget') proposed.delta = `+${percent}%`
      if (action === 'decrease_budget') proposed.delta = `-${percent}%`
      return {
        sub_id: sub,
        tk_aff: sum?.tk_aff || null,
        ads_day: Math.round(Number(sum?.ads_spend) || 0),
        orders_day: Number(sum?.order_count) || 0,
        roi_day: Number(sum?.roi_daily) || 0,
        target_campaigns: targetCampaigns,
        campaigns: camps.map(c => ({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, ads_count: c.adsCount, spend: Math.round(c.spend) })),
        proposed,
        warning: targetCampaigns === 0 ? 'Khong tim thay campaign nao cho sub nay' : null,
      }
    })

    return NextResponse.json({
      ok: true,
      action,
      action_label: ACTION_LABEL[action],
      percent,
      latestDay,
      total_subs: items.length,
      total_campaigns: items.reduce((s, i) => s + i.target_campaigns, 0),
      items,
      note: 'Day la dry-run. Chua gui request den Facebook.',
    })
  } catch (e: any) {
    console.error('bulk dry-run fatal:', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
