import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseAdsFile, AdsParsedRow } from '@/lib/parser/ads-parser'
import { runNormalize, NormalizeResult } from '@/lib/services/normalize-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Lay report_date moi nhat hop le trong file */
function pickReportDate(rows: AdsParsedRow[]): string | null {
  const valid = rows
    .map(r => r.report_date)
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (valid.length === 0) return null
  valid.sort()
  return valid[valid.length - 1]
}

type RawPayload = Record<string, unknown>

function buildRawPayload(
  row: AdsParsedRow,
  uploadedFileId: string,
  includeAffFields: boolean
): RawPayload {
  const base: RawPayload = {
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
    parse_errors: row.parse_errors,
  }
  if (includeAffFields) {
    base.subid_normalized = row.sub_id ? String(row.sub_id).toLowerCase() : null
    base.tk_aff = row.tk_aff
  }
  return base
}

export async function POST(req: NextRequest) {
  try {
    // 1) Nhan file
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Khong co file' }, { status: 400 })
    }

    const arrayBuf = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuf)

    // 2) Hash file
    const fileHash = createHash('sha256').update(buf).digest('hex')

    // 3) Check duplicate theo hash
    const { data: existing } = await supabaseAdmin
      .from('uploaded_files')
      .select('id, file_name, file_hash, report_date, status, created_at')
      .eq('file_hash', fileHash)
      .eq('file_type', 'ads')
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json(
        {
          ok: false,
          duplicate: true,
          uploadedFileId: existing.id,
          fileName: existing.file_name,
          reportDate: existing.report_date,
          status: existing.status,
          message: 'File da duoc upload truoc do',
        },
        { status: 409 }
      )
    }

    // 4) Parse file
    const result = await parseAdsFile(arrayBuf, file.name)
    const reportDate = pickReportDate(result.rows)

    // 5) Tao record uploaded_files
    const { data: uploadedFile, error: ufErr } = await supabaseAdmin
      .from('uploaded_files')
      .insert({
        file_name: file.name,
        file_size: file.size,
        file_hash: fileHash,
        file_type: 'ads',
        report_date: reportDate,
        total_rows: result.totalRows,
        error_count: result.errorCount,
        status: 'uploading',
      })
      .select('id')
      .single()

    if (ufErr || !uploadedFile) {
      return NextResponse.json(
        { error: 'Khong tao duoc uploaded_files: ' + (ufErr?.message || 'unknown') },
        { status: 500 }
      )
    }

    // 6) Insert raw_ads_rows theo batch, co fallback neu schema thieu cot
    const BATCH = 200
    let inserted = 0
    let includeAffFields = true

    try {
      for (let i = 0; i < result.rows.length; i += BATCH) {
        const chunk = result.rows.slice(i, i + BATCH)
        let payload = chunk.map(r => buildRawPayload(r, uploadedFile.id, includeAffFields))

        let { error: insErr } = await supabaseAdmin.from('raw_ads_rows').insert(payload)

        if (insErr && /subid_normalized|tk_aff|column .* does not exist/i.test(insErr.message)) {
          includeAffFields = false
          payload = chunk.map(r => buildRawPayload(r, uploadedFile.id, false))
          const retry = await supabaseAdmin.from('raw_ads_rows').insert(payload)
          insErr = retry.error
        }

        if (insErr) {
          throw new Error(insErr.message)
        }
        inserted += chunk.length
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabaseAdmin
        .from('uploaded_files')
        .update({ status: 'error', error_message: msg })
        .eq('id', uploadedFile.id)

      return NextResponse.json(
        {
          ok: false,
          uploadedFileId: uploadedFile.id,
          error: 'Loi luu raw_ads_rows: ' + msg,
          inserted,
          totalRows: result.totalRows,
        },
        { status: 500 }
      )
    }

    // 7) Update status = parsed
    await supabaseAdmin
      .from('uploaded_files')
      .update({ status: 'parsed' })
      .eq('id', uploadedFile.id)

    // 8) Normalize qua service (khong fetch noi bo)
    let normalizeStatus: NormalizeResult
    try {
      normalizeStatus = await runNormalize({
        uploadedFileId: uploadedFile.id,
        type: 'ads',
      })
    } catch (e) {
      normalizeStatus = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }

    // 9) Response day du
    return NextResponse.json({
      ok: true,
      uploadedFileId: uploadedFile.id,
      reportDate,
      totalRows: result.totalRows,
      errorCount: result.errorCount,
      validCount: (result.totalRows || 0) - (result.errorCount || 0),
      inserted,
      preview: (result.preview || []).slice(0, 20),
      columnMapping: result.columnMapping || {},
      normalize: normalizeStatus,
    })
  } catch (e) {
    console.error('upload ads fatal:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'Loi khong xac dinh: ' + msg },
      { status: 500 }
    )
  }
}
