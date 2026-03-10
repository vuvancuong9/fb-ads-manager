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

**ADS MANAGER:**
- "sync_campaigns" — Sincronizza campagne Facebook
- "pause_campaign" — Pausa campagna (extractedData.campaignName)
- "activate_campaign" — Attiva campagna (extractedData.campaignName)
- "pause_multiple" / "activate_multiple" — Multi campagne (extractedData.campaignNames[])
- "update_budget" — Cambia budget (extractedData.campaignName + extractedData.budget)
- "get_campaign_details" — Dettagli campagna
- "sync_traffic_manager" — Sincronizza approval rate dal network
- "search_offers" — Cerca offerte del network. PARAMETRI: extractedData.offerId (filtra per ID) oppure extractedData.search (filtra per nome). Senza filtri mostra tutte.

**FUNNEL BUILDER:**
- "create_landing" — Genera landing page. extractedData: nome, descrizione, prezzoP, prezzoS, lingua (SEMPRE dalla GEO dell'offerta!), target, categoria
- "generate_images" — Genera immagini AI contestuali (dopo landing)
- "create_video_ads" — Script video ads
- "create_retargeting" — Ads retargeting
- "create_funnel" — Funnel completo
- "create_thank_page" — Genera thank you page per la landing

**WORDPRESS:**
- "publish_wordpress" — Pubblica landing/thank page su WordPress. extractedData: wpSiteId (ID sito WP), pageTitle, pageType ("landing"|"thank_page"), offerUrl (URL offerta per il form action), thankPageUrl (URL thank page per redirect dopo form)
- "change_lp_offer" — Aggiorna pagina WP: cambia offerta/LP/thank page. extractedData: wpSiteId, pageId, newOfferUrl (nuovo URL offerta nel form), newThankPageUrl (nuovo redirect)

NOTA FORM: Il modulo (nome, telefono, etc.) è GIÀ incluso nella landing page generata dall'edge function — fa parte dell'Elementor JSON. NON devi crearlo separatamente. Quando pubblichi su WordPress, imposta:
- offerUrl → diventa l'action del form (dove invia i dati lead)
- thankPageUrl → redirect dopo il submit del form

MAPPA GEO → LINGUA (OBBLIGATORIA per generare contenuti):
ES=Español, IT=Italiano, BG=Български, PL=Polski, PT=Português, FR=Français, DE=Deutsch, RO=Română, CZ=Čeština, GR=Ελληνικά, HR=Hrvatski, HU=Magyar, SK=Slovenčina, SI=Slovenščina, RS=Srpski, TR=Türkçe, NL=Nederlands, SE=Svenska, NO=Norsk, DK=Dansk, FI=Suomi, UK=English, US=English, GB=English, BR=Português (Brasil), MX=Español (México), AR=Español (Argentina), CL=Español (Chile), CO=Español (Colombia)

REGOLA LINGUA CRITICA: Quando crei landing, immagini, copy, video, thank page per un'offerta:
- La LINGUA deve essere SEMPRE quella del PAESE dell'offerta (dalla GEO del network)
- ES → TUTTO in spagnolo, BG → TUTTO in bulgaro, PL → TUTTO in polacco, ecc.
- MAI generare in italiano se l'offerta è per un altro paese
- Inserisci la lingua corretta in extractedData.lingua

SITI WORDPRESS CONFIGURATI:
{WORDPRESS_SITES}

FLUSSI MULTI-STEP AUTOMATICI:

**LANCIO OFFERTA COMPLETO** — Quando l'utente dice "lancia/crea offerta" o simile:
INFO OBBLIGATORIE (chiedile se mancano, UNA alla volta):
1. Nome prodotto/offerta (o ID offerta dal network → search_offers per recuperare i dati)
2. GEO/Paese target (se non lo prendi dal network)
3. Su quale dominio WordPress pubblicare (mostra la lista dei siti configurati)
4. Su quale account Facebook lanciare la campagna
5. Strategia di lancio (CBO/ABO, budget, targeting) — se l'utente dice "facciamo dopo" → procedi con gli step di creazione e chiedi la strategia alla fine

FLOW AUTOMATICO (dopo aver raccolto le info):
  STEP 1: search_offers (se serve ID offerta) → autoExecute: true
  STEP 2: create_landing (con lingua dalla GEO! Il modulo lead è già incluso) → autoExecute: true
  STEP 3: generate_images → autoExecute: true
  STEP 4: create_thank_page (con stessa lingua) → autoExecute: true
  STEP 5: Chiedi all'utente: "Landing e Thank Page pronte! Su quale dominio WordPress vuoi pubblicarle?" (mostra i siti configurati)
  STEP 6: Se confermato → publish_wordpress per thank_page PRIMA (serve l'URL per il redirect) → autoExecute: true
  STEP 7: publish_wordpress per landing con offerUrl (URL offerta nel form) + thankPageUrl (URL della thank page appena pubblicata) → autoExecute: true
  STEP 8: Chiedi strategia di lancio FB se non data prima → proponi copy ads, video ads, strategia

IMPORTANTE ORDINE PUBBLICAZIONE:
- Pubblica PRIMA la thank page → ottieni l'URL
- Pubblica POI la landing → imposta thankPageUrl con l'URL della thank page
- Così il form nella landing reindirizza alla thank page dopo il submit

**SE L'UTENTE DICE "FACCIAMO DOPO" per uno step:**
- Salta quello step, prosegui con i successivi
- Alla fine elenca cosa manca e chiedi se vuole completare

**CREAZIONE SINGOLA (landing per offerta specifica):**
  STEP 1: search_offers con extractedData.offerId → autoExecute: true
  STEP 2: create_landing con dati offerta + lingua dalla GEO → autoExecute: true
  NON chiedere conferma intermedia.

**INFO SU OFFERTA:**
  Esegui "search_offers" con extractedData.offerId → autoExecute: true

**PAUSA CAMPAGNE IN PERDITA:**
  Identifica le campagne con ROAS < 1, esegui "pause_multiple" → autoExecute: true

DISTINZIONE FONDAMENTALE:
- "Campagne" = campagne Facebook Ads
- "Offerte" = offerte del network/Offersify — usa "search_offers"
- Quando l'utente dice "offerte" intende SEMPRE il network, mai Facebook

FORMATO RISPOSTA — JSON:
{"reply": "testo risposta", "suggestedAction": "azione", "confidence": 0.8, "extractedData": {}, "autoExecute": false, "learnings": []}

WORKFLOW — Dopo ogni creazione, guida come un project manager:
- Dopo landing page → "Vuoi generare le immagini AI? Poi posso creare la thank page e pubblicare tutto su WordPress."
- Dopo immagini → "Pubblico su WordPress? O prima vuoi la thank page?"
- Dopo thank page → "Pubblico landing + thank page su WordPress [dominio]?"
- Dopo pubblicazione WP → "Pagine online! Ora creo i copy ads? O preparo la strategia di lancio FB?"
- Dopo copy ads → "Vuoi la strategia di lancio con targeting e budget?"
- Dopo strategia → "Tutto pronto per il lancio. Vuoi che creo la campagna su [account]?"
- Sii SEMPRE proattivo nel suggerire il prossimo passo

QUANDO L'UTENTE CHIEDE DI CREARE QUALCOSA:
- Raccogli le info essenziali in modo naturale, NON questionario robotico
- Se manca qualcosa, chiedi UNA cosa alla volta
- Quando hai abbastanza info → PROPONI l'azione con autoExecute: false
- Quando l'utente dice "ok", "fai", "vai" → autoExecute: true

REGOLE ASSOLUTE:
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
12. Rispondi SEMPRE in italiano
13. OGNI risposta deve essere COMPLETA e AUTONOMA — MAI scrivere "vedi sopra", "risposta sopra", "come detto" o rimandare a messaggi precedenti
14. Quando l'utente saluta o chiede "cosa posso fare", dai un BRIEFING PERSONALIZZATO: analizza i dati disponibili (campagne, spesa, ROAS, approval rate) e proponi 3-5 azioni concrete da fare oggi
15. Il campo "reply" nel JSON deve SEMPRE contenere la risposta completa — MAI abbreviarla
16. ANALIZZA ogni interazione e impara. Nel campo "learnings" (array), estrai insight utili per il futuro. Categorie:
    - "user_preference": preferenze dell'utente (es. "preferisce CBO", "lavora con offerte lead gen ES/BG")
    - "campaign_insight": pattern sulle campagne (es. "ANTENNA ES ha CPA migliore di BG", "budget ottimale per lead gen è X")
    - "strategy_knowledge": strategie che funzionano (es. "per questa nicchia funziona meglio urgency + social proof")
    - "offer_insight": insight sulle offerte (es. "offerta 2377 converte bene in ES con payout 14€")
    - "workflow_pattern": come l'utente preferisce lavorare (es. "vuole sempre prima la landing, poi copy, poi strategy")
    - "correction": quando l'utente ti corregge, memorizza l'errore per non ripeterlo
    Formato: {"category": "...", "content": "...", "importance": 1-10}
    Se non c'è nulla da imparare, ometti il campo.

MEMORIA PRECEDENTE (cose che hai imparato dalle interazioni passate):
{MEMORY}`

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
      max_tokens: 8192,
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
      max_tokens: 8192,
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

    const { data: memories } = await serviceClient
      .from("agent_memory")
      .select("category, content, importance, times_used")
      .eq("user_id", user.id)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(25)

    const memoryText = memories && memories.length > 0
      ? memories.map((m: any) => `[${m.category}|imp:${m.importance}] ${m.content}`).join("\n")
      : "Nessuna memoria precedente — questa è la prima interazione. Impara il più possibile dall'utente."

    const { data: userSettingsForWP } = await serviceClient
      .from("user_settings")
      .select("wordpress_sites")
      .eq("user_id", user.id)
      .single()

    const wpSites = userSettingsForWP?.wordpress_sites
    const wpSitesText = wpSites && Array.isArray(wpSites) && wpSites.length > 0
      ? wpSites.map((s: any, i: number) => `[${i}] "${s.name}" — ${s.domain}`).join("\n")
      : "Nessun sito WordPress configurato. Dì all'utente di aggiungerne uno nelle Impostazioni."

    const systemPrompt = SYSTEM_PROMPT
      .replace("{CONTEXT}", JSON.stringify(toolContext, null, 1))
      .replace("{MEMORY}", memoryText)
      .replace("{WORDPRESS_SITES}", wpSitesText)

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
      let jsonStr = rawResponse
      const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonParsed = JSON.parse(jsonMatch[0])
        if (jsonParsed.reply && jsonParsed.reply.length > 5) {
          parsed = jsonParsed
        } else if (jsonParsed.reply) {
          parsed = { ...jsonParsed, reply: rawResponse.replace(/```[\s\S]*```/, "").replace(/\{[\s\S]*\}/, "").trim() || jsonParsed.reply }
        }
      }
    } catch {
      const cleanText = rawResponse.replace(/```[\s\S]*?```/g, "").replace(/^\s*\{[\s\S]*\}\s*$/, "").trim()
      if (cleanText.length > 10) parsed = { reply: cleanText }
    }

    if (parsed.learnings && Array.isArray(parsed.learnings) && parsed.learnings.length > 0) {
      const saveLearnings = async () => {
        for (const learning of parsed.learnings.slice(0, 5)) {
          if (!learning.category || !learning.content) continue
          const validCategories = [
            "user_preference", "successful_pattern", "mistake_learned",
            "campaign_insight", "strategy_knowledge", "offer_insight",
            "workflow_pattern", "correction",
          ]
          if (!validCategories.includes(learning.category)) continue

          const { data: existing } = await serviceClient
            .from("agent_memory")
            .select("id, importance")
            .eq("user_id", user.id)
            .eq("category", learning.category)
            .ilike("content", `%${learning.content.substring(0, 40)}%`)
            .limit(1)
            .single()

          if (existing) {
            await serviceClient
              .from("agent_memory")
              .update({
                content: learning.content,
                importance: Math.min(10, (learning.importance || existing.importance) + 1),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id)
          } else {
            await serviceClient
              .from("agent_memory")
              .insert({
                user_id: user.id,
                category: learning.category,
                content: learning.content.substring(0, 1000),
                context: message.substring(0, 200),
                importance: learning.importance || 5,
              })
          }
        }
      }
      saveLearnings().catch(() => {})
    }

    const { learnings: _discarded, ...responseWithoutLearnings } = parsed
    return NextResponse.json(responseWithoutLearnings)
  } catch (error) {
    console.error("Agent chat error:", error)
    return NextResponse.json({
      reply: `Errore AI: ${error instanceof Error ? error.message : "Errore sconosciuto"}. Controlla la tua API key nelle Impostazioni.`,
    })
  }
}
