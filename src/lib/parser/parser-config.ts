export interface TkAffPattern { code: string; pattern: RegExp; priority: number }

export const TK_AFF_PATTERNS: TkAffPattern[] = [
  { code: 'VKC',  pattern: /^[0-9]{4}VKC/i,  priority: 10 },
  { code: 'ANN',  pattern: /^[0-9]{4}ANN/i,  priority: 10 },
  { code: 'HANG', pattern: /HANG/i,           priority: 8  },
  { code: 'DNX',  pattern: /^[0-9]{4}DNX/i,  priority: 10 },
  { code: 'MA',   pattern: /^[0-9]{4}MA(?![A-Z])/i, priority: 9 },
]

export const ADS_COLUMN_MAP: Record<string, string[]> = {
  reportDate:   ['ngay', 'date', 'report_date', 'reporting_starts'],
  campaignId:   ['campaign id', 'campaign_id'],
  campaignName: ['campaign name', 'ten chien dich'],
  adsetId:      ['ad set id', 'adset_id'],
  adsetName:    ['ad set name'],
  adId:         ['ad id', 'ad_id'],
  adName:       ['ad name', 'ten quang cao'],
  spend:        ['amount spent', 'chi phi', 'spend', 'so tien da chi'],
  impressions:  ['impressions', 'so lan hien thi'],
  clicks:       ['clicks', 'so nhap'],
}

export const ORDER_COLUMN_MAP: Record<string, string[]> = {
  reportDate:   ['ngay', 'date', 'order_date', 'created_at'],
  orderId:      ['order id', 'order_id', 'ma don'],
  subId:        ['sub id', 'sub_id', 'affiliate id', 'click id', 'subid'],
  commission:   ['hoa hong', 'commission', 'earnings'],
  orderAmount:  ['gia tri don', 'amount', 'revenue', 'gmv'],
  status:       ['trang thai', 'status', 'order_status'],
}