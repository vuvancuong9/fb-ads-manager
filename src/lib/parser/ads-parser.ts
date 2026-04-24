import * as XLSX from 'xlsx'
import Papa from 'papaparse'

export interface AdsParsedRow {
  row_index: number
  report_date: string | null
  campaign_id: string | null
  campaign_name: string | null
  adset_id: string | null
  adset_name: string | null
  ad_id: string | null
  ad_name: string | null
  sub_id: string | null
  tk_aff: string | null
  spend: number | null
  impressions: number | null
  clicks: number | null
  raw_data: Record<string, unknown>
  parse_errors: string[]
}

export interface AdsParseResult {
  totalRows: number
  errorCount: number
  rows: AdsParsedRow[]
  preview: AdsParsedRow[]
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

/** Find header by exact then substring match on normalized key */
function findCol(headers: string[], aliases: string[]): string | null {
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeKey(h) }))
  // exact match first
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const hit = normHeaders.find((h) => h.norm === a)
    if (hit) return hit.raw
  }
  // substring match
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const hit = normHeaders.find((h) => h.norm.includes(a))
    if (hit) return hit.raw
  }
  return null
}

const ALIAS: Record<string, string[]> = {
  report_date: [
    'luot bat dau bao cao',
    'ngay bat dau bao cao',
    'bat dau bao cao',
    'reporting starts',
    'report date',
    'date',
    'ngay',
    'ngay bao cao',
    'luot ket thuc bao cao',
    'ket thuc bao cao',
    'reporting ends',
  ],
  campaign_id: ['campaign id', 'ma chien dich', 'id chien dich'],
  campaign_name: ['campaign name', 'ten chien dich', 'chien dich'],
  adset_id: ['ad set id', 'adset id', 'ma nhom quang cao'],
  adset_name: ['ad set name', 'adset name', 'ten nhom quang cao', 'nhom quang cao'],
  ad_id: ['ad id', 'ma quang cao'],
  ad_name: ['ad name', 'ten quang cao', 'quang cao'],
  account_name: ['ten tai khoan', 'account name', 'tai khoan'],
  spend: [
    'so tien da chi tieu vnd',
    'so tien da chi tieu',
    'amount spent vnd',
    'amount spent',
    'chi tieu',
    'spend',
  ],
  impressions: ['luot hien thi', 'impressions', 'hien thi', 'tien do phien'],
  clicks: [
    'luot click vao lien ket',
    'link clicks',
    'luot click',
    'clicks all',
    'clicks',
  ],
}

/** Parse date from various formats: Excel serial, "4-Jan", "4/1/2026", ISO */
function parseDateStr(v: unknown): string | null {
  if (v == null || v === '') return null

  // Excel serial number
  if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }
  }

  const s = String(v).trim()
  if (!s) return null

  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`

  // d/m/yyyy or m/d/yyyy — assume d/m/yyyy (VN format)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    let y = parseInt(m[3], 10)
    if (y < 100) y += 2000
    const dd = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    if (dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }

  // "4-Jan" or "4 Jan"
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  m = s.toLowerCase().match(/^(\d{1,2})[\s\-]+([a-z]{3,})/)
  if (m) {
    const dd = parseInt(m[1], 10)
    const mo = MONTHS[m[2].slice(0, 3)]
    if (dd && mo) {
      const y = new Date().getFullYear()
      return `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }

  // Fallback: Date.parse
  const t = Date.parse(s)
  if (!isNaN(t)) {
    const dt = new Date(t)
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  }

  return null
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).replace(/[,\s]/g, '').replace(/[^\d.\-]/g, '')
  if (!s) return null
  const n = parseFloat(s)
  return isFinite(n) ? n : null
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function readRawRows(buf: ArrayBuffer, filename: string): Record<string, unknown>[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buf)
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    })
    return result.data
  }
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
}

export async function parseAdsFile(
  fileBuffer: ArrayBuffer,
  filename: string
): Promise<AdsParseResult> {
  const rawRows = readRawRows(fileBuffer, filename)
  const totalRows = rawRows.length

  if (totalRows === 0) {
    return { totalRows: 0, errorCount: 0, rows: [], preview: [], columnMapping: {}, headersDetected: [] }
  }

  const headers = Object.keys(rawRows[0])
  const mapping: Record<string, string | null> = {
    report_date: findCol(headers, ALIAS.report_date),
    campaign_id: findCol(headers, ALIAS.campaign_id),
    campaign_name: findCol(headers, ALIAS.campaign_name),
    adset_id: findCol(headers, ALIAS.adset_id),
    adset_name: findCol(headers, ALIAS.adset_name),
    ad_id: findCol(headers, ALIAS.ad_id),
    ad_name: findCol(headers, ALIAS.ad_name),
    account_name: findCol(headers, ALIAS.account_name),
    spend: findCol(headers, ALIAS.spend),
    impressions: findCol(headers, ALIAS.impressions),
    clicks: findCol(headers, ALIAS.clicks),
  }

  const rows: AdsParsedRow[] = []
  let errorCount = 0

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i]
    const errs: string[] = []

    const report_date = mapping.report_date ? parseDateStr(r[mapping.report_date]) : null
    if (!report_date) errs.push('Thieu hoac sai ngay bao cao')

    const campaign_name = mapping.campaign_name ? toStr(r[mapping.campaign_name]) : null
    const ad_name = mapping.ad_name ? toStr(r[mapping.ad_name]) : null

    // Extract sub_id pattern from campaign name or ad name
    const extractSubId = (s: string | null): string | null => {
      if (!s) return null
      const matched = s.match(/([A-Z0-9]{4,})/i)
      return matched ? matched[1] : null
    }

    const row: AdsParsedRow = {
      row_index: i,
      report_date,
      campaign_id: mapping.campaign_id ? toStr(r[mapping.campaign_id]) : null,
      campaign_name,
      adset_id: mapping.adset_id ? toStr(r[mapping.adset_id]) : null,
      adset_name: mapping.adset_name ? toStr(r[mapping.adset_name]) : null,
      ad_id: mapping.ad_id ? toStr(r[mapping.ad_id]) : null,
      ad_name,
      sub_id: extractSubId(campaign_name) || extractSubId(ad_name),
      tk_aff: mapping.account_name ? toStr(r[mapping.account_name]) : null,
      spend: mapping.spend ? toNum(r[mapping.spend]) : null,
      impressions: mapping.impressions ? toNum(r[mapping.impressions]) : null,
      clicks: mapping.clicks ? toNum(r[mapping.clicks]) : null,
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
