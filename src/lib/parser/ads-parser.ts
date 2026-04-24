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
  subidNormalized: string | null
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
  if (typeof v === 'number') {
    if (v > 1000 && v < 60000) {
      const d = XLSX.SSF.parse_date_code(v)
      if (d) {
        const y = d.y
        const mo = String(d.m).padStart(2, '0')
        const dd = String(d.d).padStart(2, '0')
        return `${y}-${mo}-${dd}`
      }
    }
    return null
  }

  const s = String(v).trim()
  if (!s) return null

  // ISO: 2026-01-04
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const y = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    const dd = parseInt(m[3], 10)
    if (y > 2000 && mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }

  // d/m/yyyy or m/d/yyyy - e.g. "4/1/2026"
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    const y = parseInt(m[3], 10)
    // Prefer d/m/yyyy (Vietnamese format)
    const dd = a
    const mo = b
    if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) {
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
    if (mo && dd >= 1 && dd <= 31) {
      const y = new Date().getUTCFullYear()
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

/**
 * Dem so alias match cua mot row headers voi ALIAS map
 * De detect header row that su khi FB export co nhieu dong header
 */
function countAliasMatches(candidates: string[]): number {
  const normCandidates = candidates.map(normalizeKey)
  let score = 0
  for (const aliases of Object.values(ALIAS)) {
    for (const alias of aliases) {
      const a = normalizeKey(alias)
      if (normCandidates.some((c) => c === a || c.includes(a))) {
        score++
        break
      }
    }
  }
  return score
}

/**
 * Doc raw rows tu Excel, tu dong detect header row that su
 * De xu ly file Facebook co nhieu dong header (header + sub-header)
 */
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

  // Doc tat ca duoi dang array 2D de detect header row that su
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  if (allRows.length === 0) return []

  // Tim header row: la dong co nhieu alias match nhat
  // Thuong la dong dau tien, nhung FB co the co 2-3 dong header
  let bestRowIdx = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    const row = allRows[i] as unknown[]
    const cells = row.map((c) => String(c ?? ''))
    const score = countAliasMatches(cells)
    if (score > bestScore) {
      bestScore = score
      bestRowIdx = i
    }
  }

  // Build header array tu header row
  const headerRow = allRows[bestRowIdx] as unknown[]
  const headers = headerRow.map((c) => String(c ?? '').trim())

  // Build objects tu cac data rows (sau header row)
  const result: Record<string, unknown>[] = []
  for (let i = bestRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as unknown[]
    // Skip row neu tat ca cell deu null hoac empty
    const hasData = row.some((c) => c != null && String(c).trim() !== '')
    if (!hasData) continue

    const obj: Record<string, unknown> = {}
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j]
      if (key) obj[key] = j < row.length ? row[j] : null
    }
    result.push(obj)
  }

  return result
}

/** Pick report date: lay ngay hop le moi nhat trong file */
function pickReportDate(rows: AdsParsedRow[]): string | null {
  const dates = rows
    .map((r) => r.report_date)
    .filter((d): d is string => d !== null)
    .sort()
    .reverse()
  return dates[0] ?? null
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

    // Extract sub_id: lay pattern tu campaign_name hoac ad_name
    const extractSubId = (s: string | null): string | null => {
      if (!s) return null
      const matched = s.match(/([A-Z0-9]{4,})/i)
      return matched ? matched[1] : null
    }

    const sub_id = extractSubId(campaign_name) || extractSubId(ad_name)
    const subidNormalized = sub_id
      ? sub_id.toLowerCase().replace(/[^a-z0-9]/g, '')
      : null

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
      subidNormalized,
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

export { pickReportDate }
