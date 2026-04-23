import { ActionSuggestion } from '@prisma/client'

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

export interface SubIdMetrics {
  subIdNormalized: string
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

function evalCondition(metrics: SubIdMetrics, cond: RuleCondition): boolean {
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
  metrics: SubIdMetrics,
  rules: RuleConfig[]
): { suggestion: ActionSuggestion; reason: string } {
  const sorted = [...rules].filter(r => r.isActive).sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    const conds = rule.conditions || []
    const passed = rule.conditionLogic === 'OR'
      ? conds.some(c => evalCondition(metrics, c))
      : conds.every(c => evalCondition(metrics, c))

    if (passed) {
      return {
        suggestion: rule.suggestion,
        reason: rule.reason
          .replace('{roiDaily}', metrics.roiDaily.toFixed(2))
          .replace('{adsDaily}', metrics.adsDaily.toLocaleString('vi'))
          .replace('{ordersDaily}', String(metrics.ordersDaily))
      }
    }
  }

  return { suggestion: ActionSuggestion.NO_ACTION, reason: 'Khong du dieu kien' }
}

// Default rules
export const DEFAULT_RULES: Omit<RuleConfig, 'id'>[] = [
  {
    name: 'Chi phi qua nho',
    isActive: true,
    priority: 100,
    conditions: [{ field: 'adsDaily', operator: 'lt', value: 50000 }],
    conditionLogic: 'AND',
    suggestion: ActionSuggestion.NO_ACTION,
    reason: 'Chi phi ngay qua nho ({adsDaily}), khong hanh dong',
  },
  {
    name: 'ROI rat thap - Tat ads',
    isActive: true,
    priority: 90,
    conditions: [
      { field: 'roiDaily', operator: 'lt', value: 0.3 },
      { field: 'adsDaily', operator: 'gte', value: 100000 },
    ],
    conditionLogic: 'AND',
    suggestion: ActionSuggestion.PAUSE,
    reason: 'ROI ngay = {roiDaily}, Chi phi = {adsDaily} - Lo nang, nen tat',
  },
  {
    name: 'ROI thap - Giam budget',
    isActive: true,
    priority: 80,
    conditions: [
      { field: 'roiDaily', operator: 'gte', value: 0.3 },
      { field: 'roiDaily', operator: 'lt', value: 0.8 },
    ],
    conditionLogic: 'AND',
    suggestion: ActionSuggestion.DECREASE_20,
    reason: 'ROI ngay = {roiDaily} - Thap, giam budget 20%',
  },
  {
    name: 'ROI on - Giu nguyen',
    isActive: true,
    priority: 70,
    conditions: [
      { field: 'roiDaily', operator: 'gte', value: 0.8 },
      { field: 'roiDaily', operator: 'lt', value: 1.3 },
    ],
    conditionLogic: 'AND',
    suggestion: ActionSuggestion.KEEP,
    reason: 'ROI ngay = {roiDaily} - On dinh, giu nguyen',
  },
  {
    name: 'ROI cao va co don - Tang budget',
    isActive: true,
    priority: 60,
    conditions: [
      { field: 'roiDaily', operator: 'gte', value: 1.3 },
      { field: 'ordersDaily', operator: 'gte', value: 2 },
    ],
    conditionLogic: 'AND',
    suggestion: ActionSuggestion.INCREASE_20,
    reason: 'ROI ngay = {roiDaily}, Don ngay = {ordersDaily} - Loi tot, tang budget 20%',
  },
]
