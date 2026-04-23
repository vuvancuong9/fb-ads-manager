import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { ADS_COLUMN_MAP } from './parser-config'
import { parseSubId } from './subid-parser'
import { parse as parseDate, isValid, startOfDay } from 'date-fns'

export interface ParsedAdsRow {
  rowIndex: number
  reportDate: Date | null
  campaignId: string | null
  campaignName: string | null
  adsetId: string | null
  adsetName: string | null
  adId: string | null
  adName: string | null
  subIdRaw: string | null
  subIdNormalized: string | null
  tkAff: string | null
  spend: number
  impressions: number
  clicks: number
  rawData: Record<string, unknown>
  parseErrors: string[]
}

export interface AdsParseResult {
  rows: ParsedAdsRow[]
  errorRows: ParsedAdsRow[]
  preview: ParsedAdsRow[]
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

export async function parseAdsFile(buffer: Buffer, filename: string): Promise<AdsParseResult> {
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
  for (const [field, aliases] of Object.entries(ADS_COLUMN_MAP)) {
    const found = findCol(headers, aliases)
    if (found) colMap[field] = found
  }

  const rows: ParsedAdsRow[] = []
  const errorRows: ParsedAdsRow[] = []

  rawRows.forEach((raw, idx) => {
    const errors: string[] = []
    const reportDate = parseFlexDate(colMap.reportDate ? raw[colMap.reportDate] : null)
    if (!reportDate) errors.push('Khong xac dinh duoc ngay bao cao')

    const adName = colMap.adName ? String(raw[colMap.adName] ?? '').trim() || null : null
    const { raw: subIdRaw, normalized: subIdNormalized, tkAff } = adName ? parseSubId(adName) : { raw: null, normalized: null, tkAff: null }

    const parsed: ParsedAdsRow = {
      rowIndex: idx + 1,
      reportDate,
      campaignId: colMap.campaignId ? String(raw[colMap.campaignId] ?? '').trim() || null : null,
      campaignName: colMap.campaignName ? String(raw[colMap.campaignName] ?? '').trim() || null : null,
      adsetId: colMap.adsetId ? String(raw[colMap.adsetId] ?? '').trim() || null : null,
      adsetName: colMap.adsetName ? String(raw[colMap.adsetName] ?? '').trim() || null : null,
      adId: colMap.adId ? String(raw[colMap.adId] ?? '').trim() || null : null,
      adName,
      subIdRaw,
      subIdNormalized,
      tkAff,
      spend: parseAmount(colMap.spend ? raw[colMap.spend] : 0),
      impressions: parseInt(String(colMap.impressions ? raw[colMap.impressions] : 0)) || 0,
      clicks: parseInt(String(colMap.clicks ? raw[colMap.clicks] : 0)) || 0,
      rawData: raw,
      parseErrors: errors,
    }
    if (errors.length) errorRows.push(parsed)
    else rows.push(parsed)
  })

  return { rows, errorRows, preview: [...rows, ...errorRows].slice(0, 20), columnMapping: colMap, totalRows: rawRows.length, errorCount: errorRows.length }
}