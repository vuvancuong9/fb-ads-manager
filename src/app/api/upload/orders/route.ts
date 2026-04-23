import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseOrderFile } from '@/lib/parser/order-parser'
import { createHash } from 'crypto'

export async function POST(req: NextRequest) {
    try {
          const formData = await req.formData()
          const file = formData.get('file') as File
          if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })
          const buffer = Buffer.from(await file.arrayBuffer())
          const fileHash = createHash('sha256').update(buffer).digest('hex')
          const { data: existing } = await supabaseAdmin.from('uploaded_files').select('id').eq('file_hash', fileHash).single()
          if (existing) return NextResponse.json({ error: 'File da duoc upload', uploadedFileId: existing.id }, { status: 409 })
          const result = parseOrderFile(buffer)
          const reportDate = result.rows[0]?.reportDate ?? result.errorRows[0]?.reportDate ?? null
          const { data: uploadedFile } = await supabaseAdmin.from('uploaded_files').insert({
                  file_name: file.name, file_hash: fileHash, file_type: 'orders',
                  report_date: reportDate, row_count: result.totalRows,
                  error_count: result.errorCount, status: 'processing',
          }).select().single()
          if (!uploadedFile) throw new Error('Khong tao duoc record')
          const batchSize = 100
          if (result.rows.length > 0) {
                  for (let i = 0; i < result.rows.length; i += batchSize) {
                            const batch = result.rows.slice(i, i + batchSize)
                            await supabaseAdmin.from('raw_order_rows').insert(batch.map(row => ({
                                        uploaded_file_id: uploadedFile.id, row_index: row.rowIndex,
                                        report_date: row.reportDate, order_id: row.orderId,
                                        sub_id: row.subidRaw, tk_aff: row.tkAff,
                                        commission: row.commission, order_amount: row.orderAmount,
                                        status: row.status, raw_data: row.rawData,
                            })))
                  }
                  for (let i = 0; i < result.rows.length; i += batchSize) {
                            const batch = result.rows.slice(i, i + batchSize)
                            await supabaseAdmin.from('orders').insert(batch.map(row => ({
                                        report_date: row.reportDate, order_id: row.orderId,
                                        sub_id_raw: row.subidRaw ?? '', sub_id_normalized: row.subidNormalized ?? '',
                                        tk_aff: row.tkAff, commission: row.commission,
                                        order_amount: row.orderAmount, status: row.status,
                            })))
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
          return NextResponse.json({ error: err.message || 'Loi server' }, { status: 500 })
    }
}
