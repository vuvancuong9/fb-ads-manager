import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { parseSubId, parseTkAff } from '@/lib/parser/subid-parser'

export interface ParsedOrderRow {
  row_index: number
  report_date: string | null
  order_id: string | null
  order_time: string | null
  click_time: string | null
  completed_time: string | null
  sub_id_raw: string | null
  sub_id_normalized: string | null
  tk_aff: string | null
  total_commission: number | null
  order_amount: number | null
  status: string | null
  raw_data: Record<string, unknown>
  parse_errors: string[]
}

export interface OrderParseResult {
  totalRows: number
  errorCount: number
  rows: ParsedOrderRow[]
  preview: ParsedOrderRow[]
  columnMapping: Record<string, string | null>
  headersDetected: string[]
}

/** Strip diacritics + lowercase + collapse whitespace */
function normalizeKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findCol(headers: string[], aliases: string[]): string | null {
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeKey(h) }))
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const hit = normHeaders.find((h) => h.norm === a)
    if (hit) return hit.raw
  }
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const hit = normHeaders.find((h) => h.norm.includes(a))
    if (hit) return hit.raw
  }
  return null
}

const ORDER_ALIAS: Record<string, string[]> = {
  order_id: ['ma don hang', 'order id', 'orderid', 'order_id', 'ma don'],
  order_time: ['thoi gian dat hang', 'order time', 'order date', 'ngay dat hang'],
  click_time: ['thoi gian click', 'click time'],
  completed_time: ['thoi gian hoan thanh', 'completed time', 'completion time'],
  sub_id: ['sub id', 'subid', 'sub_id', 'ma sub', 'tracking id', 'aff sub'],
  tk_aff: ['tai khoan aff', 'tk aff', 'account', 'publisher', 'ma doi tac'],
  commission: ['hoa hong', 'commission', 'so hoa hong', 'tien hoa hong', 'total commission'],
  order_amount: ['gia tri don hang', 'order amount', 'order value', 'tong gia tri'],
  status: ['trang thai', 'status', 'tinh trang'],
}

function parseAmount(val: unknown): number | null {
  if (!val && val !== 0) return null
  if (typeof val === 'number') return isFinite(val) ? val : null
  const n = parseFloat(String(val).replace(/[,\s]/g, '').replace(/[^\d.\-]/g, ''))
  return isFinite(n) ? n : null
}

function parseDateStr(val: unknown): string | null {
  if (val == null || val === '') return null
  if (typeof val === 'number' && isFinite(val) && val > 20000 && val < 80000) {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    let y = parseInt(m[3], 10); if (y < 100) y += 2000
    const dd = parseInt(m[1], 10); const mo = parseInt(m[2], 10)
    if (dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12)
      return `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }
  const t = Date.parse(s)
  if (!isNaN(t)) {
    const dt = new Date(t)
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  }
  return null
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function readRawRows(buf: ArrayBuffer, filename: string): Record<string, unknown>[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buf)
    const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
    return result.data
  }
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
}

export async function parseOrderFile(
  fileBuffer: ArrayBuffer,
  filename: string
): Promise<OrderParseResult> {
  const rawRows = readRawRows(fileBuffer, filename)
  const totalRows = rawRows.length

  if (totalRows === 0) {
    return { totalRows: 0, errorCount: 0, rows: [], preview: [], columnMapping: {}, headersDetected: [] }
  }

  const headers = Object.keys(rawRows[0])
  const mapping: Record<string, string | null> = {
    order_id: findCol(headers, ORDER_ALIAS.order_id),
    order_time: findCol(headers, ORDER_ALIAS.order_time),
    click_time: findCol(headers, ORDER_ALIAS.click_time),
    completed_time: findCol(headers, ORDER_ALIAS.completed_time),
    sub_id: findCol(headers, ORDER_ALIAS.sub_id),
    tk_aff: findCol(headers, ORDER_ALIAS.tk_aff),
    commission: findCol(headers, ORDER_ALIAS.commission),
    order_amount: findCol(headers, ORDER_ALIAS.order_amount),
    status: findCol(headers, ORDER_ALIAS.status),
  }

  const rows: ParsedOrderRow[] = []
  let errorCount = 0

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i]
    const errs: string[] = []

    const order_time = mapping.order_time ? parseDateStr(r[mapping.order_time]) : null
    const report_date = order_time

    const order_id = mapping.order_id ? toStr(r[mapping.order_id]) : null
    if (!order_id) errs.push('Thieu ma don hang')

    const sub_id_raw = mapping.sub_id ? toStr(r[mapping.sub_id]) : null
    const sub_id_normalized = sub_id_raw ? (parseSubId(sub_id_raw) || sub_id_raw) : null
    const tk_aff = mapping.tk_aff ? toStr(r[mapping.tk_aff]) : (sub_id_raw ? parseTkAff(sub_id_raw) : null)

    const row: ParsedOrderRow = {
      row_index: i,
      report_date,
      order_id,
      order_time,
      click_time: mapping.click_time ? parseDateStr(r[mapping.click_time]) : null,
      completed_time: mapping.completed_time ? parseDateStr(r[mapping.completed_time]) : null,
      sub_id_raw,
      sub_id_normalized,
      tk_aff,
      total_commission: mapping.commission ? parseAmount(r[mapping.commission]) : null,
      order_amount: mapping.order_amount ? parseAmount(r[mapping.order_amount]) : null,
      status: mapping.status ? toStr(r[mapping.status]) : null,
      raw_data: r,
      parse_errors: errs,
    }

    if (errs.length > 0) errorCount++
    rows.push(row)
  }

  return {
    totalRows,
    errorCount,
    rows,
    preview: rows.slice(0, 20),
    columnMapping: mapping,
    headersDetected: headers,
  }
}
