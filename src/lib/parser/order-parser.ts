import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { ORDER_COLUMN_MAP } from './parser-config'
import { parseSubId, parseTkAff } from './subid-parser'

export interface ParsedOrderRow {
    rowIndex: number
    reportDate: string | null
    orderId: string | null
    subidRaw: string | null
    subidNormalized: string | null
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
    const n = parseFloat(String(val).replace(/[^\d.-]/g, ''))
    return isNaN(n) ? 0 : n
}

function parseDateStr(val: unknown): string | null {
    if (!val) return null
    const s = String(val).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    const m2 = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
    if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`
    return s.substring(0, 10) || null
}

export function parseOrderFile(buffer: ArrayBuffer): OrderParseResult {
    let rawRows: Record<string, unknown>[] = []
        try {
              const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
              const ws = wb.Sheets[wb.SheetNames[0]]
              rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        } catch {
              const text = new TextDecoder().decode(buffer)
              const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
              rawRows = result.data
        }
    if (!rawRows.length) return { rows: [], errorRows: [], preview: [], columnMapping: {}, totalRows: 0, errorCount: 0 }

  const headers = Object.keys(rawRows[0])
    const colMap = ORDER_COLUMN_MAP
    const dateCol = findCol(headers, colMap.reportDate ?? ['ngay','date','order date','created','thoi gian'])
    const orderIdCol = findCol(headers, colMap.orderId ?? ['order id','ma don','id','don hang'])
    const subidCol = findCol(headers, colMap.subid ?? ['subid','sub id','utm_content','tracking','ma gioi thieu'])
    const commissionCol = findCol(headers, colMap.commission ?? ['commission','hoa hong','tien thuong'])
    const orderAmountCol = findCol(headers, colMap.orderAmount ?? ['order amount','gia tri','revenue'])
    const statusCol = findCol(headers, colMap.status ?? ['status','trang thai'])

  const columnMapping: Record<string, string> = {}
      if (dateCol) columnMapping['reportDate'] = dateCol
    if (subidCol) columnMapping['subid'] = subidCol
    if (commissionCol) columnMapping['commission'] = commissionCol

  const rows: ParsedOrderRow[] = []
      const errorRows: ParsedOrderRow[] = []

          rawRows.forEach((r, i) => {
                const errors: string[] = []
                      const subidRaw = subidCol ? String(r[subidCol] ?? '').trim() || null : null
                const reportDate = dateCol ? parseDateStr(r[dateCol]) : null
    if (!reportDate) errors.push('Thieu ngay don hang')
                if (!subidRaw) errors.push('Thieu Sub ID')
                const row: ParsedOrderRow = {
                        rowIndex: i + 2,
                        reportDate,
                        orderId: orderIdCol ? String(r[orderIdCol] ?? '').trim() || null : null,
                        subidRaw,
                        subidNormalized: subidRaw ? parseSubId(subidRaw) : null,
                        tkAff: subidRaw ? parseTkAff(subidRaw) : null,
                        commission: commissionCol ? parseAmount(r[commissionCol]) : 0,
                        orderAmount: orderAmountCol ? parseAmount(r[orderAmountCol]) : 0,
                        status: statusCol ? String(r[statusCol] ?? '').trim() || null : null,
                        rawData: r,
                        parseErrors: errors,
                }
                if (errors.length > 0) errorRows.push(row)
                else rows.push(row)
          })

  return { rows, errorRows, preview: [...rows, ...errorRows].slice(0, 20), columnMapping, totalRows: rawRows.length, errorCount: errorRows.length }
}
