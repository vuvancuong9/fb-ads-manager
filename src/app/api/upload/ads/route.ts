/**
 * POST /api/upload/ads
 *
 * Production-ready ads file upload route.
 * - Auth required (Bearer token or Supabase cookie)
 * - File size limit: 10 MB
 * - File type validation: xlsx / xls / csv
 * - Race-condition protection (in-progress check via file_hash + user_id)
 * - Atomic delete (raw_ads_rows first, then uploaded_files)
 * - Pagination in normalize step (delegates to normalize-service)
 * - Structured logging via createLogger
 * - Standardised JSON responses via api-response helpers
 */

import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseAdsFile, AdsParsedRow, pickReportDate } from '@/lib/parser/ads-parser'
import { runNormalize, NormalizeResult } from '@/lib/services/normalize-service'
import { createLogger } from '@/lib/logger'
import {
      ok,
      badRequest,
      unauthorized,
      conflict,
      tooLarge,
      serverError,
      internalError,
      toErrorMessage,
} from '@/lib/api-response'

// ── Route config ──────────────────────────────────────────────────────────────
export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10 MB
const ALLOWED_MIME   = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain',
    ])
const ALLOWED_EXT = new Set(['xlsx', 'xls', 'csv'])

const log = createLogger('upload/ads')

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRawPayload(
      row: AdsParsedRow,
      uploadedFileId: string,
    ): Record<string, unknown> {
      return {
              uploaded_file_id: uploadedFileId,
              row_index:        row.row_index,
              report_date:      row.report_date,
              campaign_id:      row.campaign_id,
              campaign_name:    row.campaign_name,
              adset_id:         row.adset_id,
              adset_name:       row.adset_name,
              ad_id:            row.ad_id,
              ad_name:          row.ad_name,
              sub_id:           row.sub_id,
              subid_normalized: row.subidNormalized,
              tk_aff:           row.tk_aff,
              spend:            row.spend,
              impressions:      row.impressions,
              clicks:           row.clicks,
              raw_data:         row.raw_data,
              parse_errors:     row.parse_errors?.length ? row.parse_errors.join(' | ') : null,
      }
}

/**
 * Atomically delete an upload: raw rows first (FK-safe), then the file record.
 */
async function deleteUpload(fileId: string): Promise<void> {
      log.info('deleteUpload: removing raw rows', { fileId })
      const { error: e1 } = await supabaseAdmin
        .from('raw_ads_rows')
        .delete()
        .eq('uploaded_file_id', fileId)
      if (e1) log.warn('deleteUpload: error removing raw rows', { fileId, error: e1.message })

  const { error: e2 } = await supabaseAdmin
        .from('uploaded_files')
        .delete()
        .eq('id', fileId)
      if (e2) log.warn('deleteUpload: error removing file record', { fileId, error: e2.message })
}

/**
 * Resolve the authenticated user from Bearer token or Supabase session cookie.
           * Returns null if no valid session.
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
      const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
          // 1. Bearer token
        const authHeader = req.headers.get('authorization') ?? ''
          if (authHeader.startsWith('Bearer ')) {
                    const token = authHeader.slice(7).trim()
                    if (token) {
                                const client = createClient(supabaseUrl, supabaseAnonKey)
                                const { data: { user }, error } = await client.auth.getUser(token)
                                if (!error && user) return user.id
                    }
          }

        // 2. Cookie-based session (Next.js / browser)
        const cookieHeader = req.headers.get('cookie') ?? ''
          const match = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/)
          if (match) {
                    try {
                                const token = decodeURIComponent(match[1])
                                // Cookie may be JSON array [access_token, refresh_token]
                      const parsed = JSON.parse(token)
                                const accessToken = Array.isArray(parsed) ? parsed[0] : (typeof parsed === 'string' ? parsed : null)
                                if (accessToken) {
                                              const client = createClient(supabaseUrl, supabaseAnonKey)
                                              const { data: { user }, error } = await client.auth.getUser(accessToken)
                                              if (!error && user) return user.id
                                }
                    } catch {
                                // Non-JSON cookie value — try raw
                      const raw = decodeURIComponent(match[1])
                                const client = createClient(supabaseUrl, supabaseAnonKey)
                                const { data: { user }, error } = await client.auth.getUser(raw)
                                if (!error && user) return user.id
                    }
          }
  } catch (e) {
          log.error('resolveUserId: unexpected error', { error: toErrorMessage(e) })
  }

  return null
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
      const startMs = Date.now()
      log.info('POST /api/upload/ads: request received')

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  let userId: string
      try {
              const resolved = await resolveUserId(req)
              if (!resolved) {
                        log.warn('POST /api/upload/ads: unauthenticated request rejected')
                        return unauthorized('Vui long dang nhap de upload file')
              }
              userId = resolved
              log.info('POST /api/upload/ads: auth ok', { userId })
      } catch (e) {
              log.error('POST /api/upload/ads: auth error', { error: toErrorMessage(e) })
              return serverError('Loi xac thuc: ' + toErrorMessage(e))
      }

  // ── 2. Parse multipart form ───────────────────────────────────────────────
  let formData: FormData
      try {
              formData = await req.formData()
      } catch (e) {
              log.error('POST /api/upload/ads: failed to parse multipart body', { error: toErrorMessage(e) })
              return badRequest('Khong the doc form data: ' + toErrorMessage(e))
      }

  const file         = formData.get('file') as File | null
      const forceReplace = formData.get('forceReplace') === 'true'

  if (!file || !(file instanceof File)) {
          return badRequest('Khong co file hoac dinh dang khong hop le')
  }

  // ── 3. File validation ────────────────────────────────────────────────────
  const ext      = (file.name ?? '').split('.').pop()?.toLowerCase() ?? ''
      const mimeType = file.type ?? ''

  if (!ALLOWED_MIME.has(mimeType) && !ALLOWED_EXT.has(ext)) {
          log.warn('POST /api/upload/ads: invalid file type', { name: file.name, mime: mimeType, ext })
          return badRequest(
                    `Dinh dang file khong hop le. Chi chap nhan .xlsx, .xls, .csv (nhan duoc: ${ext || mimeType || 'unknown'})`,
                  )
  }

  if (file.size > MAX_FILE_BYTES) {
          log.warn('POST /api/upload/ads: file too large', { bytes: file.size, limit: MAX_FILE_BYTES })
          return tooLarge(
                    `File qua lon: ${(file.size / 1024 / 1024).toFixed(1)} MB. Toi da ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
                  )
  }

  log.info('POST /api/upload/ads: file validated', { name: file.name, size: file.size, ext, userId })

  // ── 4. Read buffer & hash ─────────────────────────────────────────────────
  let buf: Buffer
      let fileHash: string
      try {
              const arrayBuf = await file.arrayBuffer()
              buf      = Buffer.from(arrayBuf)
              fileHash = createHash('sha256').update(buf).digest('hex')
              log.debug('POST /api/upload/ads: buffer read', { bytes: buf.length, hash: fileHash.slice(0, 16) })
      } catch (e) {
              log.error('POST /api/upload/ads: failed to read file buffer', { error: toErrorMessage(e) })
              return serverError('Loi doc file: ' + toErrorMessage(e))
      }

  // ── 5. Race-condition check (in-progress) ─────────────────────────────────
  try {
          const { data: inFlight } = await supabaseAdmin
            .from('uploaded_files')
            .select('id, status')
            .eq('file_hash', fileHash)
            .eq('user_id', userId)
            .in('status', ['uploading', 'processing'])
            .maybeSingle()

        if (inFlight) {
                  log.warn('POST /api/upload/ads: concurrent upload detected', { fileId: inFlight.id, status: inFlight.status })
                  return conflict('File nay dang duoc xu ly. Vui long doi hoan thanh roi thu lai.', { fileId: inFlight.id })
        }
  } catch (e) {
          log.error('POST /api/upload/ads: in-progress check failed', { error: toErrorMessage(e) })
          return serverError('Loi kiem tra trang thai upload: ' + toErrorMessage(e))
  }

  // ── 6. Duplicate check by hash ────────────────────────────────────────────
  try {
          const { data: existingByHash } = await supabaseAdmin
            .from('uploaded_files')
            .select('id, status, report_date')
            .eq('file_hash', fileHash)
            .eq('user_id', userId)
            .in('status', ['completed', 'normalized', 'parsed'])
            .maybeSingle()

        if (existingByHash) {
                  if (!forceReplace) {
                              log.info('POST /api/upload/ads: duplicate hash, returning existing', { fileId: existingByHash.id })
                              return conflict('File nay da duoc upload truoc do', {
                                            duplicate: true,
                                            uploadedFileId: existingByHash.id,
                                            reportDate: existingByHash.report_date,
                              })
                  }
                  log.info('POST /api/upload/ads: forceReplace=true, deleting old upload by hash', { fileId: existingByHash.id })
                  await deleteUpload(existingByHash.id)
        }
  } catch (e) {
          log.error('POST /api/upload/ads: hash duplicate check failed', { error: toErrorMessage(e) })
          return serverError('Loi kiem tra trung lap: ' + toErrorMessage(e))
  }

  // ── 7. Parse file ─────────────────────────────────────────────────────────
  let parseResult: Awaited<ReturnType<typeof parseAdsFile>>
      let reportDate:  string | null
      try {
              log.info('POST /api/upload/ads: parsing file', { name: file.name, bytes: buf.length })
              parseResult = await parseAdsFile(buf, file.name)
              reportDate  = pickReportDate(parseResult.rows)
              log.info('POST /api/upload/ads: parse complete', {
                        totalRows:   parseResult.totalRows,
                        errorCount:  parseResult.errorCount,
                        reportDate,
              })
      } catch (e) {
              log.error('POST /api/upload/ads: parse failed', { error: toErrorMessage(e) })
              return serverError('Loi phan tich file: ' + toErrorMessage(e))
      }

  // ── 8. Duplicate check by report date ────────────────────────────────────
  if (reportDate) {
          try {
                    const { data: existingByDate } = await supabaseAdmin
                      .from('uploaded_files')
                      .select('id, report_date')
                      .eq('report_date', reportDate)
                      .eq('user_id', userId)
                      .eq('type', 'ads')
                      .maybeSingle()

            if (existingByDate) {
                        if (!forceReplace) {
                                      log.info('POST /api/upload/ads: duplicate report_date', { fileId: existingByDate.id, reportDate })
                                      return conflict('Da co file cho ngay bao cao nay', {
                                                      duplicate: true,
                                                      uploadedFileId: existingByDate.id,
                                                      reportDate,
                                      })
                        }
                        log.info('POST /api/upload/ads: forceReplace=true, deleting old upload by date', { fileId: existingByDate.id })
                        await deleteUpload(existingByDate.id)
            }
          } catch (e) {
                    log.error('POST /api/upload/ads: date duplicate check failed', { error: toErrorMessage(e) })
                    return serverError('Loi kiem tra ngay bao cao: ' + toErrorMessage(e))
          }
  }

  // ── 9. Create uploaded_files record ──────────────────────────────────────
  let ufId: string
      try {
              const { data: uf, error: ufErr } = await supabaseAdmin
                .from('uploaded_files')
                .insert({
                            file_name:        file.name,
                            file_hash:        fileHash,
                            file_size:        file.size,
                            report_date:      reportDate,
                            type:             'ads',
                            status:           'uploading',
                            user_id:          userId,
                            total_rows:       parseResult.totalRows,
                            error_count:      parseResult.errorCount,
                            column_mapping:   parseResult.columnMapping,
                            headers_detected: parseResult.headersDetected,
                })
                .select('id')
                .single()

    if (ufErr || !uf) {
              log.error('POST /api/upload/ads: failed to insert uploaded_files', { error: ufErr?.message })
              return serverError('Loi tao ban ghi upload: ' + ufErr?.message)
    }
              ufId = uf.id
              log.info('POST /api/upload/ads: uploaded_files record created', { ufId })
      } catch (e) {
              log.error('POST /api/upload/ads: unexpected error creating upload record', { error: toErrorMessage(e) })
              return internalError(e)
      }

  // ── 10. Insert raw rows in batches of 500 ────────────────────────────────
  let inserted = 0
      const BATCH  = 500
      try {
              log.info('POST /api/upload/ads: inserting raw rows', { total: parseResult.rows.length, batchSize: BATCH })
              for (let i = 0; i < parseResult.rows.length; i += BATCH) {
                        const chunk = parseResult.rows
                          .slice(i, i + BATCH)
                          .map((r: AdsParsedRow) => buildRawPayload(r, ufId))
                        const { error: insErr } = await supabaseAdmin.from('raw_ads_rows').insert(chunk)
                        if (insErr) throw new Error(`Batch ${Math.floor(i / BATCH) + 1}: ${insErr.message}`)
                        inserted += chunk.length
              }
              log.info('POST /api/upload/ads: raw rows inserted', { inserted })
      } catch (e) {
              const msg = toErrorMessage(e)
              log.error('POST /api/upload/ads: raw row insert failed', { error: msg, inserted })
              await supabaseAdmin
                .from('uploaded_files')
                .update({ status: 'error', error_message: msg })
                .eq('id', ufId)
              return serverError('Loi luu raw rows: ' + msg, { uploadedFileId: ufId, inserted })
      }

  // Update status → parsed
  try {
          await supabaseAdmin.from('uploaded_files').update({ status: 'parsed' }).eq('id', ufId)
  } catch (e) {
          log.warn('POST /api/upload/ads: failed to set status=parsed', { ufId, error: toErrorMessage(e) })
  }

  // ── 11. Normalize ─────────────────────────────────────────────────────────
  let normalizeResult: NormalizeResult = { ok: true }
      try {
              log.info('POST /api/upload/ads: starting normalize', { ufId })
              await supabaseAdmin.from('uploaded_files').update({ status: 'processing' }).eq('id', ufId)
              normalizeResult = await runNormalize({ uploadedFileId: ufId, type: 'ads' })
              // Always land on 'completed', not the ambiguous 'normalized'
        await supabaseAdmin.from('uploaded_files').update({ status: 'completed' }).eq('id', ufId)
              log.info('POST /api/upload/ads: normalize complete', { ufId, result: normalizeResult })
      } catch (e) {
              const msg = toErrorMessage(e)
              normalizeResult = { ok: false, error: msg }
              log.error('POST /api/upload/ads: normalize failed', { ufId, error: msg })
              try {
                        await supabaseAdmin
                          .from('uploaded_files')
                          .update({ status: 'error', error_message: msg })
                          .eq('id', ufId)
              } catch (e2) {
                        log.warn('POST /api/upload/ads: failed to set status=error', { ufId, error: toErrorMessage(e2) })
              }
      }

  // ── 12. Return response ───────────────────────────────────────────────────
  const durationMs = Date.now() - startMs
      log.info('POST /api/upload/ads: done', { ufId, inserted, durationMs })

  return ok(
      {
                uploadedFileId:   ufId,
                reportDate,
                totalRows:        parseResult.totalRows,
                errorCount:       parseResult.errorCount,
                validCount:       parseResult.totalRows - parseResult.errorCount,
                inserted,
                preview:          (parseResult.preview ?? []).slice(0, 20),
                columnMapping:    parseResult.columnMapping,
                headersDetected:  parseResult.headersDetected,
                normalize:        normalizeResult,
      },
      { durationMs },
        )
}
