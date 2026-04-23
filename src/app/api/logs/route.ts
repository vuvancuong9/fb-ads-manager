import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const action = searchParams.get('action')

  const where: any = {}
  if (action) where.action = { contains: action }

  const [data, total] = await Promise.all([
    prisma.actionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.actionLog.count({ where }),
  ])

  return NextResponse.json({ data, total, page, limit })
}
