import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ZERO = {
  adsToday: 0,
  ordersToday: 0,
  commissionToday: 0,
  roiToday: 0,
  totalAds: 0,
  totalOrders: 0,
  totalCommission: 0,
  roiTotal: 0,
  activeSubCount: 0,
  profitSubCount: 0,
  lossSubCount: 0,
  latestDate: null as string | null,
}

export async function GET() {
  try {
    const { data: latestRow, error: lerr } = await supabaseAdmin
      .from('ads_daily_stats').select('report_date').order('report_date', { ascending: false }).limit(1).maybeSingle()
    if (lerr) {
      console.error('overview latestRow error:', lerr)
      return NextResponse.json({ ...ZERO, error: lerr.message })
    }
    const latestDate: string | null = latestRow?.report_date || null
    const latestDay: string | null = latestDate ? latestDate.substring(0, 10) : null

    const startIso = latestDay ? `${latestDay}T00:00:00Z` : null
    const endIso = latestDay ? `${latestDay}T23:59:59Z` : null

    const tasks: Promise<any>[] = [
      latestDay
        ? supabaseAdmin.from('ads_daily_stats').select('spend').gte('report_date', startIso!).lte('report_date', endIso!)
        : Promise.resolve({ data: [] }),
      latestDay
        ? supabaseAdmin.from('orders').select('commission').gte('report_date', startIso!).lte('report_date', endIso!)
        : Promise.resolve({ data: [] }),
      supabaseAdmin.from('ads_daily_stats').select('spend'),
      supabaseAdmin.from('orders').select('commission'),
      latestDay
        ? supabaseAdmin.from('subid_daily_summary').select('roi_daily,action_suggestion,has_ads_latest_day').eq('has_ads_latest_day', true).gte('report_date', startIso!).lte('report_date', endIso!)
        : Promise.resolve({ data: [] }),
    ]

    const [adsAgg, ordersAgg, totalAdsAgg, totalOrdersAgg, subidStats] = await Promise.all(tasks)

    const adsToday = (adsAgg.data ?? []).reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0)
    const commToday = (ordersAgg.data ?? []).reduce((s: number, r: any) => s + (Number(r.commission) || 0), 0)
    const ordersToday = ordersAgg.data?.length ?? 0
    const totalAds = (totalAdsAgg.data ?? []).reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0)
    const totalComm = (totalOrdersAgg.data ?? []).reduce((s: number, r: any) => s + (Number(r.commission) || 0), 0)
    const totalOrders = totalOrdersAgg.data?.length ?? 0
    const subs = (subidStats.data ?? []) as any[]
    const activeSubCount = subs.length
    const profitSubCount = subs.filter(s => Number(s.roi_daily) >= 1).length
    const lossSubCount = subs.filter(s => Number(s.roi_daily) < 1).length

    return NextResponse.json({
      adsToday: Math.round(adsToday),
      ordersToday,
      commissionToday: Math.round(commToday),
      roiToday: adsToday > 0 ? Math.round((commToday / adsToday) * 100) / 100 : 0,
      totalAds: Math.round(totalAds),
      totalOrders,
      totalCommission: Math.round(totalComm),
      roiTotal: totalAds > 0 ? Math.round((totalComm / totalAds) * 100) / 100 : 0,
      activeSubCount,
      profitSubCount,
      lossSubCount,
      latestDate,
    })
  } catch (e: any) {
    console.error('overview fatal:', e)
    return NextResponse.json({ ...ZERO, error: 'Loi khong xac dinh: ' + (e?.message || String(e)) })
  }
}
