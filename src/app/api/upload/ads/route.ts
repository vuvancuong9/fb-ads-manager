import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseAdsFile, AdsParsedRow, pickReportDate } from '@/lib/parser/ads-parser'
import { runNormalize, NormalizeResult } from '@/lib/services/normalize-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function buildRawPayload(row: AdsParsedRow, uploadedFileId: string): Record<string, unknown> {
  return {
    uploaded_file_id: uploadedFileId,
    row_index: row.row_index,
    report_date: row.report_date,   // Nullable after migration
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id: row.adset_id,
    adset_name: row.adset_name,
    ad_id: row.ad_id,
    ad_name: row.ad_name,
    sub_id: row.sub_id,
    subid_normalized: row.subidNormalized,
    tk_aff: row.tk_aff,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    raw_data: row.raw_data,
    parse_errors: row.parse_errors.length > 0 ? row.parse_errors.join(' | ') : null,
  }
}

async function deleteExistingUpload(existingId: string): Promise<void> {
  await supabaseAdmin.from('raw_ads_rows').delete().eq('uploaded_file_id', existingId)
  await supabaseAdmin.from('uploaded_files').delete().eq('id', existingId)
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const forceReplace = formData.get('forceReplace') === 'true'
    if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })

    const arrayBuf = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuf)
    const fileHash = createHash('sha256').update(buf).digest('hex')

    // Kiem tra trung file hash
    const { data: existing } = await supabaseAdmin
      .from('uploaded_files')
      .select('id, file_name, file_hash, report_date, status, created_at')
      .eq('file_hash', fileHash)
      .eq('file_type', 'ads')
      .maybeSingle()

    if (existing?.id) {
      if (!forceReplace) {
        return NextResponse.json(
          {
            ok: false,
            code: 'DUPLICATE_FILE',
            message: 'File nay da duoc upload truoc do',
            uploadedFileId: existing.id,
            existingStatus: existing.status,
            existingCreatedAt: existing.created_at,
          },
          { status: 409 }
        )
      }
      await deleteExistingUpload(existing.id)
    }

    // Parse file
    const result = await parseAdsFile(arrayBuf, file.name)
    const reportDate = pickReportDate(result.rows)

    // Log debug info khi co nhieu loi
    if (result.errorCount > 0) {
      console.log('[upload/ads] columnMapping:', JSON.stringify(result.columnMapping))
      console.log('[upload/ads] headersDetected:', JSON.stringify(result.headersDetected))
      console.log('[upload/ads] errorCount:', result.errorCount, '/', result.totalRows)
      if (result.rows.length > 0) {
        console.log('[upload/ads] row0 parse_errors:', result.rows[0].parse_errors)
        console.log('[upload/ads] row0 report_date:', result.rows[0].report_date)
      }
    }

    // Tao uploaded_files record
    const { data: uf, error: ufErr } = await supabaseAdmin
      .from('uploaded_files')
      .insert({
        file_name: file.name,
        file_size: file.size,
        file_hash: fileHash,
        file_type: 'ads',
        report_date: reportDate,   // Nullable - ok sau migration
        row_count: result.totalRows,
        error_count: result.errorCount,
        status: 'uploading',
      })
      .select('id')
      .single()

    if (ufErr || !uf) {
      console.error('[upload/ads] insert uploaded_files error:', ufErr?.message)
      return NextResponse.json(
        { ok: false, error: 'Loi tao uploaded_files: ' + ufErr?.message },
        { status: 500 }
      )
    }

    // Insert raw rows theo batch
    let inserted = 0
    const BATCH = 500

    try {
      for (let i = 0; i < result.rows.length; i += BATCH) {
        const chunk = result.rows.slice(i, i + BATCH).map((r) => buildRawPayload(r, uf.id))
        const { error: insErr } = await supabaseAdmin.from('raw_ads_rows').insert(chunk)
        if (insErr) throw new Error(insErr.message)
        inserted += chunk.length
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[upload/ads] insert raw_ads_rows error:', msg)
      await supabaseAdmin
        .from('uploaded_files')
        .update({ status: 'error', error_message: msg })
        .eq('id', uf.id)
      return NextResponse.json(
        { ok: false, uploadedFileId: uf.id, error: 'Loi luu raw: ' + msg, inserted },
        { status: 500 }
      )
    }

    // Update status = parsed
    await supabaseAdmin.from('uploaded_files').update({ status: 'parsed' }).eq('id', uf.id)

    // Normalize truc tiep (khong fetch noi bo)
    let normalizeStatus: NormalizeResult = { ok: true }
    try {
      await supabaseAdmin.from('uploaded_files').update({ status: 'processing' }).eq('id', uf.id)
      normalizeStatus = await runNormalize({ uploadedFileId: uf.id, type: 'ads' })
      const finalStatus = normalizeStatus.ok ? 'completed' : 'normalized'
      await supabaseAdmin.from('uploaded_files').update({ status: finalStatus }).eq('id', uf.id)
    } catch (e) {
      normalizeStatus = { ok: false, error: e instanceof Error ? e.message : String(e) }
      console.error('[upload/ads] normalize error:', normalizeStatus.error)
      await supabaseAdmin
        .from('uploaded_files')
        .update({ status: 'error', error_message: normalizeStatus.error })
        .eq('id', uf.id)
    }

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
      headersDetected: result.headersDetected,
      normalize: normalizeStatus,
    })
  } catch (e) {
    console.error('[upload/ads] fatal:', e)
    return NextResponse.json(
      { ok: false, error: 'Loi khong xac dinh: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500 }
    )
  }
}
