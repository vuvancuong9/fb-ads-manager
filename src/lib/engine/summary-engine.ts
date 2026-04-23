import { prisma } from '@/lib/prisma'
import { getLatestAdsDate, getActiveSubIds, calcRoi } from './calculation'
import { applyRules, SubIdMetrics } from './rule-engine'
import { startOfDay, endOfDay } from 'date-fns'
import { ActionSuggestion } from '@prisma/client'

export async function rebuildSummary(targetDate?: Date) {
  const latestDate = targetDate ?? await getLatestAdsDate()
  if (!latestDate) return { rebuilt: 0, message: 'Khong co du lieu ads' }

  const activeSubIds = await getActiveSubIds(latestDate)

  // Lay all sub IDs co ads trong ngay moi nhat
  const adsToday = await prisma.adsDailyStats.groupBy({
    by: ['subIdNormalized', 'tkAff'],
    where: {
      reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) },
    },
    _sum: { spend: true, impressions: true, clicks: true },
  })

  // Rules
  const dbRules = await prisma.rule.findMany({ where: { isActive: true }, orderBy: { priority: 'asc' } })
  const rules = dbRules.map(r => ({ ...r, conditions: r.conditions as any }))

  let rebuilt = 0

  for (const row of adsToday) {
    const subId = row.subIdNormalized
    const tkAff = row.tkAff

    // Orders ngay
    const ordersToday = await prisma.order.aggregate({
      where: {
        subIdNormalized: subId,
        reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) },
      },
      _sum: { commission: true, orderAmount: true },
      _count: { id: true },
    })

    // Tong hop lich su
    const totalAds = await prisma.adsDailyStats.aggregate({
      where: { subIdNormalized: subId },
      _sum: { spend: true },
    })
    const totalOrders = await prisma.order.aggregate({
      where: { subIdNormalized: subId },
      _sum: { commission: true, orderAmount: true },
      _count: { id: true },
    })

    const adsDaily = row._sum.spend ?? 0
    const commissionDaily = ordersToday._sum.commission ?? 0
    const ordersDaily = ordersToday._count.id ?? 0
    const roiDaily = calcRoi(commissionDaily, adsDaily)
    const totalAdsAllTime = totalAds._sum.spend ?? 0
    const totalCommissionAllTime = totalOrders._sum.commission ?? 0
    const totalOrdersAllTime = totalOrders._count.id ?? 0
    const roiTotal = calcRoi(totalCommissionAllTime, totalAdsAllTime)
    const hasAdsLatestDay = activeSubIds.has(subId)

    const metrics: SubIdMetrics = {
      subIdNormalized: subId,
      tkAff,
      adsDaily,
      ordersDaily,
      commissionDaily,
      roiDaily,
      totalAds: totalAdsAllTime,
      totalOrders: totalOrdersAllTime,
      totalCommission: totalCommissionAllTime,
      roiTotal,
      hasAdsLatestDay,
    }

    const { suggestion, reason } = applyRules(metrics, rules)

    await prisma.subidDailySummary.upsert({
      where: { reportDate_subIdNormalized: { reportDate: latestDate, subIdNormalized: subId } },
      create: {
        reportDate: latestDate,
        subIdNormalized: subId,
        tkAff,
        adsSpend: adsDaily,
        orderCount: ordersDaily,
        totalCommission: commissionDaily,
        roiDaily,
        totalAdsAllTime,
        totalOrdersAllTime,
        totalCommissionAllTime,
        roiTotal,
        hasAdsLatestDay,
        actionSuggestion: suggestion,
        actionReason: reason,
      },
      update: {
        adsSpend: adsDaily,
        orderCount: ordersDaily,
        totalCommission: commissionDaily,
        roiDaily,
        totalAdsAllTime,
        totalOrdersAllTime,
        totalCommissionAllTime,
        roiTotal,
        hasAdsLatestDay,
        actionSuggestion: suggestion,
        actionReason: reason,
      },
    })

    rebuilt++
  }

  return { rebuilt, latestDate }
}
