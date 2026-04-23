import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_RULES } from '@/lib/engine/rule-engine'

export async function GET() {
  const rules = await prisma.rule.findMany({ orderBy: { priority: 'desc' } })
  return NextResponse.json(rules)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rule = await prisma.rule.create({ data: body })
    return NextResponse.json(rule)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

// Seed default rules
export async function PUT() {
  try {
    const existing = await prisma.rule.count()
    if (existing === 0) {
      await prisma.rule.createMany({
        data: DEFAULT_RULES.map(r => ({
          ...r,
          conditions: r.conditions as any,
        })),
      })
    }
    const rules = await prisma.rule.findMany({ orderBy: { priority: 'desc' } })
    return NextResponse.json({ seeded: true, rules })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
