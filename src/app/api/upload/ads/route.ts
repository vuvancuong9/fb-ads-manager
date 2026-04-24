import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { parseAdsFile, AdsParsedRow, pickReportDate } from '@/lib/parser/ads-parser'
import { runNormalize, NormalizeResult } from '@/lib/services/normalize-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed MIME types
const ALLOWED_MIME = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
  ]

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
          subid_normalized: row.subidNormalized,
          tk_aff: row.tk_aff,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          raw_data: row.raw_data,
          parse_errors: row.parse_errors.length > 0 ? row.parse_errors.join(' | ') : null,
    }
}

// FIX: Atomic delete — delete raw rows first, then the file record
async function deleteExistingUpload(existingId: string): Promise<void> {
    await supabaseAdmin.from('raw_ads_rows').delete().eq('uploaded_file_id', existingId)
    await supabaseAdmin.from('uploaded_files').delete().eq('id', existingId)
}

export async function POST(req: NextRequest) {
    // FIX: Auth check — verify session before processing any upload
  const authHeader = req.headers.get('authorization')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  let userId: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '')
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
        if (authError || !user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        userId = user.id
  } else {
        // Try cookie-based session via admin client
      const cookieHeader = req.headers.get('cookie') ?? ''
        const accessTokenMatch = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/)
        if (!accessTokenMatch) {
                return NextResponse.json({ error: 'Unauthorized: No session found' }, { status: 401 })
        }
        const token = decodeURIComponent(accessTokenMatch[1])
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
        if (authError || !user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        userId = user.id
  }

  try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const forceReplace = formData.get('forceReplace') === 'true'
        if (!file) return NextResponse.json({ error: 'Khong co file' }, { status: 400 })

      // FIX: File size validation — reject files over 10MB
      if (file.size > MAX_FILE_SIZE) {
              return NextResponse.json(
                { error: `File qua lon. Toi da ${MAX_FILE_SIZE / 1024 / 1024}MB, ban upload ${(file.size / 1024 / 1024).toFixed(1)}MB` },
                { status: 400 }
                      )
      }

      // FIX: File type validation — only allow xlsx and csv
      const mimeType = file.type || ''
        const fileName = file.name || ''
        const ext = fileName.split('.').pop()?.toLowerCase()
        if (!ALLOWED_MIME.includes(mimeType) && ext !== 'xlsx' && ext !== 'csv' && ext !== 'xls') {
                return NextResponse.json(
                  { error: 'Dinh dang file khong hop le. Chi chap nhan .xlsx, .xls, .csv' },
                  { status: 400 }
                        )
        }

      const arrayBuf = await file.arrayBuffer()
        const buf = Buffer.from(arrayBuf)
        const fileHash = createHash('sha256').update(buf).digest('hex')

      // FIX: Race condition prevention — check for in-progress upload with same hash
      const { data: inProgressFile } = await supabaseAdmin
          .from('uploaded_files')
          .select('id, status')
          .eq('file_hash', fileHash)
          .eq('user_id', userId)
          .in('status', ['uploading', 'processing'])
          .maybeSingle()

      if (inProgressFile) {
              return NextResponse.json(
                { error: 'File nay dang duoc xu ly. Vui long cho.' },
                { status: 409 }
                      )
      }

      // Check for existing completed upload with same hash
      const { data: existingByHash } = await supabaseAdmin
          .from('uploaded_files')
          .select('id, status')
          .eq('file_hash', fileHash)
          .eq('user_id', userId)
          .in('status', ['completed', 'normalized'])
          .maybeSingle()

      if (existingByHash && !forceReplace) {
              return NextResponse.json(
                {
                            ok: false,
                            error: 'duplicate',
                            uploadedFileId: existingByHash.id,
                            message: 'File nay da duoc upload truoc do',
                },
                { status: 409 }
                      )
      }

      if (existingByHash && forceReplace) {
              await deleteExistingUpload(existingByHash.id)
      }

      // Parse the file
      const result = await parseAdsFile(buf, fileName)
        const reportDate = pickReportDate(result.rows)

      // Check for existing upload by report date (same user)
      if (!forceReplace) {
              const { data: existingByDate } = await supabaseAdmin
                .from('uploaded_files')
                .select('id')
                .eq('report_date', reportDate)
                .eq('user_id', userId)
                .eq('type', 'ads')
                .maybeSingle()

          if (existingByDate) {
                    return NextResponse.json(
                      {
                                    ok: false,
                                    error: 'duplicate',
                                    uploadedFileId: existingByDate.id,
                                    message: 'Da co file cho ngay bao cao nay',
                      },
                      { status: 409 }
                              )
          }
      } else {
              // forceReplace by date — delete existing
          const { data: existingByDate } = await supabaseAdmin
                .from('uploaded_files')
                .select('id')
                .eq('report_date', reportDate)
                .eq('user_id', userId)
                .eq('type', 'ads')
                .maybeSingle()

          if (existingByDate) {
                    await deleteExistingUpload(existingByDate.id)
          }
      }

      // Create uploaded_files record with status 'uploading'
      const { data: uf, error: ufErr } = await supabaseAdmin
          .from('uploaded_files')
          .insert({
                    file_name: file.name,
                    file_hash: fileHash,
                    file_size: file.size,
                    report_date: reportDate,
                    type: 'ads',
                    status: 'uploading',
                    user_id: userId,
                    total_rows: result.totalRows,
                    error_count: result.errorCount,
                    column_mapping: result.columnMapping,
                    headers_detected: result.headersDetected,
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

      // Insert raw rows in batches
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

      // Update status to parsed
      await supabaseAdmin.from('uploaded_files').update({ status: 'parsed' }).eq('id', uf.id)

      // Normalize inline (no background fetch needed)
      let normalizeStatus: NormalizeResult = { ok: true }
        try {
                await supabaseAdmin.from('uploaded_files').update({ status: 'processing' }).eq('id', uf.id)
                normalizeStatus = await runNormalize({ uploadedFileId: uf.id, type: 'ads' })
                // FIX: 'normalized' dead-end — always set final status to 'completed'
          await supabaseAdmin.from('uploaded_files').update({ status: 'completed' }).eq('id', uf.id)
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
