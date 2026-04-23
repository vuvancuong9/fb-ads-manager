import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    // Get latest date
    const { data: latestRow } = await supabaseAdmin
      .from('ads_daily_stats')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1)
      .single()

    if (!latestRow) return NextResponse.json({ message: 'Khong co du lieu ads' })

    const latestDate = latestRow.report_date
    const latestDay = latestDate.substring(0, 10)

    // Get all sub IDs with ads on latest date
    const { data: adsToday } = await supabaseAdmin
      .from('ads_daily_stats')
      .select('sub_id_normalized, tk_aff, spend')
      .gte('report_date', latestDay + 'T00:00:00Z')
      .lte('report_date', latestDay + 'T23:59:59Z')

    if (!adsToday?.length) return NextResponse.json({ rebuilt: 0 })

    // Get rules
    const { data: rulesData } = await supabaseAdmin.from('rules').select('*').eq('is_active', true).order('priority', { ascending: false })
    const rules = rulesData ?? []

    // Group by sub_id
    const subMap = new Map<string, { tkAff: string | null; adsDaily: number }>()
    for (const row of adsToday) {
      const existing = subMap.get(row.sub_id_normalized)
      if (existing) existing.adsDaily += row.spend
      else subMap.set(row.sub_id_normalized, { tkAff: row.tk_aff, adsDaily: row.spend })
    }

    let rebuilt = 0
    const upserts = []

    for (const [subId, { tkAff, adsDaily }] of subMap) {
      // Orders today
      const { data: ordersToday } = await supabaseAdmin
        .from('orders')
        .select('commission, order_amount')
        .eq('sub_id_normalized', subId)
        .gte('report_date', latestDay + 'T00:00:00Z')
        .lte('report_date', latestDay + 'T23:59:59Z')

      const commissionToday = ordersToday?.reduce((s, r) => s + (r.commission ?? 0), 0) ?? 0
      const ordersCount = ordersToday?.length ?? 0

      // All time
      const { data: allAds } = await supabaseAdmin.from('ads_daily_stats').select('spend').eq('sub_id_normalized', subId)
      const { data: allOrders } = await supabaseAdmin.from('orders').select('commission').eq('sub_id_normalized', subId)

      const totalAds = allAds?.reduce((s, r) => s + (r.spend ?? 0), 0) ?? 0
      const totalComm = allOrders?.reduce((s, r) => s + (r.commission ?? 0), 0) ?? 0
      const totalOrders = allOrders?.length ?? 0
      const roiDaily = adsDaily > 0 ? commissionToday / adsDaily : 0
      const roiTotal = totalAds > 0 ? totalComm / totalAds : 0

      // Apply rules
      let suggestion = 'NO_ACTION', reason = 'Khong du dieu kien'
      const metrics: any = { subId, tkAff, adsDaily, ordersDaily: ordersCount, commissionDaily: commissionToday, roiDaily, totalAds, totalOrders, totalCommission: totalComm, roiTotal }

      for (const rule of rules) {
        const conds = (rule.conditions as any[]) || []
        const passed = rule.condition_logic === 'OR'
          ? conds.some((c: any) => evalCond(metrics, c))
          : conds.every((c: any) => evalCond(metrics, c))
        if (passed) {
          suggestion = rule.suggestion
          reason = rule.reason
            .replace('{roiDaily}', roiDaily.toFixed(2))
            .replace('{adsDaily}', Math.round(adsDaily).toLocaleString('vi'))
            .replace('{ordersDaily}', String(ordersCount))
          break
        }
      }

      upserts.push({
        report_date: latestDate, sub_id_normalized: subId, tk_aff: tkAff,
        ads_spend: adsDaily, order_count: ordersCount, total_commission: commissionToday,
        roi_daily: Math.round(roiDaily * 100) / 100,
        total_ads_all_time: totalAds, total_orders_all_time: totalOrders,
        total_commission_all_time: totalComm,
        roi_total: Math.round(roiTotal * 100) / 100,
        has_ads_latest_day: true,
        action_suggestion: suggestion, action_reason: reason,
      })
      rebuilt++
    }

    if (upserts.length > 0) {
      await supabaseAdmin.from('subid_daily_summary').upsert(upserts, { onConflict: 'report_date,sub_id_normalized' })
    }

    return NextResponse.json({ success: true, rebuilt, latestDate })
  } catch (err: any) {
    console.error('Rebuild error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function evalCond(metrics: any, cond: any): boolean {
  const val = metrics[cond.field] ?? 0
  switch (cond.operator) {
    case 'gt': return val > cond.value
    case 'gte': return val >= cond.value
    case 'lt': return val < cond.value
    case 'lte': return val <= cond.value
    case 'eq': return val === cond.value
    default: return false
  }
}
