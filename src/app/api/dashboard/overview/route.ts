import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLatestAdsDate } from '@/lib/engine/calculation'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const latestDate = await getLatestAdsDate()

    const [adsToday, ordersToday, totalAds, totalOrders, subidStats] = await Promise.all([
      latestDate ? prisma.adsDailyStats.aggregate({
        where: { reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) } },
        _sum: { spend: true },
      }) : { _sum: { spend: 0 } },
      latestDate ? prisma.order.aggregate({
        where: { reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) } },
        _sum: { commission: true },
        _count: { id: true },
      }) : { _sum: { commission: 0 }, _count: { id: 0 } },
      prisma.adsDailyStats.aggregate({ _sum: { spend: true } }),
      prisma.order.aggregate({ _sum: { commission: true }, _count: { id: true } }),
      latestDate ? prisma.subidDailySummary.findMany({
        where: { reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) }, hasAdsLatestDay: true },
        select: { roiDaily: true, actionSuggestion: true },
      }) : [],
    ])

    const adsSpendToday = adsToday._sum.spend ?? 0
    const commissionToday = ordersToday._sum.commission ?? 0
    const roiToday = adsSpendToday > 0 ? commissionToday / adsSpendToday : 0
    const totalAdsAllTime = totalAds._sum.spend ?? 0
    const totalCommAllTime = totalOrders._sum.commission ?? 0
    const roiTotal = totalAdsAllTime > 0 ? totalCommAllTime / totalAdsAllTime : 0

    const subStats = subidStats as { roiDaily: number; actionSuggestion: string }[]
    const activeCount = subStats.length
    const profitCount = subStats.filter(s => s.roiDaily >= 1).length
    const lossCount = subStats.filter(s => s.roiDaily < 0.8 && s.roiDaily > 0).length

    return NextResponse.json({
      adsToday: adsSpendToday,
      ordersToday: ordersToday._count.id ?? 0,
      commissionToday,
      roiToday: Math.round(roiToday * 100) / 100,
      totalAds: totalAdsAllTime,
      totalOrders: totalOrders._count.id ?? 0,
      totalCommission: totalCommAllTime,
      roiTotal: Math.round(roiTotal * 100) / 100,
      activeSubCount: activeCount,
      profitSubCount: profitCount,
      lossSubCount: lossCount,
      latestDate: latestDate?.toISOString() ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
