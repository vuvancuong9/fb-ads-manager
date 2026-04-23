import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tkAff = searchParams.get('tkAff')
    const onlyActive = searchParams.get('onlyActive') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100')))
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data: latestRow, error: lerr } = await supabaseAdmin
      .from('subid_daily_summary').select('report_date')
      .order('report_date', { ascending: false }).limit(1).maybeSingle()
    if (lerr) {
      console.error('subids latest error:', lerr)
      return NextResponse.json({ data: [], total: 0, page, limit, latestDate: null, error: lerr.message })
    }
    if (!latestRow) {
      return NextResponse.json({ data: [], total: 0, page, limit, latestDate: null })
    }
    const latestDate: string = latestRow.report_date as string
    const latestDay = latestDate.substring(0, 10)
    const startIso = `${latestDay}T00:00:00Z`
    const endIso = `${latestDay}T23:59:59Z`

    let dailyQ = supabaseAdmin.from('subid_daily_summary')
      .select('*', { count: 'exact' })
      .gte('report_date', startIso).lte('report_date', endIso)
      .order('ads_spend', { ascending: false })
      .range(from, to)
    if (tkAff) dailyQ = dailyQ.eq('tk_aff', tkAff)
    if (onlyActive) dailyQ = dailyQ.eq('has_ads_latest_day', true)

    const { data: dailyRows, count, error: derr } = await dailyQ
    if (derr) {
      console.error('subids daily error:', derr)
      return NextResponse.json({ data: [], total: 0, page, limit, latestDate, error: derr.message })
    }

    const subList = (dailyRows ?? []).map((r: any) => r.sub_id_normalized)
    let totalsBySub = new Map<string, { ads: number, orders: number, comm: number }>()
    if (subList.length) {
      const { data: allRows, error: aerr } = await supabaseAdmin.from('subid_daily_summary')
        .select('sub_id_normalized, ads_spend, order_count, total_commission')
        .in('sub_id_normalized', subList)
      if (aerr) {
        console.error('subids totals error:', aerr)
      } else {
        for (const r of allRows || []) {
          const k = (r as any).sub_id_normalized
          const cur = totalsBySub.get(k) || { ads: 0, orders: 0, comm: 0 }
          cur.ads += Number((r as any).ads_spend) || 0
          cur.orders += Number((r as any).order_count) || 0
          cur.comm += Number((r as any).total_commission) || 0
          totalsBySub.set(k, cur)
        }
      }
    }

    const result = (dailyRows ?? []).map((r: any) => {
      const t = totalsBySub.get(r.sub_id_normalized) || { ads: 0, orders: 0, comm: 0 }
      const roiDay = r.ads_spend > 0 ? r.total_commission / r.ads_spend : 0
      const roiTotal = t.ads > 0 ? t.comm / t.ads : 0
      return {
        sub_id: r.sub_id_normalized,
        tk_aff: r.tk_aff,
        ads_day: Math.round(Number(r.ads_spend) || 0),
        orders_day: Number(r.order_count) || 0,
        commission_day: Math.round(Number(r.total_commission) || 0),
        roi_day: Math.round(roiDay * 100) / 100,
        total_ads: Math.round(t.ads),
        total_orders: t.orders,
        total_commission: Math.round(t.comm),
        roi_total: Math.round(roiTotal * 100) / 100,
        latest_ads_presence: !!r.has_ads_latest_day,
        action_suggestion: r.action_suggestion || 'KEEP',
        action_reason: r.action_reason || '',
      }
    })

    return NextResponse.json({
      data: result,
      total: count ?? result.length,
      page,
      limit,
      latestDate,
    })
  } catch (err: any) {
    console.error('subids fatal:', err)
    return NextResponse.json({ data: [], total: 0, error: err?.message || String(err) }, { status: 500 })
  }
}
