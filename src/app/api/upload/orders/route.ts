import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseOrderFile } from '@/lib/parser/order-parser'
import { createHash } from 'crypto'

export const maxDuration = 60
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    const result = parseOrderFile(buffer)
    const reportDate = result.rows[0]?.reportDate ?? result.errorRows[0]?.reportDate ?? null

    const { data: uploadedFile, error: insertErr } = await supabaseAdmin.from('uploaded_files').insert({
      file_name: file.name, file_hash: fileHash, file_type: 'orders',
      report_date: reportDate, row_count: result.totalRows,
      error_count: result.errorCount, status: 'processing',
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

    const batchSize = 100
    if (result.rows.length > 0) {
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize)
        const { error: rawErr } = await supabaseAdmin.from('raw_order_rows').insert(batch.map(row => ({
          uploaded_file_id: uploadedFile.id, row_index: row.rowIndex,
          report_date: row.reportDate, order_id: row.orderId,
          sub_id: row.subidRaw, tk_aff: row.tkAff,
          commission: row.commission, order_amount: row.orderAmount,
          status: row.status, raw_data: row.rawData,
        })))
        if (rawErr) {
          console.error('insert raw_order_rows error:', rawErr)
          return NextResponse.json({ error: 'Loi insert raw_order_rows: ' + rawErr.message, detail: rawErr }, { status: 500 })
        }
      }
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize)
        const { error: ordErr } = await supabaseAdmin.from('orders').insert(batch.map(row => ({
          report_date: row.reportDate, order_id: row.orderId,
          sub_id_raw: row.subidRaw ?? '', sub_id_normalized: row.subidNormalized ?? '',
          tk_aff: row.tkAff, commission: row.commission,
          order_amount: row.orderAmount, status: row.status,
        })))
        if (ordErr) {
          console.error('insert orders error:', ordErr)
          return NextResponse.json({ error: 'Loi insert orders: ' + ordErr.message, detail: ordErr }, { status: 500 })
        }
      }
    }

    await supabaseAdmin.from('uploaded_files').update({ status: 'done' }).eq('id', uploadedFile.id)

    return NextResponse.json({
      success: true, uploadedFileId: uploadedFile.id,
      totalRows: result.totalRows, savedRows: result.rows.length,
      errorCount: result.errorCount, preview: result.preview.slice(0, 20),
      columnMapping: result.columnMapping,
    })
  } catch (err: any) {
    console.error('upload orders error:', err)
    return NextResponse.json({ error: err?.message || 'Loi server', stack: err?.stack }, { status: 500 })
  }
}
