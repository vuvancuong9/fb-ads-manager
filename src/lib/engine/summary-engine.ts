// Summary Engine - Affiliate Ads Manager
// Uses Supabase instead of Prisma

import { supabaseAdmin } from '@/lib/supabase-admin'
import { applyRules, applyDefaultRules, ActionSuggestion, SubidMetrics } from './rule-engine'
import { calcRoi } from './calculation'

export interface SubidSummary {
    subid_normalized: string
    tk_aff: string | null
    ads_ngay: number
    don_ngay: number
    hoa_hong_ngay: number
    roi_ngay: number
    tong_ads: number
    tong_hoa_hong: number
    roi_tong: number
    goi_y: ActionSuggestion
    ly_do: string
    ngay_ads: string | null
    has_ads_latest_day: boolean
}

export async function rebuildSummary(targetDate?: string): Promise<{ rebuilt: number; message: string }> {
    let latestDate = targetDate
    if (!latestDate) {
          const { data: dateRow } = await supabaseAdmin
            .from('ads_daily_stats')
            .select('report_date')
            .order('report_date', { ascending: false })
            .limit(1)
            .single()
          latestDate = dateRow?.report_date ?? null
    }

  if (!latestDate) return { rebuilt: 0, message: 'Khong co du lieu ads' }

  const { data: activeAdsRows } = await supabaseAdmin
      .from('ads_daily_stats')
      .select('subid_normalized')
      .eq('report_date', latestDate)
      .gt('spend', 0)

  const activeSubids = new Set((activeAdsRows ?? []).map((r: any) => r.subid_normalized))

  const { data: adsTodayRows } = await supabaseAdmin
      .from('ads_daily_stats')
      .select('subid_normalized, tk_aff, spend')
      .eq('report_date', latestDate)

  const { data: dbRules } = await supabaseAdmin
      .from('rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

  const rules = (dbRules ?? []).map((r: any) => ({ ...r, conditions: r.conditions as any }))

  let rebuilt = 0

  for (const row of (adsTodayRows ?? [])) {
        const subid = row.subid_normalized
        const tkAff = row.tk_aff

      const { data: ordersToday } = await supabaseAdmin
          .from('orders')
          .select('commission')
          .eq('subid_normalized', subid)
          .eq('report_date', latestDate)

      const commissionToday = (ordersToday ?? []).reduce((sum: number, o: any) => sum + (o.commission ?? 0), 0)
        const donNgay = (ordersToday ?? []).length

      const { data: totalAdsRows } = await supabaseAdmin
          .from('ads_daily_stats')
          .select('spend')
          .eq('subid_normalized', subid)

      const tongAds = (totalAdsRows ?? []).reduce((sum: number, r: any) => sum + (r.spend ?? 0), 0)

      const { data: totalOrderRows } = await supabaseAdmin
          .from('orders')
          .select('commission')
          .eq('subid_normalized', subid)

      const tongHoaHong = (totalOrderRows ?? []).reduce((sum: number, o: any) => sum + (o.commission ?? 0), 0)

      const adsNgay = row.spend ?? 0
        const roiNgay = calcRoi(commissionToday, adsNgay)
        const roiTong = calcRoi(tongHoaHong, tongAds)
        const hasAdsLatestDay = activeSubids.has(subid)

      const metrics: SubidMetrics = {
              subidNormalized: subid,
              tkAff,
              adsDaily: adsNgay,
              ordersDaily: donNgay,
              commissionDaily: commissionToday,
              roiDaily: roiNgay,
              totalAds: tongAds,
              totalOrders: (totalOrderRows ?? []).length,
              totalCommission: tongHoaHong,
              roiTotal: roiTong,
              hasAdsLatestDay,
      }

      const { suggestion, reason } = rules.length > 0
          ? applyRules(metrics, rules)
              : applyDefaultRules(metrics)

      await supabaseAdmin
          .from('subid_summary')
          .upsert({
                    subid_normalized: subid,
                    tk_aff: tkAff,
                    ads_ngay: adsNgay,
                    don_ngay: donNgay,
                    hoa_hong_ngay: commissionToday,
                    roi_ngay: roiNgay,
                    tong_ads: tongAds,
                    tong_hoa_hong: tongHoaHong,
                    roi_tong: roiTong,
                    goi_y: suggestion,
                    ly_do: reason,
                    ngay_ads: latestDate,
                    has_ads_latest_day: hasAdsLatestDay,
                    updated_at: new Date().toISOString(),
          }, { onConflict: 'subid_normalized' })

      rebuilt++
  }

  return { rebuilt, message: `Da tinh toan lai ${rebuilt} Sub ID` }
}
