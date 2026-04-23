import { TK_AFF_PATTERNS } from './parser-config'

export interface ParsedSubId { raw: string; normalized: string; tkAff: string | null }

export function parseSubId(raw: string): ParsedSubId {
  if (!raw) return { raw: '', normalized: '', tkAff: null }
  const trimmed = raw.trim()
  const normalized = trimmed.includes('-') ? trimmed.split('-').pop()!.trim() : trimmed
  return { raw: trimmed, normalized, tkAff: detectTkAff(normalized) }
}

export function detectTkAff(subId: string): string | null {
  const sorted = [...TK_AFF_PATTERNS].sort((a, b) => b.priority - a.priority)
  for (const { code, pattern } of sorted) {
    if (pattern.test(subId)) return code
  }
  const match = subId.match(/^[0-9]{4}([A-Z]+)/i)
  return match ? match[1].toUpperCase() : null
}