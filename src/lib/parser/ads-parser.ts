import * as XLSX from 'xlsx'
import Papa from 'papaparse'

export type AdsParsedRow = {
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

export type AdsParseResult = {
  totalRows: number
  errorCount: number
  rows: AdsParsedRow[]
  preview: AdsParsedRow[]
  columnMapping: Record<string, string | null>
  headersDetected: string[]
}

/** Strip accents + lowercase + collapse spaces */
function normalizeKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Find first header matching any alias (exact then substring match on normalized key) */
function findCol(headers: string[], aliases: string[]): string | null {
  const normHeaders = headers.map(h => ({ raw: h, norm: normalizeKey(h) }))
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const hit = normHeaders.find(h => h.norm === a)
    if (hit) return hit.raw
  }
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const hit = normHeaders.find(h => h.norm.includes(a))
    if (hit) return hit.raw
  }
  return null
}

const ALIAS: Record<string, string[]> = {
  report_date: [
    'luot bat dau bao cao',
    'ngay bat dau bao cao',
    'reporting starts',
    'report date',
    'date',
    'ngay',
    'ngay bao cao',
    'luot ket thuc bao cao',
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
  impressions: ['luot hien thi', 'impressions', 'hien thi'],
  clicks: [
    'luot click vao lien ket',
    'link clicks',
    'luot click',
    'clicks all',
    'clicks',
  ],
}

/** Parse dates like "4-Jan", "4/1/2026", "2026-01-04", Excel serial number */
function parseDateStr(v: unknown): string | null {
  if (v == null || v === '') return null

  // Excel serial date
  if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) {
      const mm = String(d.m).padStart(2, '0')
      const dd = String(d.d).padStart(2, '0')
      return `${d.y}-${mm}-${dd}`
    }
  }

  const s = String(v).trim()
  if (!s) return null

  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`

  // d/m/yyyy (VN format)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    let y = parseInt(m[3], 10)
    if (y < 100) y += 2000
    const d = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // "4-Jan" or "4 Jan"
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  m = s.toLowerCase().match(/^(\d{1,2})[\s\-]+([a-z]{3,})/)
  if (m) {
    const d = parseInt(m[1], 10)
    const mo = MONTHS[m[2].slice(0, 3)]
    if (d && mo) {
      const y = new Date().getFullYear()
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // Fallback: Date.parse
  const t = Date.parse(s)
  if (!isNaN(t)) {
    const d = new Date(t)
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${d.getUTCFullYear()}-${mm}-${dd}`
  }

  return null
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).replace(/[,\s]/g, '').replace(/[^\d\.\-]/g, '')
  if (!s) return null
  const n = parseFloat(s)
  return isFinite(n) ? n : null
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function readWorkbookFromBuffer(buf: ArrayBuffer, filename: string): Record<string, unknown>[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buf)
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    })
    return (parsed.data || []) as Record<string, unknown>[]
  }
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  })
  return json
}

export async function parseAdsFile(
  fileBuffer: ArrayBuffer,
  filename: string
): Promise<AdsParseResult> {
  const rowsRaw = readWorkbookFromBuffer(fileBuffer, filename)
  const totalRows = rowsRaw.length

  if (totalRows === 0) {
    return {
      totalRows: 0,
      errorCount: 0,
      rows: [],
      preview: [],
      columnMapping: {},
      headersDetected: [],
    }
  }

  const headers = Object.keys(rowsRaw[0] || {})
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

  for (let i = 0; i < rowsRaw.length; i++) {
    const r = rowsRaw[i]
    const errs: string[] = []

    const report_date = mapping.report_date ? parseDateStr(r[mapping.report_date]) : null
    if (!report_date) errs.push('Thieu hoac sai ngay bao cao')

    const campaign_name = mapping.campaign_name ? toStr(r[mapping.campaign_name]) : null
    const ad_name = mapping.ad_name ? toStr(r[mapping.ad_name]) : null

    const tryExtract = (s: string | null): string | null => {
      if (!s) return null
      const m = s.match(/([A-Z0-9]{4,})/i)
      return m ? m[1] : null
    }
    const sub_id = tryExtract(campaign_name) || tryExtract(ad_name)
    const tk_aff = mapping.account_name ? toStr(r[mapping.account_name]) : null

    const row: AdsParsedRow = {
      row_index: i,
      report_date,
      campaign_id: mapping.campaign_id ? toStr(r[mapping.campaign_id]) : null,
      campaign_name,
      adset_id: mapping.adset_id ? toStr(r[mapping.adset_id]) : null,
      adset_name: mapping.adset_name ? toStr(r[mapping.adset_name]) : null,
      ad_id: mapping.ad_id ? toStr(r[mapping.ad_id]) : null,
      ad_name,
      sub_id,
      tk_aff,
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
