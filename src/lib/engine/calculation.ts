import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay } from 'date-fns'

export async function getLatestAdsDate(): Promise<Date | null> {
  const r = await prisma.adsDailyStats.findFirst({
    orderBy: { reportDate: 'desc' },
    select: { reportDate: true },
  })
  return r?.reportDate ?? null
}

export async function getActiveSubIds(latestDate: Date): Promise<Set<string>> {
  const rows = await prisma.adsDailyStats.findMany({
    where: {
      reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) },
      spend: { gt: 0 },
    },
    select: { subIdNormalized: true },
    distinct: ['subIdNormalized'],
  })
  return new Set(rows.map(r => r.subIdNormalized))
}

export function calcRoi(commission: number, spend: number): number {
  if (spend <= 0) return 0
  return Math.round((commission / spend) * 100) / 100
}
