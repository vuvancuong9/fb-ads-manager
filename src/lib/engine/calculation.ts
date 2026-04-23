// Calculation Engine - Affiliate Ads Manager
// Uses Supabase instead of Prisma

import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseSubId, parseTkAff } from './rule-engine'

export async function getLatestAdsDate(): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('ads_daily_stats')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1)
      .single()
    return data?.report_date ?? null
}

export async function getActiveSubids(latestDate: string): Promise<Set<string>> {
    const { data } = await supabaseAdmin
      .from('ads_daily_stats')
      .select('subid_normalized')
      .gte('report_date', latestDate)
      .lte('report_date', latestDate)
      .gt('spend', 0)
    return new Set((data ?? []).map((r: any) => r.subid_normalized))
}

export function calcRoi(commission: number, spend: number): number {
    if (spend <= 0) return 0
    return Math.round((commission / spend) * 100) / 100
}

export function formatSubid(rawSubId: string): { normalized: string; tkAff: string | null } {
    return {
          normalized: parseSubId(rawSubId),
          tkAff: parseTkAff(rawSubId),
    }
}
