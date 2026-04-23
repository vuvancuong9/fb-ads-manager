import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseAdsFile } from '@/lib/parser/ads-parser'
import { createHash } from 'crypto'

export const maxDuration = 60
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pickReportDate(rows: { reportDate: string | null }[]): string {
  for (const r of rows) {
    if (r && r.reportDate) {
      const d = new Date(r.reportDate)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return new Date().toISOString()
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileHash = createHash('sha256').update(buffer).digest('hex')

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('uploaded_files').select('id').eq('file_hash', fileHash).maybeSingle()
    if (existingErr) {
      console.error('check existing error:', existingErr)
      return NextResponse.json({ error: 'Khong kiem tra duoc file: ' + existingErr.message, detail: existingErr }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ error: 'File da duoc upload', uploadedFileId: existing.id }, { status: 409 })
    }

    const result = parseAdsFile(buffer)
    const reportDate = pickReportDate([...(result.rows || []), ...(result.errorRows || [])])

    const { data: uploadedFile, error: insertErr } = await supabaseAdmin.from('uploaded_files').insert({
      file_name: file.name,
      file_hash: fileHash,
      file_type: 'ads',
      report_date: reportDate,
      row_count: result.totalRows,
      error_count: result.errorCount,
      status: 'processing',
    }).select().single()

    if (insertErr || !uploadedFile) {
      console.error('insert uploaded_file error:', insertErr)
      return NextResponse.json({
        error: 'Khong tao duoc uploaded_file record: ' + (insertErr?.message || 'unknown'),
        detail: insertErr,
        hint: insertErr?.hint,
        code: insertErr?.code,
      }, { status: 500 })
    }

    const allRows = [...(result.rows || []), ...(result.errorRows || [])]
    const batchSize = 200
    let inserted = 0
    let insertRowsErr: any = null
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize)
      const payload = batch.map(row => ({
        uploaded_file_id: uploadedFile.id,
        row_index: row.rowIndex,
        report_date: row.reportDate ? new Date(row.reportDate).toISOString() : reportDate,
        campaign_id: row.campaignId,
        campaign_name: row.campaignName,
        adset_id: row.adsetId,
        adset_name: row.adsetName,
        ad_id: row.adId,
        ad_name: row.adName,
        sub_id: row.subidRaw,
        spend: row.spend || 0,
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        raw_data: row.rawData || {},
        parse_errors: (row.parseErrors && row.parseErrors.length) ? row.parseErrors.join('; ') : null,
      }))
      const { error: rawErr } = await supabaseAdmin.from('raw_ads_rows').insert(payload)
      if (rawErr) {
        insertRowsErr = rawErr
        break
      }
      inserted += batch.length
    }

    if (insertRowsErr) {
      console.error('insert raw_ads_rows error:', insertRowsErr)
      await supabaseAdmin.from('uploaded_files').update({ status: 'error' }).eq('id', uploadedFile.id)
      return NextResponse.json({
        error: 'Loi khi luu raw_ads_rows: ' + insertRowsErr.message,
        detail: insertRowsErr,
        inserted,
      }, { status: 500 })
    }

    await supabaseAdmin.from('uploaded_files').update({ status: 'parsed' }).eq('id', uploadedFile.id)

    let normalizeStatus: any = null
    try {
      const origin = req.nextUrl.origin
      const r = await fetch(`${origin}/api/normalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadedFileId: uploadedFile.id, type: 'ads' }),
      })
      normalizeStatus = await r.json().catch(() => ({ ok: r.ok }))
    } catch (e: any) {
      normalizeStatus = { ok: false, error: String(e?.message || e) }
    }

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
  } catch (e: any) {
    console.error('upload ads fatal:', e)
    return NextResponse.json({ error: 'Loi khong xac dinh: ' + (e?.message || String(e)) }, { status: 500 })
  }
}
