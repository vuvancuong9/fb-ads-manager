import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { ORDER_COLUMN_MAP } from './parser-config'
import { parseSubId } from './subid-parser'
import { parse as parseDate, isValid, startOfDay } from 'date-fns'

export interface ParsedOrderRow {
  rowIndex: number
  reportDate: Date | null
  orderId: string | null
  subIdRaw: string | null
  subIdNormalized: string | null
  tkAff: string | null
  commission: number
  orderAmount: number
  status: string | null
  rawData: Record<string, unknown>
  parseErrors: string[]
}

export interface OrderParseResult {
  rows: ParsedOrderRow[]
  errorRows: ParsedOrderRow[]
  preview: ParsedOrderRow[]
  columnMapping: Record<string, string>
  totalRows: number
  errorCount: number
}

function normalizeKey(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}
function findCol(headers: string[], aliases: string[]): string | null {
  const norm = headers.map(h => ({ o: h, k: normalizeKey(h) }))
  for (const a of aliases) {
    const f = norm.find(h => h.k.includes(a.toLowerCase()))
    if (f) return f.o
  }
  return null
}
function parseAmount(val: unknown): number {
  if (!val && val !== 0) return 0
  const n = parseFloat(String(val).replace(/[,\s₫đ]/g, ''))
  return isNaN(n) ? 0 : n
}
function parseFlexDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return isValid(val) ? startOfDay(val) : null
  const s = String(val).trim()
  for (const fmt of ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd-MM-yyyy']) {
    const d = parseDate(s, fmt, new Date())
    if (isValid(d)) return startOfDay(d)
  }
  return null
}

export async function parseOrderFile(buffer: Buffer, filename: string): Promise<OrderParseResult> {
  let rawRows: Record<string, unknown>[] = []
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as Record<string, unknown>[]
  } else {
    const result = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), { header: true, skipEmptyLines: true })
    rawRows = result.data
  }
  if (!rawRows.length) return { rows: [], errorRows: [], preview: [], columnMapping: {}, totalRows: 0, errorCount: 0 }

  const headers = Object.keys(rawRows[0])
  const colMap: Record<string, string> = {}
  for (const [field, aliases] of Object.entries(ORDER_COLUMN_MAP)) {
    const found = findCol(headers, aliases)
    if (found) colMap[field] = found
  }

  const rows: ParsedOrderRow[] = []
  const errorRows: ParsedOrderRow[] = []

  rawRows.forEach((raw, idx) => {
    const errors: string[] = []
    const reportDate = parseFlexDate(colMap.reportDate ? raw[colMap.reportDate] : null)
    if (!reportDate) errors.push('Khong xac dinh duoc ngay')
    const subIdRaw = colMap.subId ? String(raw[colMap.subId] ?? '').trim() || null : null
    const { normalized: subIdNormalized, tkAff } = subIdRaw ? parseSubId(subIdRaw) : { normalized: null, tkAff: null }

    const parsed: ParsedOrderRow = {
      rowIndex: idx + 1,
      reportDate,
      orderId: colMap.orderId ? String(raw[colMap.orderId] ?? '').trim() || null : null,
      subIdRaw,
      subIdNormalized,
      tkAff,
      commission: parseAmount(colMap.commission ? raw[colMap.commission] : 0),
      orderAmount: parseAmount(colMap.orderAmount ? raw[colMap.orderAmount] : 0),
      status: colMap.status ? String(raw[colMap.status] ?? '').trim() || null : null,
      rawData: raw,
      parseErrors: errors,
    }
    if (errors.length) errorRows.push(parsed)
    else rows.push(parsed)
  })

  return { rows, errorRows, preview: [...rows, ...errorRows].slice(0, 20), columnMapping: colMap, totalRows: rawRows.length, errorCount: errorRows.length }
}