import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data: latestRow } = await supabaseAdmin
      .from('ads_daily_stats').select('report_date').order('report_date', { ascending: false }).limit(1).single()

    const latestDate = latestRow?.report_date
    const latestDay = latestDate?.substring(0, 10)

    const [adsAgg, ordersAgg, totalAdsAgg, totalOrdersAgg, subidStats] = await Promise.all([
      latestDay ? supabaseAdmin.from('ads_daily_stats').select('spend').gte('report_date', latestDay+'T00:00:00Z').lte('report_date', latestDay+'T23:59:59Z') : { data: [] },
      latestDay ? supabaseAdmin.from('orders').select('commission').gte('report_date', latestDay+'T00:00:00Z').lte('report_date', latestDay+'T23:59:59Z') : { data: [] },
      supabaseAdmin.from('ads_daily_stats').select('spend'),
      supabaseAdmin.from('orders').select('commission'),
      latestDay ? supabaseAdmin.from('subid_daily_summary').select('roi_daily,action_suggestion').eq('has_ads_latest_day', true).gte('report_date', latestDay+'T00:00:00Z').lte('report_date', latestDay+'T23:59:59Z') : { data: [] },
    ])

    const adsToday = (adsAgg.data ?? []).reduce((s, r) => s + (r.spend ?? 0), 0)
    const commToday = (ordersAgg.data ?? []).reduce((s, r) => s + (r.commission ?? 0), 0)
    const ordersToday = ordersAgg.data?.length ?? 0
    const totalAds = (totalAdsAgg.data ?? []).reduce((s, r) => s + (r.spend ?? 0), 0)
    const totalComm = (totalOrdersAgg.data ?? []).reduce((s, r) => s + (r.commission ?? 0), 0)
    const totalOrders = totalOrdersAgg.data?.length ?? 0
    const subs = subidStats.data ?? []

    return NextResponse.json({
      adsToday, ordersToday, commissionToday: commToday,
      roiToday: adsToday > 0 ? Math.round(commToday / adsToday * 100) / 100 : 0,
      totalAds, totalOrders, totalCommission: totalComm,
      roiTotal: totalAds > 0 ? Math.round(totalComm / totalAds * 100) / 100 : 0,
      activeSubCount: subs.length,
      profitSubCount: subs.filter((s: any) => s.roi_daily >= 1).length,
      lossSubCount: subs.filter((s: any) => s.roi_daily > 0 && s.roi_daily < 0.8).length,
      latestDate: latestDate ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
