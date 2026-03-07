import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const AGENT_SUPABASE_URL = "https://smwtkyvnmyetlektphyy.supabase.co"
const AGENT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtd3RreXZubXlldGxla3RwaHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMzk1MzEsImV4cCI6MjA3NTYxNTUzMX0.9YhnYyA7n9qXMgIOvh64Z9-ylYADrW7x2SysbAGvVp0"

async function getToolContext(serviceClient: any, userId: string, isAdmin: boolean) {
  const ctx: any = {}

  const { data: accounts } = isAdmin
    ? await serviceClient.from("fb_ad_accounts").select("id,name,account_id,status,currency,last_synced_at").order("name")
    : await serviceClient.from("user_account_assignments").select("fb_ad_account_id").eq("user_id", userId)
      .then(async (res: any) => {
        const ids = (res.data || []).map((a: any) => a.fb_ad_account_id)
        if (ids.length === 0) return { data: [] }
        return serviceClient.from("fb_ad_accounts").select("id,name,account_id,status,currency,last_synced_at").in("id", ids)
      })
  ctx.accounts = (accounts || []).map((a: any) => ({ name: a.name, id: a.account_id, status: a.status, currency: a.currency }))

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  const today = new Date().toISOString().split("T")[0]
  const accountIds = (accounts || []).map((a: any) => a.id)

  if (accountIds.length > 0) {
    const { data: campaigns } = await serviceClient.from("campaigns").select("id,name,status,objective,daily_budget,fb_ad_account_id").in("fb_ad_account_id", accountIds)
    ctx.campaigns = {
      total: (campaigns || []).length,
      active: (campaigns || []).filter((c: any) => c.status === "ACTIVE").length,
      paused: (campaigns || []).filter((c: any) => c.status === "PAUSED").length,
      top10: (campaigns || []).slice(0, 10).map((c: any) => ({
        name: c.name, status: c.status, objective: c.objective,
        dailyBudget: c.daily_budget ? c.daily_budget / 100 : null,
      })),
    }

    const { data: insights } = await serviceClient.from("campaign_insights").select("campaign_id,date,spend,impressions,clicks,ctr,conversions,conversion_value,roas,cost_per_conversion").in("fb_ad_account_id", accountIds).gte("date", weekAgo).lte("date", today)

    if (insights && insights.length > 0) {
      const totals = insights.reduce((acc: any, i: any) => ({
        spend: acc.spend + Number(i.spend),
        impressions: acc.impressions + Number(i.impressions),
        clicks: acc.clicks + Number(i.clicks),
        conversions: acc.conversions + Number(i.conversions),
        conversionValue: acc.conversionValue + Number(i.conversion_value),
      }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 })

      ctx.insights7d = {
        spend: Math.round(totals.spend * 100) / 100,
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctr: totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0,
        conversions: totals.conversions,
        conversionValue: Math.round(totals.conversionValue * 100) / 100,
        roas: totals.spend > 0 ? Math.round((totals.conversionValue / totals.spend) * 100) / 100 : 0,
        cpa: totals.conversions > 0 ? Math.round((totals.spend / totals.conversions) * 100) / 100 : 0,
      }

      const byCampaign: Record<string, any> = {}
      for (const i of insights) {
        if (!byCampaign[i.campaign_id]) byCampaign[i.campaign_id] = { spend: 0, conversions: 0, convValue: 0, clicks: 0 }
        byCampaign[i.campaign_id].spend += Number(i.spend)
        byCampaign[i.campaign_id].conversions += Number(i.conversions)
        byCampaign[i.campaign_id].convValue += Number(i.conversion_value)
        byCampaign[i.campaign_id].clicks += Number(i.clicks)
      }

      const campaignPerf = Object.entries(byCampaign).map(([cid, data]) => {
        const camp = (campaigns || []).find((c: any) => c.id === cid)
        return {
          name: camp?.name || cid,
          status: camp?.status,
          spend: Math.round(data.spend * 100) / 100,
          conversions: data.conversions,
          roas: data.spend > 0 ? Math.round((data.convValue / data.spend) * 100) / 100 : 0,
          cpa: data.conversions > 0 ? Math.round((data.spend / data.conversions) * 100) / 100 : 0,
        }
      }).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend)

      ctx.topCampaigns = campaignPerf.slice(0, 15)
      ctx.worstRoas = campaignPerf.filter(c => c.roas < 1 && c.spend > 5).sort((a, b) => a.roas - b.roas).slice(0, 5)
      ctx.bestRoas = campaignPerf.filter(c => c.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, 5)
    }
  }

  const { data: tmData } = await serviceClient.from("traffic_manager_data").select("*").gte("date", weekAgo).lte("date", today)
  if (tmData && tmData.length > 0) {
    const tmTotals = tmData.reduce((acc: any, d: any) => ({
      total: acc.total + d.total_conversions,
      approved: acc.approved + d.approved_conversions,
      rejected: acc.rejected + d.rejected_conversions,
      pending: acc.pending + d.pending_conversions,
      revenue: acc.revenue + Number(d.revenue),
    }), { total: 0, approved: 0, rejected: 0, pending: 0, revenue: 0 })

    ctx.trafficManager = {
      totalConversions: tmTotals.total,
      approved: tmTotals.approved,
      rejected: tmTotals.rejected,
      pending: tmTotals.pending,
      approvalRate: tmTotals.total > 0 ? Math.round((tmTotals.approved / tmTotals.total) * 10000) / 100 : 0,
      revenue: Math.round(tmTotals.revenue * 100) / 100,
    }
  }

  return ctx
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const body = await request.json()
    const { message, history, agentSessionToken, productData, toolState } = body

    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 })

    const toolContext = await getToolContext(serviceClient, user.id, isAdmin)

    const agentRole = `Sei l'AI Assistant di FB Ads Manager — un esperto di performance marketing e gestione campagne Facebook Ads.

HAI ACCESSO AI DATI DEL TOOL IN TEMPO REALE:
${JSON.stringify(toolContext, null, 1)}

COSA PUOI FARE:
- Analizzare le performance delle campagne (spesa, ROAS, CPA, CTR)
- Suggerire ottimizzazioni (campagne da pausare, budget da spostare, targeting)
- Identificare campagne in perdita (ROAS < 1) e campagne profittevoli
- Analizzare l'approval rate dal Traffic Manager
- Dare consigli strategici su scaling e budget allocation
- Suggerire azioni concrete da eseguire nel tool

AZIONI CHE PUOI SUGGERIRE (campo "suggestedAction"):
- "sync_campaigns" — Sincronizza campagne da Facebook
- "pause_campaign" — Pausa una campagna specifica (specifica il nome in extractedData.campaignName)
- "activate_campaign" — Attiva una campagna specifica
- "show_losing" — Mostra campagne in perdita
- "show_profitable" — Mostra campagne profittevoli
- "analyze_account" — Analisi dettagliata di un account
- "optimize_budget" — Suggerisci riallocazione budget
- "check_approval" — Controlla approval rate TM
- "create_landing" — Genera landing page
- "create_video_ads" — Genera script video ads
- "create_retargeting" — Genera ads retargeting
- "create_funnel" — Genera funnel completo
- "search_offers" — Cerca offerte nei Traffic Manager

FORMATO RISPOSTA: JSON con campi:
- "reply": la tua risposta testuale
- "suggestedAction": (opzionale) azione da suggerire
- "confidence": (opzionale) 0-1 quanto sei sicuro che l'utente voglia quell'azione
- "extractedData": (opzionale) dati estratti dalla conversazione

REGOLE:
- Rispondi SEMPRE in italiano
- Sii diretto e strategico, non generico
- Usa i DATI REALI forniti sopra, NON inventare numeri
- Quando analizzi, CITA nomi campagne specifiche e metriche reali
- Se l'utente chiede di fare qualcosa, suggerisci l'azione con confidence alta
- Dai priorità a insights azionabili: cosa fare ORA per migliorare le performance`

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "apikey": AGENT_SUPABASE_KEY,
    }
    if (agentSessionToken) {
      headers["Authorization"] = `Bearer ${agentSessionToken}`
    }

    const response = await fetch(`${AGENT_SUPABASE_URL}/functions/v1/funnel-builder-claude-v2`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "chat",
        userId: user.id,
        data: {
          message,
          history: (history || []).slice(-20),
          productData: productData || null,
          toolState: toolState || null,
          agentRole,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      console.error("Agent AI error:", response.status, errText)
      return NextResponse.json({ error: `AI Error: ${response.status}` }, { status: 502 })
    }

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Agent chat error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
