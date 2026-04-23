import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { ADS_COLUMN_MAP } from './parser-config'
import { parseSubId, parseTkAff } from './subid-parser'

export interface ParsedAdsRow {
    rowIndex: number
    reportDate: string | null
    campaignId: string | null
    campaignName: string | null
    adsetId: string | null
    adsetName: string | null
    adId: string | null
    adName: string | null
    subidRaw: string | null
    subidNormalized: string | null
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
    const n = parseFloat(String(val).replace(/[^\d.-]/g, ''))
    return isNaN(n) ? 0 : n
}

function parseDateStr(val: unknown): string | null {
    if (!val) return null
    const s = String(val).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    const n = parseInt(s)
    if (!isNaN(n) && n > 40000) {
          try {
                  const d = (XLSX.SSF as any).parse_date_code(n)
                  if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
          } catch {}
    }
    return s.substring(0, 10) || null
}

export function parseAdsFile(buffer: ArrayBuffer): AdsParseResult {
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
    const colMap = ADS_COLUMN_MAP
    const dateCol = findCol(headers, colMap.reportDate ?? ['report date','ngay','date','reporting starts'])
    const spendCol = findCol(headers, colMap.spend ?? ['spend','chi phi','amount spent','cost'])
    const subidCol = findCol(headers, colMap.subid ?? ['subid','sub id','utm_content','tracking'])
    const campIdCol = findCol(headers, colMap.campaignId ?? ['campaign id'])
    const campNameCol = findCol(headers, colMap.campaignName ?? ['campaign name','ten chien dich'])
    const adsetIdCol = findCol(headers, colMap.adsetId ?? ['adset id','ad set id'])
    const adsetNameCol = findCol(headers, colMap.adsetName ?? ['adset name','ad set name','nhom quang cao'])
    const adIdCol = findCol(headers, colMap.adId ?? ['ad id'])
    const adNameCol = findCol(headers, colMap.adName ?? ['ad name','ten quang cao'])
    const impressionsCol = findCol(headers, colMap.impressions ?? ['impressions','hien thi'])
    const clicksCol = findCol(headers, colMap.clicks ?? ['clicks','luot nhan','link clicks'])

  const columnMapping: Record<string, string> = {}
      if (dateCol) columnMapping['reportDate'] = dateCol
    if (spendCol) columnMapping['spend'] = spendCol
    if (subidCol) columnMapping['subid'] = subidCol

  const rows: ParsedAdsRow[] = []
      const errorRows: ParsedAdsRow[] = []

          rawRows.forEach((r, i) => {
                const errors: string[] = []
                      const subidRaw = subidCol ? String(r[subidCol] ?? '').trim() || null : null
                const reportDate = dateCol ? parseDateStr(r[dateCol]) : null
                if (!reportDate) errors.push('Thieu ngay bao cao')
                const spend = spendCol ? parseAmount(r[spendCol]) : 0
                const row: ParsedAdsRow = {
                        rowIndex: i + 2,
                        reportDate,
                        campaignId: campIdCol ? String(r[campIdCol] ?? '').trim() || null : null,
                        campaignName: campNameCol ? String(r[campNameCol] ?? '').trim() || null : null,
                        adsetId: adsetIdCol ? String(r[adsetIdCol] ?? '').trim() || null : null,
                        adsetName: adsetNameCol ? String(r[adsetNameCol] ?? '').trim() || null : null,
                        adId: adIdCol ? String(r[adIdCol] ?? '').trim() || null : null,
                        adName: adNameCol ? String(r[adNameCol] ?? '').trim() || null : null,
                        subidRaw,
                        subidNormalized: subidRaw ? parseSubId(subidRaw) : null,
                        tkAff: subidRaw ? parseTkAff(subidRaw) : null,
                        spend,
                        impressions: impressionsCol ? parseAmount(r[impressionsCol]) : 0,
                        clicks: clicksCol ? parseAmount(r[clicksCol]) : 0,
                        rawData: r,
                        parseErrors: errors,
                }
                if (errors.length > 0) errorRows.push(row)
                else rows.push(row)
          })

  return { rows, errorRows, preview: [...rows, ...errorRows].slice(0, 20), columnMapping, totalRows: rawRows.length, errorCount: errorRows.length }
}
