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

// ===================================================================
// DUPLICATE / COPY
// ===================================================================

export async function duplicateCampaign(
  campaignId: string,
  accessToken: string,
  overrides?: { name?: string; status?: string; daily_budget?: number }
) {
  const params: Record<string, string> = {}
  if (overrides?.name) params.rename_options = JSON.stringify({ rename_suffix: ` - ${overrides.name}` })
  if (overrides?.status) params.status_option = overrides.status

  const res = await fbPost(`/${campaignId}/copies`, { accessToken, params })
  const newCampaignId = res.copied_campaign_id || res.id

  if (overrides?.name && newCampaignId) {
    await fbPost(`/${newCampaignId}`, {
      accessToken,
      params: { name: overrides.name },
    })
  }
  if (overrides?.daily_budget && newCampaignId) {
    await fbPost(`/${newCampaignId}`, {
      accessToken,
      params: { daily_budget: String(Math.round(overrides.daily_budget * 100)) },
    })
  }
  return { ...res, newCampaignId }
}

export async function duplicateAdSet(
  adsetId: string,
  accessToken: string,
  campaignId: string,
  overrides?: { name?: string; daily_budget?: number }
) {
  const params: Record<string, string> = { campaign_id: campaignId }
  if (overrides?.name) params.rename_options = JSON.stringify({ rename_suffix: ` - ${overrides.name}` })

  const res = await fbPost(`/${adsetId}/copies`, { accessToken, params })
  const newAdsetId = res.copied_adset_id || res.id

  if (overrides?.name && newAdsetId) {
    await fbPost(`/${newAdsetId}`, { accessToken, params: { name: overrides.name } })
  }
  if (overrides?.daily_budget && newAdsetId) {
    await fbPost(`/${newAdsetId}`, { accessToken, params: { daily_budget: String(Math.round(overrides.daily_budget * 100)) } })
  }
  return { ...res, newAdsetId }
}

export async function duplicateAd(
  adId: string,
  accessToken: string,
  adsetId: string,
  overrides?: { name?: string }
) {
  const params: Record<string, string> = { adset_id: adsetId }
  const res = await fbPost(`/${adId}/copies`, { accessToken, params })
  const newAdId = res.copied_ad_id || res.id
  if (overrides?.name && newAdId) {
    await fbPost(`/${newAdId}`, { accessToken, params: { name: overrides.name } })
  }
  return { ...res, newAdId }
}

// ===================================================================
// CREATE ADS & CREATIVES
// ===================================================================

export async function createAdCreative(
  accountId: string,
  accessToken: string,
  data: {
    name: string
    pageId: string
    link?: string
    message?: string
    headline?: string
    description?: string
    imageUrl?: string
    imageHash?: string
    videoId?: string
    callToAction?: string
    linkCaption?: string
  }
) {
  const objectStorySpec: any = {
    page_id: data.pageId,
  }

  if (data.videoId) {
    objectStorySpec.video_data = {
      video_id: data.videoId,
      title: data.headline || "",
      message: data.message || "",
      link_description: data.description || "",
      call_to_action: { type: data.callToAction || "LEARN_MORE", value: { link: data.link || "" } },
      image_url: data.imageUrl || "",
    }
  } else {
    objectStorySpec.link_data = {
      link: data.link || "",
      message: data.message || "",
      name: data.headline || "",
      description: data.description || "",
      call_to_action: { type: data.callToAction || "LEARN_MORE" },
      ...(data.imageHash ? { image_hash: data.imageHash } : data.imageUrl ? { picture: data.imageUrl } : {}),
    }
  }

  return fbPost(`/${accountId}/adcreatives`, {
    accessToken,
    params: {
      name: data.name,
      object_story_spec: JSON.stringify(objectStorySpec),
    } as unknown as Record<string, string>,
  })
}

export async function createAd(
  accountId: string,
  accessToken: string,
  data: {
    name: string
    adset_id: string
    creative_id: string
    status?: string
  }
) {
  return fbPost(`/${accountId}/ads`, {
    accessToken,
    params: {
      name: data.name,
      adset_id: data.adset_id,
      creative: JSON.stringify({ creative_id: data.creative_id }),
      status: data.status || "PAUSED",
    } as unknown as Record<string, string>,
  })
}

export async function uploadImageByUrl(
  accountId: string,
  accessToken: string,
  imageUrl: string
) {
  return fbPost(`/${accountId}/adimages`, {
    accessToken,
    params: { url: imageUrl } as unknown as Record<string, string>,
  })
}

// ===================================================================
// UPDATE ADSET & AD
// ===================================================================

export async function updateAdSet(
  adsetId: string,
  accessToken: string,
  data: {
    name?: string
    status?: string
    daily_budget?: number
    lifetime_budget?: number
    bid_amount?: number
    targeting?: Record<string, unknown>
    optimization_goal?: string
    start_time?: string
    end_time?: string
  }
) {
  const params: Record<string, string> = {}
  if (data.name) params.name = data.name
  if (data.status) params.status = data.status
  if (data.daily_budget) params.daily_budget = String(Math.round(data.daily_budget * 100))
  if (data.lifetime_budget) params.lifetime_budget = String(Math.round(data.lifetime_budget * 100))
  if (data.bid_amount) params.bid_amount = String(Math.round(data.bid_amount * 100))
  if (data.targeting) params.targeting = JSON.stringify(data.targeting)
  if (data.optimization_goal) params.optimization_goal = data.optimization_goal
  if (data.start_time) params.start_time = data.start_time
  if (data.end_time) params.end_time = data.end_time

  return fbPost(`/${adsetId}`, { accessToken, params })
}

export async function updateAd(
  adId: string,
  accessToken: string,
  data: {
    name?: string
    status?: string
    creative_id?: string
  }
) {
  const params: Record<string, string> = {}
  if (data.name) params.name = data.name
  if (data.status) params.status = data.status
  if (data.creative_id) params.creative = JSON.stringify({ creative_id: data.creative_id })

  return fbPost(`/${adId}`, { accessToken, params })
}

// ===================================================================
// GET DETAILS
// ===================================================================

export async function getAdSetDetails(adsetId: string, accessToken: string) {
  return fbGet(`/${adsetId}`, {
    accessToken,
    params: {
      fields: "id,name,status,daily_budget,lifetime_budget,bid_amount,bid_strategy,optimization_goal,targeting,promoted_object,start_time,end_time,budget_remaining",
    },
  })
}

export async function getAdDetails(adId: string, accessToken: string) {
  return fbGet(`/${adId}`, {
    accessToken,
    params: {
      fields: "id,name,status,creative{id,name,title,body,thumbnail_url,object_story_spec,effective_object_story_id}",
    },
  })
}

export async function getCampaignFullStructure(campaignId: string, accessToken: string) {
  const adsets = await getAdSets(campaignId, accessToken)
  const structure: any[] = []
  for (const adset of adsets.data || []) {
    const ads = await getAds(adset.id, accessToken)
    structure.push({ ...adset, ads: ads.data || [] })
  }
  return structure
}

export async function searchInterests(query: string, accessToken: string) {
  return fbGet("/search", {
    accessToken,
    params: { type: "adinterest", q: query, limit: "20" },
  })
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
