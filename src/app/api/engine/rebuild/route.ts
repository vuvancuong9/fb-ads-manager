import { NextRequest, NextResponse } from 'next/server'
import { rebuildSummary } from '@/lib/engine/summary-engine'

export async function POST(req: NextRequest) {
  try {
    const result = await rebuildSummary()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
