// Rule Engine - Affiliate Ads Manager
// ROI < 0.3 → tắt | ROI 0.3-0.8 → giảm | ROI 0.8-1.3 → giữ | ROI > 1.3 → tăng

export type ActionSuggestion = 'PAUSE' | 'DECREASE_20' | 'KEEP' | 'INCREASE_20' | 'NO_ACTION'

export interface RuleCondition {
    field: 'roiDaily' | 'adsDaily' | 'ordersDaily' | 'roiTotal' | 'totalAds'
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
    value: number
}

export interface RuleConfig {
    id: string
    name: string
    isActive: boolean
    priority: number
    conditions: RuleCondition[]
    conditionLogic: 'AND' | 'OR'
    suggestion: ActionSuggestion
    reason: string
}

export interface SubidMetrics {
    subidNormalized: string
    tkAff: string | null
    adsDaily: number
    ordersDaily: number
    commissionDaily: number
    roiDaily: number
    totalAds: number
    totalOrders: number
    totalCommission: number
    roiTotal: number
    hasAdsLatestDay: boolean
}

function evalCondition(metrics: SubidMetrics, cond: RuleCondition): boolean {
    const val = metrics[cond.field]
    switch (cond.operator) {
      case 'gt': return val > cond.value
      case 'gte': return val >= cond.value
      case 'lt': return val < cond.value
      case 'lte': return val <= cond.value
      case 'eq': return val === cond.value
      default: return false
    }
}

export function applyRules(
    metrics: SubidMetrics,
    rules: RuleConfig[]
  ): { suggestion: ActionSuggestion; reason: string } {
    const sorted = [...rules].filter(r => r.isActive).sort((a, b) => b.priority - a.priority)
    for (const rule of sorted) {
          const results = rule.conditions.map(c => evalCondition(metrics, c))
          const matched = rule.conditionLogic === 'AND' ? results.every(Boolean) : results.some(Boolean)
          if (matched) return { suggestion: rule.suggestion, reason: rule.reason }
    }
    return { suggestion: 'NO_ACTION', reason: 'Không có quy tắc phù hợp' }
}

// Default ROI-based rules (built-in fallback)
export function applyDefaultRules(metrics: SubidMetrics): { suggestion: ActionSuggestion; reason: string } {
    const roi = metrics.roiDaily
    if (roi < 0.3) return { suggestion: 'PAUSE', reason: 'ROI < 0.3 - Tắt ngay' }
    if (roi < 0.8) return { suggestion: 'DECREASE_20', reason: 'ROI 0.3-0.8 - Giảm ngân sách 20%' }
    if (roi <= 1.3) return { suggestion: 'KEEP', reason: 'ROI 0.8-1.3 - Giữ nguyên' }
    return { suggestion: 'INCREASE_20', reason: 'ROI > 1.3 - Tăng ngân sách 20%' }
}

// Parse Sub ID: if has "-" → take part after last "-", else keep as is
export function parseSubId(rawSubId: string): string {
    if (!rawSubId) return rawSubId
    const parts = rawSubId.split('-')
    return parts.length > 1 ? parts[parts.length - 1] : rawSubId
}

// Parse TK AFF from prefix (e.g. "SHOP123-abc123" → "SHOP123")
export function parseTkAff(rawSubId: string): string | null {
    if (!rawSubId) return null
    const parts = rawSubId.split('-')
    return parts.length > 1 ? parts.slice(0, parts.length - 1).join('-') : null
}

export const ACTION_LABELS: Record<ActionSuggestion, string> = {
    PAUSE: 'Tắt ads',
    DECREASE_20: 'Giảm 20%',
    KEEP: 'Giữ nguyên',
    INCREASE_20: 'Tăng 20%',
    NO_ACTION: 'Không làm gì',
}

export const ACTION_COLORS: Record<ActionSuggestion, string> = {
    PAUSE: 'bg-red-100 text-red-700 border-red-200',
    DECREASE_20: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    KEEP: 'bg-blue-100 text-blue-700 border-blue-200',
    INCREASE_20: 'bg-green-100 text-green-700 border-green-200',
    NO_ACTION: 'bg-gray-100 text-gray-600 border-gray-200',
}
