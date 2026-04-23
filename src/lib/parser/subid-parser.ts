// Sub ID Parser
// Logic: if has "-" -> part after last "-", else keep as is

export interface ParsedSubid {
    raw: string
    normalized: string
    tkAff: string | null
}

export function parseSubId(raw: string): string {
    if (!raw) return ''
    const trimmed = raw.trim()
    if (trimmed.includes('-')) {
          return trimmed.split('-').pop()!.trim()
    }
    return trimmed
}

export function parseTkAff(raw: string): string | null {
    if (!raw) return null
    const trimmed = raw.trim()
    const parts = trimmed.split('-')
    if (parts.length > 1) {
          return parts.slice(0, parts.length - 1).join('-').trim() || null
    }
    return null
}

export function parseSubidFull(raw: string): ParsedSubid {
    const trimmed = (raw || '').trim()
    return { raw: trimmed, normalized: parseSubId(trimmed), tkAff: parseTkAff(trimmed) }
}
