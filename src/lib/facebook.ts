const FB_API_VERSION = 'v21.0'
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`

interface FbApiOptions {
  accessToken: string
  params?: Record<string, string>
}

async function fbGet(endpoint: string, { accessToken, params = {} }: FbApiOptions) {
  const url = new URL(`${FB_BASE_URL}${endpoint}`)
  url.searchParams.set('access_token', accessToken)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Facebook API error')
  }
  return res.json()
}

async function fbPost(endpoint: string, { accessToken, params = {} }: FbApiOptions) {
  const url = new URL(`${FB_BASE_URL}${endpoint}`)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Facebook API error')
  }
  return res.json()
}

export async function getAdAccountInfo(accountId: string, accessToken: string) {
  return fbGet(`/${accountId}`, {
    accessToken,
    params: {
      fields: 'id,name,account_id,currency,timezone_name,account_status,business',
    },
  })
}

export async function getAdAccountCampaigns(accountId: string, accessToken: string) {
  return fbGet(`/${accountId}/campaigns`, {
    accessToken,
    params: {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,created_time,updated_time',
      limit: '500',
    },
  })
}

export async function getAdSets(campaignId: string, accessToken: string) {
  return fbGet(`/${campaignId}/adsets`, {
    accessToken,
    params: {
      fields: 'id,name,status,daily_budget,lifetime_budget,bid_amount,optimization_goal,targeting',
      limit: '500',
    },
  })
}

export async function getAds(adsetId: string, accessToken: string) {
  return fbGet(`/${adsetId}/ads`, {
    accessToken,
    params: {
      fields: 'id,name,status,creative{id,thumbnail_url}',
      limit: '500',
    },
  })
}

export async function getCampaignInsights(
  campaignId: string,
  accessToken: string,
  dateRange: { since: string; until: string }
) {
  return fbGet(`/${campaignId}/insights`, {
    accessToken,
    params: {
      fields: 'impressions,clicks,inline_link_clicks,inline_link_click_ctr,spend,reach,cpm,cpc,ctr,actions,cost_per_action_type,action_values,frequency',
      time_range: JSON.stringify(dateRange),
      time_increment: '1',
      limit: '500',
    },
  })
}

export async function getAccountInsights(
  accountId: string,
  accessToken: string,
  dateRange: { since: string; until: string },
  level: 'campaign' | 'adset' | 'ad' = 'campaign'
) {
  return fbGet(`/${accountId}/insights`, {
    accessToken,
    params: {
      fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,inline_link_clicks,inline_link_click_ctr,spend,reach,cpm,cpc,ctr,actions,cost_per_action_type,action_values,frequency',
      time_range: JSON.stringify(dateRange),
      time_increment: '1',
      level,
      limit: '1000',
    },
  })
}

export async function updateCampaignStatus(
  campaignId: string,
  status: 'ACTIVE' | 'PAUSED',
  accessToken: string
) {
  return fbPost(`/${campaignId}`, {
    accessToken,
    params: { status },
  })
}

export async function updateAdSetStatus(
  adsetId: string,
  status: 'ACTIVE' | 'PAUSED',
  accessToken: string
) {
  return fbPost(`/${adsetId}`, {
    accessToken,
    params: { status },
  })
}

export async function updateAdStatus(
  adId: string,
  status: 'ACTIVE' | 'PAUSED',
  accessToken: string
) {
  return fbPost(`/${adId}`, {
    accessToken,
    params: { status },
  })
}

export async function updateCampaignBudget(
  campaignId: string,
  budget: { daily_budget?: number; lifetime_budget?: number },
  accessToken: string
) {
  const params: Record<string, string> = {}
  if (budget.daily_budget) params.daily_budget = String(Math.round(budget.daily_budget * 100))
  if (budget.lifetime_budget) params.lifetime_budget = String(Math.round(budget.lifetime_budget * 100))

  return fbPost(`/${campaignId}`, { accessToken, params })
}

export async function getPixels(accountId: string, accessToken: string) {
  return fbGet(`/${accountId}/adspixels`, {
    accessToken,
    params: { fields: 'id,name' },
  })
}

export async function getPages(accessToken: string) {
  return fbGet('/me/accounts', {
    accessToken,
    params: { fields: 'id,name,access_token' },
  })
}

export async function createCampaign(
  accountId: string,
  accessToken: string,
  data: {
    name: string
    objective: string
    status: string
    daily_budget?: number
    lifetime_budget?: number
    bid_strategy?: string
    special_ad_categories?: string[]
  }
) {
  const params: Record<string, string> = {
    name: data.name,
    objective: data.objective,
    status: data.status,
    special_ad_categories: JSON.stringify(data.special_ad_categories || []),
  }
  if (data.daily_budget) params.daily_budget = String(Math.round(data.daily_budget * 100))
  if (data.lifetime_budget) params.lifetime_budget = String(Math.round(data.lifetime_budget * 100))
  if (data.bid_strategy) params.bid_strategy = data.bid_strategy

  return fbPost(`/${accountId}/campaigns`, { accessToken, params })
}

export async function createAdSet(
  accountId: string,
  accessToken: string,
  data: {
    name: string
    campaign_id: string
    optimization_goal: string
    billing_event: string
    daily_budget?: number
    lifetime_budget?: number
    bid_amount?: number
    targeting: Record<string, unknown>
    status: string
    start_time?: string
    end_time?: string
  }
) {
  return fbPost(`/${accountId}/adsets`, {
    accessToken,
    params: data as unknown as Record<string, string>,
  })
}

const OBJECTIVE_TO_ACTION: Record<string, string> = {
  'OUTCOME_LEADS': 'offsite_conversion.fb_pixel_lead',
  'LEAD_GENERATION': 'offsite_conversion.fb_pixel_lead',
  'OUTCOME_SALES': 'offsite_conversion.fb_pixel_purchase',
  'CONVERSIONS': 'offsite_conversion.fb_pixel_purchase',
  'PRODUCT_CATALOG_SALES': 'offsite_conversion.fb_pixel_purchase',
  'OUTCOME_APP_PROMOTION': 'app_install',
  'APP_INSTALLS': 'app_install',
  'OUTCOME_TRAFFIC': 'link_click',
  'LINK_CLICKS': 'link_click',
}

export function parseActions(
  actions: Array<{ action_type: string; value: string }> | null | undefined,
  objective?: string
) {
  if (!actions) return { conversions: 0, linkClicks: 0 }

  let conversions = 0
  let linkClicks = 0

  const targetAction = objective ? OBJECTIVE_TO_ACTION[objective] : null

  for (const action of actions) {
    if (targetAction && action.action_type === targetAction) {
      conversions += parseInt(action.value, 10)
    }
    if (action.action_type === 'link_click') {
      linkClicks += parseInt(action.value, 10)
    }
  }

  if (!targetAction && conversions === 0) {
    for (const action of actions) {
      if (action.action_type === 'offsite_conversion.fb_pixel_lead' ||
          action.action_type === 'offsite_conversion.fb_pixel_purchase') {
        conversions += parseInt(action.value, 10)
      }
    }
  }

  return { conversions, linkClicks }
}

export function parseActionValues(actionValues: Array<{ action_type: string; value: string }> | null | undefined) {
  if (!actionValues) return { conversionValue: 0 }

  const valueActions = ['offsite_conversion.fb_pixel_purchase']
  let conversionValue = 0
  for (const av of actionValues) {
    if (valueActions.includes(av.action_type)) {
      conversionValue += parseFloat(av.value)
    }
  }
  return { conversionValue }
}
