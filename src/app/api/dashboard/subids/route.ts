import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLatestAdsDate } from '@/lib/engine/calculation'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tkAff = searchParams.get('tkAff')
    const onlyActive = searchParams.get('onlyActive') === 'true'
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')
    const skip = (page - 1) * limit

    const latestDate = await getLatestAdsDate()
    if (!latestDate) return NextResponse.json({ data: [], total: 0, page, limit })

    const where: any = {
      reportDate: { gte: startOfDay(latestDate), lte: endOfDay(latestDate) },
    }
    if (tkAff) where.tkAff = tkAff
    if (onlyActive) where.hasAdsLatestDay = true

    const [data, total] = await Promise.all([
      prisma.subidDailySummary.findMany({
        where,
        orderBy: { adsSpend: 'desc' },
        skip,
        take: limit,
      }),
      prisma.subidDailySummary.count({ where }),
    ])

    return NextResponse.json({ data, total, page, limit, latestDate: latestDate.toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
