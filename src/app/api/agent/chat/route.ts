import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const SYSTEM_PROMPT = `Sei un Senior Media Buyer e Performance Marketing Strategist con 15+ anni di esperienza su Facebook Ads, Google Ads e affiliate marketing. Sei anche un esperto copywriter, analista dati e growth hacker. Lavori come AI integrata nel tool "FB Ads Manager".

COMPETENZE CHIAVE:
- Facebook Ads: struttura campagne CBO/ABO, audience targeting, lookalike, retargeting, scaling orizzontale/verticale, creative testing, bid strategy
- Analisi Performance: ROAS, CPA, CTR, CPM, CPC, frequency, hook rate, hold rate, thumbstop ratio
- Media Buying: budget allocation, dayparting, kill criteria, break-even analysis, MER
- Copywriting: framework AIDA, PAS, BAB, 4P, STAR — headline, body, CTA per ads Facebook/Instagram/TikTok
- Funnel: landing page, VSL, advertorial, quiz funnel, lead magnet, tripwire, OTO, upsell
- Traffic Management: approval rate, CR, EPL, EPC, offer selection, geo targeting
- Scaling: quando e come scalare, test budget, scaling budget, regola del 20%, duplicazione

HAI ACCESSO AI DATI DEL TOOL IN TEMPO REALE:
{CONTEXT}

AZIONI CHE PUOI ESEGUIRE (campo "suggestedAction"):

**Gestione Campagne:**
- "sync_campaigns" — Sincronizza campagne da Facebook
- "pause_campaign" — Pausa campagna (extractedData.campaignName obbligatorio)
- "activate_campaign" — Attiva campagna (extractedData.campaignName obbligatorio)
- "pause_multiple" — Pausa più campagne (extractedData.campaignNames[] obbligatorio)
- "activate_multiple" — Attiva più campagne (extractedData.campaignNames[] obbligatorio)
- "update_budget" — Cambia budget (extractedData.campaignName + extractedData.budget in EUR)
- "get_campaign_details" — Dettagli campagna (extractedData.campaignName)

**Traffic Manager:**
- "sync_traffic_manager" — Sincronizza dati approval rate
- "search_offers" — Cerca offerte disponibili

**Funnel Builder:**
- "create_landing" — Genera landing page (extractedData = dati prodotto)
- "create_video_ads" — Genera script video ads
- "create_retargeting" — Genera ads retargeting
- "create_funnel" — Genera funnel completo

FORMATO RISPOSTA — JSON valido con questi campi:
{
  "reply": "la tua risposta (SEMPRE presente, in italiano)",
  "suggestedAction": "nome_azione (opzionale)",
  "confidence": 0.0-1.0,
  "extractedData": { "campaignName": "...", "budget": 50, ... },
  "autoExecute": false
}

COME TI COMPORTI:
1. Analizzi i dati REALI — mai inventare numeri, mai essere generico
2. Sei proattivo: vedi un problema? Lo segnali subito con la soluzione
3. Parli come un collega senior, non come un chatbot — diretto, strategico, concreto
4. Quando proponi un'azione → confidence 0.8, autoExecute false
5. Quando l'utente conferma ("ok", "sì", "fai", "vai", "procedi") → autoExecute true, confidence 1.0
6. Quando l'utente ordina ("pausa X", "spegni X", "accendi X") → autoExecute true, confidence 1.0
7. "spegni" = pause_campaign, "accendi" = activate_campaign
8. Se vedi campagne con ROAS < 0.8 e spesa > €10 → segnala subito come critico
9. Se approval rate < 50% → segnala come problema grave
10. Dai sempre numeri specifici: "la campagna X ha speso €Y con ROAS Z — suggerisco di..."
11. Non fare liste generiche — ogni consiglio deve essere basato sui dati che vedi
12. Se non hai dati sufficienti, chiedi di sincronizzare prima

RISPONDI SEMPRE IN ITALIANO.`

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
      list: (campaigns || []).map((c: any) => ({
        name: c.name, status: c.status, objective: c.objective,
        dailyBudget: c.daily_budget ? c.daily_budget / 100 : null,
      })),
    }

    const { data: insights } = await serviceClient.from("campaign_insights")
      .select("campaign_id,date,spend,impressions,clicks,ctr,cpc,cpm,conversions,conversion_value,roas,cost_per_conversion")
      .in("fb_ad_account_id", accountIds).gte("date", weekAgo).lte("date", today)

    if (insights && insights.length > 0) {
      const totals = insights.reduce((acc: any, i: any) => ({
        spend: acc.spend + Number(i.spend),
        impressions: acc.impressions + Number(i.impressions),
        clicks: acc.clicks + Number(i.clicks),
        conversions: acc.conversions + Number(i.conversions),
        conversionValue: acc.conversionValue + Number(i.conversion_value),
      }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 })

      ctx.insights7d = {
        periodo: `${weekAgo} → ${today}`,
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
        if (!byCampaign[i.campaign_id]) byCampaign[i.campaign_id] = { spend: 0, conversions: 0, convValue: 0, clicks: 0, impressions: 0 }
        byCampaign[i.campaign_id].spend += Number(i.spend)
        byCampaign[i.campaign_id].conversions += Number(i.conversions)
        byCampaign[i.campaign_id].convValue += Number(i.conversion_value)
        byCampaign[i.campaign_id].clicks += Number(i.clicks)
        byCampaign[i.campaign_id].impressions += Number(i.impressions)
      }

      const campaignPerf = Object.entries(byCampaign).map(([cid, data]) => {
        const camp = (campaigns || []).find((c: any) => c.id === cid)
        return {
          name: camp?.name || cid,
          status: camp?.status,
          objective: camp?.objective,
          spend: Math.round(data.spend * 100) / 100,
          conversions: data.conversions,
          roas: data.spend > 0 ? Math.round((data.convValue / data.spend) * 100) / 100 : 0,
          cpa: data.conversions > 0 ? Math.round((data.spend / data.conversions) * 100) / 100 : 0,
          ctr: data.impressions > 0 ? Math.round((data.clicks / data.impressions) * 10000) / 100 : 0,
          cpm: data.impressions > 0 ? Math.round((data.spend / data.impressions) * 100000) / 100 : 0,
        }
      }).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend)

      ctx.campagnePerPerformance = campaignPerf.slice(0, 20)
      ctx.campagneInPerdita = campaignPerf.filter(c => c.roas < 1 && c.spend > 5).sort((a, b) => a.roas - b.roas)
      ctx.campagneProfittevoli = campaignPerf.filter(c => c.roas >= 1).sort((a, b) => b.roas - a.roas).slice(0, 10)
    }
  }

  const { data: tmManagers } = await serviceClient.from("traffic_managers").select("id,name,api_base_url,last_synced_at")
  const { data: tmData } = await serviceClient.from("traffic_manager_data").select("*").order("date", { ascending: false }).limit(50)
  if (tmData && tmData.length > 0) {
    const tmTotals = tmData.reduce((acc: any, d: any) => ({
      total: acc.total + d.total_conversions,
      approved: acc.approved + d.approved_conversions,
      rejected: acc.rejected + d.rejected_conversions,
      pending: acc.pending + d.pending_conversions,
      revenue: acc.revenue + Number(d.revenue),
    }), { total: 0, approved: 0, rejected: 0, pending: 0, revenue: 0 })

    ctx.trafficManager = {
      managers: (tmManagers || []).map((m: any) => ({ name: m.name, url: m.api_base_url, lastSync: m.last_synced_at })),
      totali: {
        lead: tmTotals.total,
        approvate: tmTotals.approved,
        rifiutate: tmTotals.rejected,
        inAttesa: tmTotals.pending,
        approvalRate: tmTotals.total > 0 ? Math.round((tmTotals.approved / tmTotals.total) * 10000) / 100 : 0,
        revenue: Math.round(tmTotals.revenue * 100) / 100,
      },
    }

    for (const d of tmData) {
      if (d.raw_data) {
        const raw = d.raw_data as any
        const offers = Array.isArray(raw) ? raw : raw?.data || []
        if (offers.length > 0) {
          ctx.dettaglioOfferte = offers.slice(0, 15).map((o: any) => ({
            id: o.offer_id,
            nome: o.offer_name,
            confermate: o.leads?.confirmed?.total ?? 0,
            cancellate: o.leads?.canceled?.total ?? 0,
            pending: o.conversions?.pending?.total ?? 0,
            approvate: o.conversions?.approved?.total ?? 0,
            doppie: o.leads?.double ?? 0,
          }))
          break
        }
      }
    }
  }

  ctx.dataOggi = today

  return ctx
}

async function callClaude(apiKey: string, systemPrompt: string, messages: any[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ""
}

async function callOpenAI(apiKey: string, systemPrompt: string, messages: any[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`OpenAI API ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ""
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const { data: userSettings } = await serviceClient
      .from("user_settings")
      .select("anthropic_api_key,openai_api_key,preferred_model")
      .eq("user_id", user.id)
      .single()

    const anthropicKey = userSettings?.anthropic_api_key
    const openaiKey = userSettings?.openai_api_key
    const preferred = userSettings?.preferred_model || "claude"

    if (!anthropicKey && !openaiKey) {
      return NextResponse.json({
        reply: "Per usare l'AI Assistant devi configurare almeno una API key (Claude o OpenAI). Vai in **Impostazioni** nel menu a sinistra e inserisci la tua chiave.",
        suggestedAction: null,
      })
    }

    const body = await request.json()
    const { message, history } = body

    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 })

    const toolContext = await getToolContext(serviceClient, user.id, isAdmin)
    const systemPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", JSON.stringify(toolContext, null, 1))

    const chatMessages = [
      ...(history || []).slice(-20).map((h: any) => ({
        role: h.role === "agent" ? "assistant" : "user",
        content: h.content,
      })),
      { role: "user", content: message },
    ]

    let rawResponse = ""

    if (preferred === "claude" && anthropicKey) {
      try {
        rawResponse = await callClaude(anthropicKey, systemPrompt, chatMessages)
      } catch (e) {
        if (openaiKey) {
          rawResponse = await callOpenAI(openaiKey, systemPrompt, chatMessages)
        } else {
          throw e
        }
      }
    } else if (preferred === "openai" && openaiKey) {
      try {
        rawResponse = await callOpenAI(openaiKey, systemPrompt, chatMessages)
      } catch (e) {
        if (anthropicKey) {
          rawResponse = await callClaude(anthropicKey, systemPrompt, chatMessages)
        } else {
          throw e
        }
      }
    } else if (anthropicKey) {
      rawResponse = await callClaude(anthropicKey, systemPrompt, chatMessages)
    } else if (openaiKey) {
      rawResponse = await callOpenAI(openaiKey, systemPrompt, chatMessages)
    }

    let parsed: any = { reply: rawResponse }
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonParsed = JSON.parse(jsonMatch[0])
        if (jsonParsed.reply) parsed = jsonParsed
      }
    } catch { /* response wasn't JSON, use raw text */ }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Agent chat error:", error)
    return NextResponse.json({
      reply: `Errore AI: ${error instanceof Error ? error.message : "Errore sconosciuto"}. Controlla la tua API key nelle Impostazioni.`,
    })
  }
}
