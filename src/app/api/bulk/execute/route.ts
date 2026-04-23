import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type BulkAction = 'pause' | 'resume' | 'increase_budget' | 'decrease_budget'

const ACTION_LABEL: Record<BulkAction, string> = {
  pause: 'Tat ads',
  resume: 'Bat ads',
  increase_budget: 'Tang ngan sach',
  decrease_budget: 'Giam ngan sach',
}

async function tryInsertBulkJob(payload: any) {
  try {
    const { data, error } = await supabaseAdmin.from('bulk_jobs').insert(payload).select().single()
    if (error) return { ok: false, error: error.message, code: error.code }
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

async function tryInsertBulkJobItems(items: any[]) {
  try {
    const { error } = await supabaseAdmin.from('bulk_job_items').insert(items)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const action: BulkAction = body?.action
    const subIds: string[] = Array.isArray(body?.subIds) ? body.subIds : []
    const percent: number = Number(body?.percent) || 20
    if (!action || !ACTION_LABEL[action]) {
      return NextResponse.json({ ok: false, error: 'Hanh dong khong hop le' }, { status: 400 })
    }
    if (subIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'Chua chon Sub ID nao' }, { status: 400 })
    }

    const { data: latestRow } = await supabaseAdmin
      .from('subid_daily_summary').select('report_date')
      .order('report_date', { ascending: false }).limit(1).maybeSingle()
    if (!latestRow) {
      return NextResponse.json({ ok: false, error: 'Chua co du lieu' }, { status: 400 })
    }
    const latestDay = (latestRow.report_date as string).substring(0, 10)
    const startIso = `${latestDay}T00:00:00Z`
    const endIso = `${latestDay}T23:59:59Z`

    const { data: adsRows } = await supabaseAdmin
      .from('ads_daily_stats').select('sub_id_normalized, ad_id, campaign_id, campaign_name, adset_id')
      .in('sub_id_normalized', subIds)
      .gte('report_date', startIso).lte('report_date', endIso)

    const targets: any[] = []
    for (const r of adsRows || []) {
      targets.push({
        sub_id: (r as any).sub_id_normalized,
        ad_id: (r as any).ad_id,
        adset_id: (r as any).adset_id,
        campaign_id: (r as any).campaign_id,
        campaign_name: (r as any).campaign_name,
      })
    }

    const jobPayload = {
      action,
      action_label: ACTION_LABEL[action],
      percent,
      sub_ids: subIds,
      total_items: targets.length,
      status: 'queued',
      created_at: new Date().toISOString(),
    }

    let bulkJobId: string | null = null
    const jobInsert = await tryInsertBulkJob(jobPayload)
    if (jobInsert.ok && jobInsert.data?.id) {
      bulkJobId = jobInsert.data.id
      const itemRows = targets.map((t, i) => ({
        bulk_job_id: bulkJobId,
        item_index: i,
        target_kind: 'ad',
        target_id: t.ad_id,
        sub_id: t.sub_id,
        campaign_id: t.campaign_id,
        adset_id: t.adset_id,
        action,
        request_payload: { action, percent, target: t },
        response_payload: null,
        status: 'queued',
      }))
      await tryInsertBulkJobItems(itemRows)
    }

    try {
      await supabaseAdmin.from('action_logs').insert({
        action: 'bulk_' + action,
        target: 'sub_ids',
        target_id: subIds.join(','),
        payload: { subIds, percent, latestDay, items: targets.length, bulkJobId },
        result: bulkJobId ? 'queued' : 'logged_only',
        raw_response: null,
        error: jobInsert.ok ? null : jobInsert.error,
      })
    } catch (e) {}

    return NextResponse.json({
      ok: true,
      bulkJobId,
      action,
      action_label: ACTION_LABEL[action],
      percent,
      total_subs: subIds.length,
      total_items: targets.length,
      note: 'Da ghi nhan job. Hien tai chua goi Facebook API. Khi ket noi xong se chay lai cac item co status=queued.',
      bulk_jobs_status: jobInsert.ok ? 'inserted' : ('skip: ' + jobInsert.error),
    })
  } catch (e: any) {
    console.error('bulk execute fatal:', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
