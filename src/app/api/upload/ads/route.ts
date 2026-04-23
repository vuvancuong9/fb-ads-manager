import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseAdsFile, AdsParsedRow } from '@/lib/parser/ads-parser'
import { runNormalize, NormalizeResult } from '@/lib/services/normalize-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Lay report_date moi nhat hop le trong tat ca rows */
function pickReportDate(rows: AdsParsedRow[]): string | null {
  const valid = rows
    .map((r) => r.report_date)
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (valid.length === 0) return null
  return valid.sort().at(-1) ?? null
}

/** Build insert payload for raw_ads_rows — schema does NOT have subid_normalized/tk_aff */
function buildRawPayload(row: AdsParsedRow, uploadedFileId: string): Record<string, unknown> {
  return {
    uploaded_file_id: uploadedFileId,
    row_index: row.row_index,
    report_date: row.report_date,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id: row.adset_id,
    adset_name: row.adset_name,
    ad_id: row.ad_id,
    ad_name: row.ad_name,
    sub_id: row.sub_id,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    raw_data: row.raw_data,
    parse_errors: row.parse_errors.join('|') || null,
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1) Nhan file
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })

    const arrayBuf = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuf)
    const fileHash = createHash('sha256').update(buf).digest('hex')

    // 2) Kiem tra trung file (hash)
    const { data: existing } = await supabaseAdmin
      .from('uploaded_files')
      .select('id, file_name, report_date, status')
      .eq('file_hash', fileHash)
      .eq('file_type', 'ads')
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json(
        { ok: false, duplicate: true, uploadedFileId: existing.id, fileName: existing.file_name, reportDate: existing.report_date, status: existing.status, message: 'File da duoc upload' },
        { status: 409 }
      )
    }

    // 3) Parse
    const result = await parseAdsFile(arrayBuf, file.name)
    const reportDate = pickReportDate(result.rows)

    // 4) Tao uploaded_files (status = uploading)
    const { data: uf, error: ufErr } = await supabaseAdmin
      .from('uploaded_files')
      .insert({
        file_name: file.name,
        file_size: file.size,
        file_hash: fileHash,
        file_type: 'ads',
        report_date: reportDate,
        row_count: result.totalRows,
        error_count: result.errorCount,
        status: 'uploading',
      })
      .select('id')
      .single()

    if (ufErr || !uf) {
      return NextResponse.json({ error: 'Khong tao duoc uploaded_files: ' + (ufErr?.message ?? 'unknown') }, { status: 500 })
    }

    // 5) Batch insert raw_ads_rows
    const BATCH = 200
    let inserted = 0
    try {
      for (let i = 0; i < result.rows.length; i += BATCH) {
        const chunk = result.rows.slice(i, i + BATCH).map((r) => buildRawPayload(r, uf.id))
        const { error: insErr } = await supabaseAdmin.from('raw_ads_rows').insert(chunk)
        if (insErr) throw new Error(insErr.message)
        inserted += chunk.length
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabaseAdmin
        .from('uploaded_files')
        .update({ status: 'error', raw_path: msg })
        .eq('id', uf.id)
      return NextResponse.json({ ok: false, uploadedFileId: uf.id, error: 'Loi raw insert: ' + msg, inserted }, { status: 500 })
    }

    // 6) Status = parsed
    await supabaseAdmin.from('uploaded_files').update({ status: 'parsed' }).eq('id', uf.id)

    // 7) Normalize (direct service, khong fetch noi bo)
    let normalizeStatus: NormalizeResult = { ok: true }
    try {
      await supabaseAdmin.from('uploaded_files').update({ status: 'processing' }).eq('id', uf.id)
      normalizeStatus = await runNormalize({ uploadedFileId: uf.id, type: 'ads' })
      const finalStatus = normalizeStatus.ok ? 'completed' : 'normalized'
      await supabaseAdmin.from('uploaded_files').update({ status: finalStatus }).eq('id', uf.id)
    } catch (e) {
      normalizeStatus = { ok: false, error: e instanceof Error ? e.message : String(e) }
      await supabaseAdmin.from('uploaded_files').update({ status: 'error', raw_path: normalizeStatus.error }).eq('id', uf.id)
    }

    // 8) Response day du
    return NextResponse.json({
      ok: true,
      uploadedFileId: uf.id,
      reportDate,
      totalRows: result.totalRows,
      errorCount: result.errorCount,
      validCount: result.totalRows - result.errorCount,
      inserted,
      preview: result.preview.slice(0, 20),
      columnMapping: result.columnMapping,
      normalize: normalizeStatus,
    })
  } catch (e) {
    console.error('upload ads fatal:', e)
    return NextResponse.json({ error: 'Loi khong xac dinh: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }
}
