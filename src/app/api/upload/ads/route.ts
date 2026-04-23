import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseAdsFile } from '@/lib/parser/ads-parser'
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
          const result = parseAdsFile(buffer)
          const reportDate = result.rows[0]?.reportDate ?? result.errorRows[0]?.reportDate ?? null
          const { data: uploadedFile } = await supabaseAdmin.from('uploaded_files').insert({
                  file_name: file.name, file_hash: fileHash, file_type: 'ads',
                  report_date: reportDate, row_count: result.totalRows,
                  error_count: result.errorCount, status: 'processing',
          }).select().single()
          if (!uploadedFile) throw new Error('Khong tao duoc uploaded_file record')
          const batchSize = 100
          if (result.rows.length > 0) {
                  for (let i = 0; i < result.rows.length; i += batchSize) {
                            const batch = result.rows.slice(i, i + batchSize)
                            await supabaseAdmin.from('raw_ads_rows').insert(batch.map(row => ({
                                        uploaded_file_id: uploadedFile.id, row_index: row.rowIndex,
                                        report_date: row.reportDate, campaign_id: row.campaignId,
                                        campaign_name: row.campaignName, adset_id: row.adsetId, adset_name: row.adsetName,
                                        ad_id: row.adId, ad_name: row.adName, sub_id: row.subidNormalized,
                                        spend: row.spend, impressions: row.impressions, clicks: row.clicks, raw_data: row.rawData,
                            })))
                  }
                  for (let i = 0; i < result.rows.length; i += batchSize) {
                            const batch = result.rows.slice(i, i + batchSize)
                            await supabaseAdmin.from('ads_daily_stats').upsert(batch.map(row => ({
                                        report_date: row.reportDate, sub_id_raw: row.subidRaw ?? '',
                                        sub_id_normalized: row.subidNormalized ?? '', tk_aff: row.tkAff,
                                        campaign_id: row.campaignId, campaign_name: row.campaignName,
                                        adset_id: row.adsetId, adset_name: row.adsetName,
                                        ad_id: row.adId ?? '', ad_name: row.adName,
                                        spend: row.spend, impressions: row.impressions, clicks: row.clicks,
                            })), { onConflict: 'report_date,ad_id,sub_id_raw', ignoreDuplicates: true })
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
          console.error('upload ads error:', err)
          return NextResponse.json({ error: err.message || 'Loi server' }, { status: 500 })
    }
}
