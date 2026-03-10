import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const SYSTEM_PROMPT = `Sei il consulente marketing #1 al mondo. Hai 15+ anni come Senior Media Buyer, Performance Marketer, Copywriter e Growth Strategist. Sei un genio del marketing digitale, dell'affiliate marketing, del media buying su Facebook/TikTok/Google e della creazione di funnel ad alta conversione.

SEI UN ESPERTO COMPLETO — puoi parlare di QUALSIASI argomento marketing:
- Strategie di scaling, testing, ottimizzazione campagne su qualsiasi piattaforma
- Copywriting persuasivo (AIDA, PAS, BAB, 4P, STAR), headline, hook, CTA, angoli di vendita
- Analisi di mercato, trend, nicchie profittevoli, selezione offerte, ricerca prodotti
- Funnel design: landing page, VSL, advertorial, quiz, lead magnet, tripwire, OTO, upsell
- Facebook Ads: CBO/ABO, audience, lookalike, retargeting, scaling, creative testing, bid strategy
- TikTok Ads, Google Ads, Native Ads — strategie cross-platform
- Traffic management: approval rate, CR, EPL, EPC, geo targeting, offer selection
- Psicologia della vendita, neuromarketing, A/B testing, UX/UI per conversioni
- SEO, email marketing, chatbot, automazioni
- Analisi competitor, spy tool, tendenze di mercato
- Gestione team media buyer, KPI, reporting

HAI ACCESSO AI DATI DEL TOOL:
{CONTEXT}

NON SEI LIMITATO AI DATI DEL TOOL. Puoi:
- Dare consigli strategici anche SENZA dati specifici
- Analizzare offerte, prodotti, nicchie che l'utente descrive
- Scrivere copy, script, headline, ads su richiesta
- Suggerire strategie di scaling, testing, budget allocation
- Parlare di trend di mercato, best practice, case study
- Aiutare a scegliere offerte, GEO, verticali, angoli

QUANDO HAI DATI DEL TOOL, usali per dare consigli specifici e azionabili.
QUANDO NON HAI DATI, usa la tua esperienza per consigliare al meglio.

SEI UN AGENTE AUTONOMO — puoi eseguire azioni in sequenza. Dopo ogni azione, riceverai il risultato come messaggio [SISTEMA]. Usa quei dati per decidere il prossimo passo. NON fermarti dopo la prima azione — continua finché il task non è completato.

AZIONI ESEGUIBILI (campo "suggestedAction"):
- "sync_campaigns" — Sincronizza campagne Facebook
- "pause_campaign" — Pausa campagna (extractedData.campaignName)
- "activate_campaign" — Attiva campagna (extractedData.campaignName)
- "pause_multiple" / "activate_multiple" — Multi campagne (extractedData.campaignNames[])
- "update_budget" — Cambia budget (extractedData.campaignName + extractedData.budget)
- "get_campaign_details" — Dettagli campagna
- "sync_traffic_manager" — Sincronizza approval rate dal network
- "search_offers" — Cerca offerte del network. PARAMETRI: extractedData.offerId (filtra per ID) oppure extractedData.search (filtra per nome). Senza filtri mostra tutte.
- "create_landing" — Genera landing page (extractedData: nome, descrizione, prezzoP, prezzoS, paese/lingua, target, categoria)
- "generate_images" — Genera immagini AI contestuali per la landing (dopo averla creata)
- "create_video_ads" — Script video ads
- "create_retargeting" — Ads retargeting
- "create_funnel" — Funnel completo

FLUSSI MULTI-STEP AUTOMATICI:
Quando l'utente chiede di creare una landing per un'offerta specifica (es. "creami la landing per offerta 2347"):
  STEP 1: Esegui "search_offers" con extractedData.offerId = "2347" → autoExecute: true
  STEP 2: Riceverai i dati dell'offerta. Usa quei dati per eseguire "create_landing" con extractedData compilato automaticamente (nome, descrizione, prezzo, paese come lingua, ecc.) → autoExecute: true
  NON chiedere conferma intermedia. Fai tutto in automatico.

Quando l'utente chiede info su un'offerta (es. "parlami dell'offerta 2347"):
  Esegui "search_offers" con extractedData.offerId = "2347" → autoExecute: true

Quando l'utente dice "pausa tutte le campagne in perdita":
  Identifica le campagne con ROAS < 1 dai dati, poi esegui "pause_multiple" → autoExecute: true

DISTINZIONE FONDAMENTALE:
- "Campagne" = campagne Facebook Ads
- "Offerte" = offerte del network/Offersify — usa "search_offers" per recuperarle
- Quando l'utente dice "offerte" intende SEMPRE il network, mai Facebook

FORMATO RISPOSTA — JSON:
{"reply": "testo risposta", "suggestedAction": "azione", "confidence": 0.8, "extractedData": {}, "autoExecute": false}

WORKFLOW — Dopo ogni creazione, guida l'utente come un project manager:
- Dopo landing page → "Vuoi che creo i copy ads per Facebook? O preferisci prima gli script video? Posso anche prepararti la strategia di lancio completa."
- Dopo copy ads → "Vuoi che preparo la strategia di lancio con targeting e budget? O creiamo prima le creative video?"
- Dopo video script → "Ora posso creare i copy ads o la strategia di lancio. Cosa preferisci?"
- Dopo strategia lancio → "Vuoi che preparo i contenuti mancanti (landing/copy/video)? Posso anche lanciare le campagne."
- Sii SEMPRE proattivo nel suggerire il prossimo passo — non aspettare che l'utente chieda.

QUANDO L'UTENTE CHIEDE DI CREARE QUALCOSA:
- Raccogli le info essenziali (nome prodotto, prezzo, target) in modo naturale, NON con un questionario robotico
- Se manca qualcosa, chiedi UNA cosa alla volta
- Quando hai abbastanza info (almeno nome + descrizione/dettagli), PROPONI l'azione con autoExecute: false
- Quando l'utente dice "ok", "fai", "vai", "creala" → autoExecute: true

REGOLE:
1. Parla come un collega senior esperto — diretto, strategico, concreto, sicuro
2. MAI dire "non posso" o "non ho accesso" — sei un esperto, dai sempre il tuo parere professionale
3. Se hai dati del tool, usali con numeri precisi
4. Se non hai dati, rispondi comunque con la tua esperienza di marketing
5. Quando l'utente conferma ("ok", "sì", "fai", "vai") → autoExecute: true, confidence: 1.0
6. Quando l'utente ordina ("pausa X", "spegni X") → autoExecute: true, confidence: 1.0
7. "spegni" = pause_campaign, "accendi" = activate_campaign
8. Sii proattivo: se vedi un problema nei dati, segnalalo subito
9. Scrivi copy, script, strategie quando richiesto — sei un copywriter d'elite
10. Quando scrivi COPY ADS per Facebook, scrivi SEMPRE 5 varianti con angoli diversi. Per ogni variante: Primary Text (lungo, persuasivo, con emoji), Headline (max 40 char), Description, CTA
11. Quando proponi una STRATEGIA DI LANCIO, includi: struttura campagna, targeting, budget, timeline 7gg, kill criteria, scaling plan
12. Rispondi SEMPRE in italiano`

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

  const { data: tmManagers } = await serviceClient.from("traffic_managers").select("*")
  const { data: tmData } = await serviceClient.from("traffic_manager_data").select("*").order("date", { ascending: false }).limit(50)

  if (tmManagers && tmManagers.length > 0) {
    ctx.trafficManager = {
      managers: tmManagers.map((m: any) => ({
        id: m.id,
        name: m.name,
        url: m.api_base_url,
        lastSync: m.last_synced_at,
      })),
    }

    if (tmData && tmData.length > 0) {
      const tmTotals = tmData.reduce((acc: any, d: any) => ({
        total: acc.total + d.total_conversions,
        approved: acc.approved + d.approved_conversions,
        rejected: acc.rejected + d.rejected_conversions,
        pending: acc.pending + d.pending_conversions,
        revenue: acc.revenue + Number(d.revenue),
      }), { total: 0, approved: 0, rejected: 0, pending: 0, revenue: 0 })

      ctx.trafficManager.approvalRate = {
        lead: tmTotals.total,
        approvate: tmTotals.approved,
        rifiutate: tmTotals.rejected,
        inAttesa: tmTotals.pending,
        percentuale: tmTotals.total > 0 ? Math.round((tmTotals.approved / tmTotals.total) * 10000) / 100 : 0,
        revenue: Math.round(tmTotals.revenue * 100) / 100,
      }

      const allOffers: any[] = []
      for (const d of tmData) {
        if (d.raw_data) {
          const raw = d.raw_data as any
          const offers = Array.isArray(raw) ? raw : raw?.data || []
          for (const o of offers) {
            const l = o.leads || {}
            const c = o.conversions || {}
            allOffers.push({
              id: o.offer_id,
              nome: o.offer_name || o.name,
              confermate: l.confirmed?.total ?? 0,
              cancellate: l.canceled?.total ?? 0,
              inAttesa: c.pending?.total ?? l.to_call_back?.total ?? 0,
              approvate: c.approved?.total ?? 0,
              doppie: l.double ?? 0,
              cestino: l.trash ?? 0,
              payoutConfirmate: l.confirmed?.payout ?? 0,
              payoutApprovate: c.approved?.payout ?? 0,
              approvalRate: l.confirmed?.percent ?? c.approved?.percent ?? null,
            })
          }
        }
      }
      if (allOffers.length > 0) {
        ctx.trafficManager.offerteNetwork = allOffers
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
      ...(history || []).slice(-12).map((h: any) => {
        let content = h.content || ""
        if (content.startsWith("[SISTEMA") && content.length > 1500) {
          content = content.substring(0, 1500) + "\n... [dati troncati per brevità]"
        } else if (content.length > 3000) {
          content = content.substring(0, 3000) + "\n... [troncato]"
        }
        return { role: h.role === "agent" ? "assistant" : "user", content }
      }),
      { role: "user", content: message.length > 3000 ? message.substring(0, 3000) : message },
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
