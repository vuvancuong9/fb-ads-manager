"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, RefreshCw, Zap, TrendingDown, TrendingUp, BarChart3, Search, Rocket, FileCode, Video, Copy, Download, Eye, Brain } from "lucide-react"
import { postProcessLanding, resolveLanguageName } from "@/lib/landing-postprocess"

const AGENT_URL = "https://smwtkyvnmyetlektphyy.supabase.co"
const AGENT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtd3RreXZubXlldGxla3RwaHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMzk1MzEsImV4cCI6MjA3NTYxNTUzMX0.9YhnYyA7n9qXMgIOvh64Z9-ylYADrW7x2SysbAGvVp0"
const USE_LOCAL_AI = true

interface ChatMessage {
  role: "user" | "agent" | "system"
  content: string
  time: string
  actions?: { label: string; value: string; params?: any }[]
  offers?: any[]
}

const QUICK_ACTIONS = [
  { label: "Report Performance", value: "show_report", icon: BarChart3 },
  { label: "Campagne in Perdita", value: "show_losing", icon: TrendingDown },
  { label: "Campagne Profittevoli", value: "show_profitable", icon: TrendingUp },
  { label: "Ottimizza Budget", value: "optimize_budget", icon: Zap },
  { label: "Sincronizza", value: "sync_campaigns", icon: RefreshCw },
  { label: "Approval Rate TM", value: "check_approval", icon: Search },
  { label: "Crea Campagna FB", value: "prompt_create_campaign", icon: Rocket },
  { label: "Duplica Campagna", value: "prompt_duplicate_campaign", icon: Copy },
  { label: "Crea Landing", value: "prompt_landing", icon: FileCode },
  { label: "Crea Video Ads", value: "prompt_video", icon: Video },
  { label: "Funnel Completo", value: "prompt_funnel", icon: Rocket },
]

const ACTION_PROMPTS: Record<string, string> = {
  show_report: "Genera un report completo delle performance degli ultimi 7 giorni: spesa totale, ROAS, CPA, le campagne migliori e peggiori, e suggerimenti pratici.",
  show_losing: "Quali campagne stanno perdendo soldi? Mostrami quelle con ROAS sotto 1 e dimmi cosa fare con ciascuna.",
  show_profitable: "Quali sono le campagne più profittevoli? Mostrami le top per ROAS e dimmi quali scalare.",
  optimize_budget: "Analizza l'allocazione del budget attuale e suggerisci come redistribuirlo per massimizzare il ROAS.",
  sync_campaigns: "Sincronizza le campagne da Facebook per avere dati aggiornati.",
  check_approval: "Qual è l'approval rate attuale dal Traffic Manager? Analizza i dati e dimmi se ci sono problemi.",
  prompt_landing: "Voglio creare una landing page per un prodotto. Guidami nel processo.",
  prompt_video: "Voglio creare degli script per video ads. Guidami nel processo.",
  prompt_funnel: "Voglio creare un funnel completo (landing + video ads + retargeting). Guidami nel processo.",
  prompt_ad_copy: "Genera 5 varianti complete di copy ads per Facebook per il prodotto su cui stiamo lavorando. Per ogni variante scrivi: Primary Text (lungo, persuasivo, 2-3 paragrafi con emoji), Headline (max 40 caratteri, impattante), Description (1 riga), CTA. Usa angoli diversi per ogni variante: urgenza, social proof, beneficio diretto, curiosità, FOMO.",
  prompt_launch_strategy: "Crea una strategia di lancio completa per Facebook Ads per il prodotto su cui stiamo lavorando. Include: struttura campagna (CBO/ABO, quanti adset, quanti ads per adset), targeting dettagliato (interessi specifici, lookalike, custom audience), budget giornaliero consigliato per test e scaling, timeline 7 giorni step-by-step, creative testing plan, KPI target, kill criteria, e scaling plan.",
  prompt_translate_landing: "In che lingua vuoi tradurre la landing page? Dimmi la lingua e procedo subito con la traduzione.",
  prompt_create_campaign: "Voglio creare una nuova campagna Facebook Ads. Guidami: che obiettivo, budget, bid strategy? Su quale account?",
  prompt_duplicate_campaign: "Quale campagna vuoi duplicare? Dimmi il nome e se vuoi cambiare qualcosa (budget, nome, ecc.)",
}

function formatTime() {
  const now = new Date()
  return now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0")
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-black/30 px-1.5 py-0.5 rounded text-sm">$1</code>')
    .replace(/\n/g, "<br>")
}

function elementorToHtml(json: any): string {
  const renderWidget = (w: any): string => {
    const s = w.settings || {}
    const align = s.align || s.text_align || "center"
    const color = s.title_color || s.text_color || ""
    const cs = color ? `color:${color};` : ""
    switch (w.widgetType) {
      case "heading": {
        const tag = s.header_size || "h2"
        const fs = s.typography_font_size?.size
        const fss = fs ? `font-size:${fs}${s.typography_font_size?.unit || "px"};` : ""
        const fw = s.typography_font_weight ? `font-weight:${s.typography_font_weight};` : ""
        return `<${tag} style="text-align:${align};${cs}${fss}${fw}margin:12px 0;line-height:1.2">${s.title || ""}</${tag}>`
      }
      case "text-editor":
        return `<div style="text-align:${align};${cs}margin:12px 0;line-height:1.7;font-size:16px">${s.editor || ""}</div>`
      case "button": {
        const bg = s.background_color || s.button_background_color || "#e74c3c"
        const tc = s.button_text_color || "#fff"
        const br = s.border_radius?.size ?? 5
        return `<div style="text-align:${align};margin:24px 0"><a style="display:inline-block;padding:16px 48px;background:${bg};color:${tc};text-decoration:none;border-radius:${br}px;font-weight:bold;font-size:18px;letter-spacing:.5px;box-shadow:0 4px 15px rgba(0,0,0,.2)">${s.text || s.button_text || "ORDINA ORA"}</a></div>`
      }
      case "image":
        return s.image?.url
          ? `<div style="text-align:${align};margin:16px 0"><img src="${s.image.url}" style="max-width:100%;height:auto;border-radius:8px" /></div>`
          : `<div style="text-align:center;margin:16px 0;padding:80px 20px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px;color:#fff;font-size:48px">📷</div>`
      case "icon-list": {
        const items = s.icon_list || []
        if (!items.length) return ""
        return `<ul style="list-style:none;padding:0;margin:16px auto;max-width:500px">${items.map((it: any) =>
          `<li style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.05)"><span style="color:#27ae60;font-size:20px">✓</span><span style="font-size:15px">${it.text || ""}</span></li>`
        ).join("")}</ul>`
      }
      case "testimonial":
        return `<div style="background:#f8f9fa;padding:24px;border-radius:12px;margin:16px 0;border-left:4px solid #3498db;max-width:600px;${align === "center" ? "margin-left:auto;margin-right:auto" : ""}">
          <p style="font-style:italic;font-size:15px;line-height:1.6;margin-bottom:12px;color:#555">"${s.testimonial_content || ""}"</p>
          <p style="font-weight:600;color:#333;font-size:14px">— ${s.testimonial_name || ""} ${s.testimonial_job ? `<span style="color:#888;font-weight:400">(${s.testimonial_job})</span>` : ""}</p></div>`
      case "counter": {
        const num = s.ending_number || s.starting_number || "0"
        return `<div style="text-align:${align};margin:16px 0"><span style="font-size:48px;font-weight:800;color:${color || "#e74c3c"}">${s.prefix || ""}${num}${s.suffix || ""}</span>${s.title ? `<p style="font-size:14px;color:#666;margin-top:4px">${s.title}</p>` : ""}</div>`
      }
      case "star-rating":
        return `<div style="text-align:${align};margin:8px 0;font-size:24px;color:#f1c40f">${"★".repeat(Math.round(Number(s.rating) || 5))}</div>`
      case "divider":
        return `<hr style="border:none;border-top:1px solid rgba(0,0,0,.1);margin:24px auto;max-width:80%" />`
      case "spacer":
        return `<div style="height:${s.space?.size || 30}px"></div>`
      case "form":
        return `<div style="background:#f8f9fa;padding:32px;border-radius:12px;margin:20px auto;max-width:500px;text-align:center">
          <input style="width:100%;padding:14px;margin:6px 0;border:1px solid #ddd;border-radius:8px;font-size:15px" placeholder="Nome" />
          <input style="width:100%;padding:14px;margin:6px 0;border:1px solid #ddd;border-radius:8px;font-size:15px" placeholder="Email" />
          <input style="width:100%;padding:14px;margin:6px 0;border:1px solid #ddd;border-radius:8px;font-size:15px" placeholder="Telefono" />
          <button style="width:100%;padding:16px;margin-top:12px;background:#e74c3c;color:#fff;border:none;border-radius:8px;font-size:18px;font-weight:bold;cursor:pointer">${s.button_text || s.submit_text || "ORDINA ORA"}</button></div>`
      default: {
        const txt = s.title || s.editor || s.text || s.description || s.content || ""
        return txt ? `<div style="text-align:${align};${cs}margin:10px 0;line-height:1.6">${txt}</div>` : ""
      }
    }
  }
  const processEl = (el: any): string => {
    if (!el) return ""
    if (el.elType === "widget") return renderWidget(el)
    if (el.elements?.length) {
      const inner = el.elements.map(processEl).join("\n")
      if (el.elType === "column") {
        const w = el.settings?._column_size || 100
        return `<div style="flex:0 0 ${w}%;max-width:${w}%;padding:0 15px">${inner}</div>`
      }
      if (el.elType === "section") {
        const st = el.settings || {}
        let bg = st.background_color ? `background-color:${st.background_color};` : ""
        if (st.background_image?.url) bg += `background-image:url('${st.background_image.url}');background-size:cover;background-position:center;`
        const pad = st.padding
        const ps = pad ? `padding:${pad.top || 40}px ${pad.right || 20}px ${pad.bottom || 40}px ${pad.left || 20}px;` : "padding:40px 20px;"
        const cols = el.elements.filter((e: any) => e.elType === "column").length
        return `<section style="${bg}${ps}"><div style="max-width:900px;margin:0 auto;display:flex;${cols > 1 ? "flex-direction:row;flex-wrap:wrap;" : "flex-direction:column;"}align-items:center">${inner}</div></section>`
      }
      return inner
    }
    return ""
  }
  const body = (json.content || []).map(processEl).join("\n")
  const pageBg = json.page_settings?.background_color || "#ffffff"
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${json.title || "Landing Preview"}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:${pageBg};color:#333}img{max-width:100%;height:auto}a{text-decoration:none;cursor:pointer}h1{font-size:2.5em;font-weight:800}h2{font-size:2em;font-weight:700}h3{font-size:1.5em;font-weight:600}section{overflow:hidden}</style></head><body>${body}</body></html>`
}

const AGENT_ROLE_TEMPLATE = `Sei l'AI Assistant di FB Ads Manager — un esperto di performance marketing e gestione campagne Facebook Ads.

HAI ACCESSO AI DATI DEL TOOL IN TEMPO REALE:
{CONTEXT}

COSA PUOI FARE:

**ADS MANAGER — GESTIONE COMPLETA FACEBOOK:**
- Analizzare performance campagne (spesa, ROAS, CPA, CTR)
- Suggerire ottimizzazioni, pausare/attivare campagne, cambiare budget
- Identificare campagne in perdita/profittevoli
- CREARE nuove campagne Facebook (con obiettivo, budget, bid strategy)
- CREARE adset (con targeting, budget, pixel, ottimizzazione)
- CREARE ads (con creative: testo, headline, immagine/video, CTA)
- DUPLICARE campagne esistenti (con adset e ads)
- MODIFICARE adset (targeting, budget, bid, status)
- MODIFICARE ads (status, creative)
- Vedere la struttura completa di una campagna (adset → ads → targeting)
- Cercare interessi Facebook per il targeting
- Sincronizzare dati e approval rate

**FUNNEL BUILDER (via conversazione):**
- Creare landing page (formato Elementor JSON) a partire dai dati prodotto
- Tradurre landing in altre lingue
- Generare script video ads (UGC, storytelling, demo, comparison)
- Generare copy retargeting ads per Facebook/Instagram
- Generare funnel completo (landing + video + retargeting)

Per la creazione contenuti, ESTRAI I DATI PRODOTTO dalla conversazione e salvali in extractedData:
- nome, descrizione, prezzoP (prezzo pieno), prezzoS (prezzo scontato)
- spedizione, garanzia, target, categoria (GADGET/HEALTH/BEAUTY/HOME/FOOD/TECH)
- pageType (LANDING/ADVERTORIAL), copywritingFramework (AIDA/PAS/BAB/4P/STAR)

AZIONI (campo "suggestedAction"):

Ads Manager — Gestione:
- "sync_campaigns" — Sincronizza campagne
- "pause_campaign" — extractedData.campaignName
- "activate_campaign" — extractedData.campaignName
- "pause_multiple" — extractedData.campaignNames[]
- "activate_multiple" — extractedData.campaignNames[]
- "update_budget" — extractedData.campaignName + extractedData.budget
- "get_campaign_details" — extractedData.campaignName
- "get_campaign_structure" — Struttura completa campagna → adset → ads (extractedData.campaignName)
- "search_interests" — Cerca interessi per targeting (extractedData.query)

Ads Manager — Creazione:
- "create_campaign" — extractedData: name, objective (OUTCOME_LEADS/OUTCOME_SALES/OUTCOME_TRAFFIC), dailyBudget, bidStrategy, status, accountName
- "create_adset" — extractedData: campaignName, name, dailyBudget, optimizationGoal, targeting (JSON), status, pixelId, bidAmount
- "create_ad" — extractedData: adsetName, name, pageId, link, primaryText, headline, description, imageUrl/videoId, callToAction, status

Ads Manager — Duplicazione:
- "duplicate_campaign" — extractedData: campaignName, newName, budget, status

Ads Manager — Modifica:
- "update_adset" — extractedData: adsetName/adsetId, updates: { name, status, dailyBudget, bidAmount, targeting, optimizationGoal }
- "update_ad" — extractedData: adId, updates: { name, status, creativeId }

Funnel Builder:
- "create_landing" — Genera landing page Elementor JSON (extractedData = dati prodotto: nome, descrizione, prezzoP, prezzoS, etc.)
- "create_video_ads" — Genera script video ads (extractedData = dati prodotto + videoStile: ugc/storytelling/demo/comparison)
- "create_retargeting" — Genera ads retargeting Facebook (extractedData = dati prodotto + audience + piattaforma)
- "create_funnel" — Genera funnel completo (landing + video + retargeting in sequenza)
- "translate_landing" — Traduci landing generata (extractedData.lingua = lingua target)

REGOLE CRITICHE:
- Rispondi SEMPRE in italiano
- Usa i DATI REALI, NON inventare numeri
- Quando l'utente conferma ("ok", "sì", "fai", "procedi", "vai", "fallo") → autoExecute: true, confidence: 1.0
- Quando l'utente ORDINA direttamente → autoExecute: true, confidence: 1.0
- "spegni" = pause_campaign, "accendi" = activate_campaign
- Per il funnel builder: quando hai raccolto abbastanza dati (almeno nome + descrizione), PROPONI di creare
- NON fare questionari robotici — conversa naturalmente, chiedi info mancanti una alla volta
- Se l'utente parla di un prodotto, analizzalo: punti di forza, target, angoli di vendita
- SPECIFICA SEMPRE dati concreti in extractedData`

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "agent",
    content: "Ciao! Sono il tuo **AI Assistant** per FB Ads Manager.\n\n**Ads Manager** — Analizzo campagne, suggerisco ottimizzazioni, pauso/attivo campagne, cambio budget.\n\n**Funnel Builder** — Creo landing page, script video ads, copy retargeting, funnel completi. Parlami del prodotto e ti guido.\n\nDimmi cosa ti serve!",
    time: formatTime(),
  }])
  const [input, setInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [agentSession, setAgentSession] = useState<any>(null)
  const [agentUser, setAgentUser] = useState<any>(null)
  const [agentLoginEmail, setAgentLoginEmail] = useState("")
  const [agentLoginPassword, setAgentLoginPassword] = useState("")
  const [agentLoginError, setAgentLoginError] = useState("")
  const [agentLoggedIn, setAgentLoggedIn] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [toolContext, setToolContext] = useState<any>(null)
  const [productData, setProductData] = useState<any>({})
  const [generatedContent, setGeneratedContent] = useState<any>({})
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [memoryCount, setMemoryCount] = useState(0)
  const [showMemory, setShowMemory] = useState(false)
  const [memoryList, setMemoryList] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const agentSupabase = useRef(createBrowserClient(AGENT_URL, AGENT_KEY))

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await agentSupabase.current.auth.getSession()
        if (session) {
          setAgentSession(session)
          const { data: { user } } = await agentSupabase.current.auth.getUser()
          setAgentUser(user)
          setAgentLoggedIn(true)
        }
      } catch { /* no session */ }
      setCheckingAuth(false)
    }
    init()
  }, [])

  const loadMemoryCount = useCallback(() => {
    fetch("/api/agent/memory?limit=100")
      .then(r => r.json())
      .then(d => {
        setMemoryCount(d.memories?.length || 0)
        setMemoryList(d.memories || [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (agentLoggedIn) {
      fetch("/api/agent/context").then(r => r.json()).then(d => setToolContext(d.context)).catch(() => {})
      loadMemoryCount()
    }
  }, [agentLoggedIn, loadMemoryCount])

  const handleAgentLogin = async () => {
    setAgentLoginError("")
    try {
      const { data, error } = await agentSupabase.current.auth.signInWithPassword({
        email: agentLoginEmail, password: agentLoginPassword,
      })
      if (error) { setAgentLoginError(error.message); return }
      if (data.session) {
        setAgentSession(data.session)
        setAgentUser(data.user)
        setAgentLoggedIn(true)
      }
    } catch { setAgentLoginError("Errore di connessione") }
  }

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const refreshContext = async () => {
    try {
      const res = await fetch("/api/agent/context")
      const d = await res.json()
      if (d.context) setToolContext(d.context)
      return d.context
    } catch { return toolContext }
  }

  const learnFromAction = useCallback(async (actionName: string, result: string, success: boolean, conversation: string) => {
    try {
      await fetch("/api/agent/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "learn",
          actionName,
          actionResult: result,
          wasSuccessful: success,
          conversation: conversation.substring(0, 500),
        }),
      })
    } catch { /* silent */ }
  }, [])

  const executeAction = async (action: string, params: any): Promise<{ message: string; type?: string; offers?: any[] }> => {
    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      })
      const result = await res.json()
      const success = !!result.success
      if (success) await refreshContext()

      const lastUserMsg = chatHistory.filter(h => h.role === "user").slice(-1)[0]?.content || ""
      learnFromAction(action, result.message || "", success, lastUserMsg)

      return {
        message: result.message || result.error || "Azione completata",
        type: result.type,
        offers: result.offers,
      }
    } catch { return { message: "Errore nell'esecuzione" } }
  }

  const callEdgeFunction = async (action: string, data: any) => {
    let session = agentSession
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
      const { data: refreshed } = await agentSupabase.current.auth.refreshSession()
      if (refreshed?.session) { session = refreshed.session; setAgentSession(session) }
    }
    const res = await fetch(`${AGENT_URL}/functions/v1/funnel-builder-claude-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": AGENT_KEY,
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, userId: agentUser?.id, data }),
    })
    if (!res.ok) throw new Error(`Edge Function error: ${res.status}`)
    return await res.json()
  }

  const extractTextsFromElementor = (obj: any, texts: any[] = []): any[] => {
    if (typeof obj !== "object" || obj === null) return texts
    const textFields = [
      "editor", "text", "title", "description", "button_text", "heading", "sub_heading",
      "heading_title", "heading_description", "heading_subtitle", "title_text", "description_text",
      "testimonial_content", "testimonial_name", "testimonial_job", "tab_title", "tab_content",
      "accordion_title", "accordion_content", "list_title", "list_text", "item_text", "item_title",
      "item_description", "content", "inner_text", "link_text", "label", "ribbon_title",
      "box_title", "box_description",
    ]
    for (const key in obj) {
      const value = obj[key]
      if (textFields.includes(key) && typeof value === "string" && value.trim().length > 1) {
        if (!value.startsWith("<style") && !value.startsWith("<script") &&
            !value.startsWith("http://") && !value.startsWith("https://") &&
            !value.match(/^rgba?\([0-9,\s]+\)$/) && !value.match(/^#[0-9A-F]{6}$/i)) {
          const hasReadableText = value.replace(/<[^>]+>/g, "").trim().length > 0
          if (hasReadableText) texts.push({ originalText: value, reference: { parent: obj, key } })
        }
      }
      if (typeof value === "object") extractTextsFromElementor(value, texts)
    }
    return texts
  }

  const executeFunnelAction = async (actionName: string, data: any): Promise<string | { message: string; actions?: any[] }> => {
    try {
      setProductData((prev: any) => ({ ...prev, ...data }))
      const merged = { ...productData, ...data }

      if (actionName === "create_landing") {
        const geoLangMap: Record<string, string> = {
          ES: "Español", IT: "Italiano", BG: "Български", PL: "Polski", PT: "Português",
          FR: "Français", DE: "Deutsch", RO: "Română", CZ: "Čeština", GR: "Ελληνικά",
          HR: "Hrvatski", HU: "Magyar", SK: "Slovenčina", SI: "Slovenščina", RS: "Srpski",
          TR: "Türkçe", NL: "Nederlands", SE: "Svenska", NO: "Norsk", DK: "Dansk",
          FI: "Suomi", UK: "English", US: "English", GB: "English", BR: "Português (Brasil)",
          MX: "Español (México)", AR: "Español (Argentina)", CL: "Español (Chile)", CO: "Español (Colombia)",
        }
        const geo = (merged.paese || merged.geo || "").toUpperCase()
        const lingua = merged.lingua || geoLangMap[geo] || "Italiano"

        const formFieldsByGeo: Record<string, { fields: string[]; submit: string }> = {
          ES: { fields: ["Nombre", "Teléfono"], submit: "¡PIDE AHORA!" },
          IT: { fields: ["Nome", "Telefono"], submit: "ORDINA ORA!" },
          BG: { fields: ["Име", "Телефон"], submit: "ПОРЪЧАЙ СЕГА!" },
          PL: { fields: ["Imię", "Telefon"], submit: "ZAMÓW TERAZ!" },
          PT: { fields: ["Nome", "Telefone"], submit: "PEÇA AGORA!" },
          FR: { fields: ["Nom", "Téléphone"], submit: "COMMANDEZ MAINTENANT!" },
          DE: { fields: ["Name", "Telefon"], submit: "JETZT BESTELLEN!" },
          RO: { fields: ["Nume", "Telefon"], submit: "COMANDĂ ACUM!" },
          CZ: { fields: ["Jméno", "Telefon"], submit: "OBJEDNAT!" },
          GR: { fields: ["Όνομα", "Τηλέφωνο"], submit: "ΠΑΡΑΓΓΕΙΛΤΕ ΤΩΡΑ!" },
          HR: { fields: ["Ime", "Telefon"], submit: "NARUČITE SADA!" },
          HU: { fields: ["Név", "Telefon"], submit: "RENDELJEN MOST!" },
          TR: { fields: ["Ad", "Telefon"], submit: "ŞİMDİ SİPARİŞ VER!" },
          DEFAULT: { fields: ["Name", "Phone"], submit: "ORDER NOW!" },
        }
        const formConfig = formFieldsByGeo[geo] || formFieldsByGeo["DEFAULT"]
        const formPrompt = `\n\nIMPORTANTE: La landing DEVE includere un widget "form" di tipo Elementor con i campi: ${formConfig.fields.join(", ")}. Il bottone submit deve dire "${formConfig.submit}". Il form deve essere posizionato nella parte alta della landing (dopo l'hero) E anche in fondo alla landing. TUTTO il testo deve essere in ${lingua}. NON scrivere nulla in italiano se la lingua è diversa.`

        addMessage({ role: "system", content: `Analisi CRO + generazione landing page in ${lingua}... (può richiedere 30-60s)`, time: formatTime() })
        const result = await callEdgeFunction("create", {
          nome: merged.nome || "Prodotto",
          descrizione: merged.descrizione || "",
          prezzoP: merged.prezzoP || "",
          prezzoS: merged.prezzoS || "",
          scontoPerc: merged.scontoPerc || "",
          offertaFormula: merged.offertaFormula || "",
          offertaQty: merged.offertaQty || "",
          spedizione: merged.spedizione || "",
          garanzia: merged.garanzia || "",
          target: merged.target || "",
          categoria: merged.categoria || "GADGET",
          pageType: merged.pageType || "LANDING",
          copywritingFramework: merged.copywritingFramework || "AIDA",
          lingua,
          customPrompt: (merged.customPrompt || "") + formPrompt,
        })
        if (result.json) {
          let landingJson = result.json
          const linguaName = resolveLanguageName(lingua, geo)

          let formModuleJson: any = null
          if (merged.tm || merged.trafficManager) {
            try {
              const tmRes = await fetch("/api/traffic-manager", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "get_form_module", tmName: merged.tm || merged.trafficManager }),
              })
              const tmData = await tmRes.json()
              if (tmData.formModule) formModuleJson = tmData.formModule
            } catch { /* no form module */ }
          }

          landingJson = postProcessLanding(landingJson, {
            productData: {
              nome: merged.nome,
              currency: merged.valuta || merged.currency,
              currencySymbol: merged.currencySymbol || merged.simboloValuta,
              offerImage: merged.immagine || merged.offerImage,
              productImages: merged.productImages,
              offerId: merged.offerId || merged._offerId,
              selectedLpId: merged.selectedLpId || merged._selectedLpId,
            },
            lingua: linguaName,
            formModuleJson,
          })

          const postProcessNotes: string[] = []
          if (formModuleJson) postProcessNotes.push(`Modulo form di ${merged.tm || merged.trafficManager} iniettato`)
          postProcessNotes.push("Sezione modulo con CTA localizzata aggiunta")
          postProcessNotes.push("Footer legale tradotto aggiunto")
          postProcessNotes.push("Padding sezioni compresso")
          if (merged.immagine || merged.offerImage) postProcessNotes.push("Immagine prodotto iniettata nell'hero")

          addMessage({ role: "system", content: `Post-processing Baba Yaga completato:\n• ${postProcessNotes.join("\n• ")}`, time: formatTime() })

          setGeneratedContent((prev: any) => ({ ...prev, landing: landingJson }))
          const html = elementorToHtml(landingJson)
          setPreviewHtml(html)
          setShowPreview(true)
          const sections = landingJson.content?.length || 0
          return {
            message: `Landing page generata in **${lingua}**! ${sections} sezioni con post-processing completo (modulo, footer, padding, traduzioni).\n\nL'anteprima è aperta — controlla il risultato.\n\n**Cosa vuoi fare adesso?**`,
            actions: [
              { label: "Vedi Anteprima", value: "preview_landing" },
              { label: "Genera Immagini AI", value: "generate_images", params: { ...merged, lingua } },
              { label: "Crea Thank Page", value: "create_thank_page", params: { ...merged, lingua } },
              { label: "Pubblica su WordPress", value: "publish_wordpress", params: { ...merged, lingua, pageType: "landing", pageTitle: merged.nome || "Landing Page" } },
              { label: "Crea Copy Ads Facebook", value: "prompt_ad_copy" },
              { label: "Strategia Lancio FB", value: "prompt_launch_strategy" },
            ],
          }
        }
        return result.error || "Errore nella generazione della landing"
      }

      if (actionName === "generate_images") {
        if (!generatedContent.landing) return "Nessuna landing disponibile. Crea prima una landing page."
        addMessage({ role: "system", content: "Generazione immagini AI contestuali... Claude analizza ogni sezione, poi fal.ai genera immagini coerenti (30-60s)", time: formatTime() })
        const result = await callEdgeFunction("generate_landing_images", {
          json: generatedContent.landing,
          nome: merged.nome || "Prodotto",
          descrizione: merged.descrizione || "",
          categoria: merged.categoria || "GADGET",
          target: merged.target || "",
        })
        if (result.json) {
          setGeneratedContent((prev: any) => ({ ...prev, landing: result.json }))
          const html = elementorToHtml(result.json)
          setPreviewHtml(html)
          if (showPreview) setShowPreview(true)
          return {
            message: `Immagini generate! ${result.imagesGenerated || 0}/${result.totalSlots || 0} placeholder riempiti con immagini AI contestuali.\n\n**Cosa vuoi fare adesso?**`,
            actions: [
              { label: "Vedi Anteprima", value: "preview_landing" },
              { label: "Crea Copy Ads Facebook", value: "prompt_ad_copy" },
              { label: "Crea Script Video Ads", value: "create_video_ads", params: merged },
              { label: "Strategia Lancio FB", value: "prompt_launch_strategy" },
              { label: "Traduci Landing", value: "prompt_translate_landing" },
            ],
          }
        }
        return result.error || "Errore nella generazione immagini"
      }

      if (actionName === "create_thank_page") {
        addMessage({ role: "system", content: "Generazione thank you page...", time: formatTime() })
        const lingua = merged.lingua || merged.paese || "Italiano"
        const result = await callEdgeFunction("create", {
          nome: merged.nome || "Prodotto",
          descrizione: `Thank you page / pagina di ringraziamento per ${merged.nome || "il prodotto"}. Messaggio di conferma ordine, riepilogo, tempi di spedizione.`,
          prezzoP: merged.prezzoP || "",
          prezzoS: merged.prezzoS || "",
          target: merged.target || "",
          categoria: merged.categoria || "GADGET",
          pageType: "THANK_PAGE",
          copywritingFramework: "AIDA",
          lingua,
          customPrompt: "Crea una THANK YOU PAGE con: messaggio di conferma ordine entusiasta, riepilogo prodotto, tempi di consegna stimati (3-5 giorni lavorativi), contatti assistenza, e un messaggio rassicurante sulla garanzia. Stile professionale e rassicurante.",
        })
        if (result.json) {
          setGeneratedContent((prev: any) => ({ ...prev, thank_page: result.json }))
          const html = elementorToHtml(result.json)
          setPreviewHtml(html)
          setShowPreview(true)
          return {
            message: `Thank Page generata in ${lingua}!\n\n**Cosa vuoi fare?**`,
            actions: [
              { label: "Vedi Anteprima", value: "preview_landing" },
              { label: "Pubblica su WordPress", value: "publish_wordpress", params: { ...merged, pageType: "thank_page", pageTitle: `Thank You - ${merged.nome || "Ordine"}` } },
              { label: "Crea Copy Ads Facebook", value: "prompt_ad_copy" },
              { label: "Strategia Lancio FB", value: "prompt_launch_strategy" },
            ],
          }
        }
        return result.error || "Errore nella generazione della thank page"
      }

      if (actionName === "create_video_ads") {
        addMessage({ role: "system", content: "Generazione script video ads...", time: formatTime() })
        const result = await callEdgeFunction("video-ads", {
          nome: merged.nome || "Prodotto",
          descrizione: merged.descrizione || "",
          target: merged.target || "Audience generale",
          categoria: merged.categoria || "GADGET",
          framework: merged.copywritingFramework || "AIDA",
          stile: merged.videoStile || "ugc",
          videoDuration: parseInt(merged.videoDuration) || 90,
          lingua: merged.lingua || null,
          currency: merged.currency || "EUR",
          currencySymbol: merged.currencySymbol || "€",
          prezzoS: merged.prezzoS || "",
          prezzoP: merged.prezzoP || "",
          offertaFormula: merged.offertaFormula || "",
          customPrompt: merged.customPrompt || "",
        })
        if (result.data?.script) {
          setGeneratedContent((prev: any) => ({ ...prev, videoAds: result.data.script }))
          return `Script video ads generato! (${result.data.tokens_used || 0} tokens)\n\n${result.data.script}`
        }
        return result.error || "Errore nella generazione video ads"
      }

      if (actionName === "create_retargeting") {
        addMessage({ role: "system", content: "Generazione ads retargeting...", time: formatTime() })
        const result = await callEdgeFunction("retargeting-ads", {
          nomeProdotto: merged.nome || "Prodotto",
          descrizione: merged.descrizione || "",
          audience: merged.retargAudience || merged.audience || "Visitatori sito",
          piattaforma: merged.retargPiattaforma || merged.piattaforma || "Facebook/Instagram",
          formato: merged.formato || "Carosello",
          strategia: merged.strategia || "Urgenza + Social Proof",
          offerta: merged.offerta || "",
          varianti: merged.varianti || 5,
          lingua: merged.lingua || null,
          currency: merged.currency || "EUR",
          currencySymbol: merged.currencySymbol || "€",
          prezzoS: merged.prezzoS || "",
          prezzoP: merged.prezzoP || "",
          offertaFormula: merged.offertaFormula || "",
          generateImages: false,
          customPrompt: merged.customPrompt || "",
        })
        if (result.data?.ads) {
          setGeneratedContent((prev: any) => ({ ...prev, retargeting: result.data.ads }))
          return `Ads retargeting generati! (${result.data.tokens_used || 0} tokens)\n\n${result.data.ads}`
        }
        return result.error || "Errore nella generazione retargeting"
      }

      if (actionName === "create_funnel") {
        addMessage({ role: "system", content: "Generazione funnel completo (landing + video + retargeting)... Ci vorrà qualche minuto.", time: formatTime() })

        addMessage({ role: "system", content: "Step 1/3: Generazione landing page...", time: formatTime() })
        const landingResult = await callEdgeFunction("create", {
          nome: merged.nome || "Prodotto", descrizione: merged.descrizione || "",
          prezzoP: merged.prezzoP || "", prezzoS: merged.prezzoS || "",
          scontoPerc: merged.scontoPerc || "", offertaFormula: merged.offertaFormula || "",
          spedizione: merged.spedizione || "", garanzia: merged.garanzia || "",
          target: merged.target || "", categoria: merged.categoria || "GADGET",
          pageType: merged.pageType || "LANDING", copywritingFramework: merged.copywritingFramework || "AIDA",
          lingua: merged.lingua || "Italiano", customPrompt: merged.customPrompt || "",
        })
        if (landingResult.json) setGeneratedContent((prev: any) => ({ ...prev, landing: landingResult.json }))

        addMessage({ role: "system", content: "Step 2/3: Generazione script video ads...", time: formatTime() })
        const videoResult = await callEdgeFunction("video-ads", {
          nome: merged.nome || "Prodotto", descrizione: merged.descrizione || "",
          target: merged.target || "Audience generale", categoria: merged.categoria || "GADGET",
          framework: merged.copywritingFramework || "AIDA", stile: merged.videoStile || "ugc",
          videoDuration: parseInt(merged.videoDuration) || 90, lingua: merged.lingua || null,
          prezzoS: merged.prezzoS || "", prezzoP: merged.prezzoP || "",
        })
        if (videoResult.data?.script) setGeneratedContent((prev: any) => ({ ...prev, videoAds: videoResult.data.script }))

        addMessage({ role: "system", content: "Step 3/3: Generazione ads retargeting...", time: formatTime() })
        const retargResult = await callEdgeFunction("retargeting-ads", {
          nomeProdotto: merged.nome || "Prodotto", descrizione: merged.descrizione || "",
          audience: merged.retargAudience || "Visitatori sito",
          piattaforma: merged.retargPiattaforma || "Facebook/Instagram",
          formato: "Carosello", strategia: "Urgenza + Social Proof",
          varianti: 5, lingua: merged.lingua || null, generateImages: false,
          prezzoS: merged.prezzoS || "", prezzoP: merged.prezzoP || "",
        })
        if (retargResult.data?.ads) setGeneratedContent((prev: any) => ({ ...prev, retargeting: retargResult.data.ads }))

        const parts = []
        if (landingResult.json) parts.push("Landing page")
        if (videoResult.data?.script) parts.push("Video Ads script")
        if (retargResult.data?.ads) parts.push("Retargeting ads")
        return `Funnel completo generato! ${parts.join(" + ")} pronti. Scarica o copia dal pannello sotto.`
      }

      if (actionName === "clone_landing") {
        addMessage({ role: "system", content: `Analizzo e clono la landing da ${data.url}...`, time: formatTime() })
        const result = await callEdgeFunction("modify", {
          json: { version: "0.4", title: "Cloned", type: "page", content: [], page_settings: {} },
          prompt: `Clona questa landing page competitor: ${data.url}. Ricrea la struttura e il copy in formato Elementor JSON, mantenendo lo stesso stile e la stessa efficacia ma con copy originale${data.lingua ? ` in ${data.lingua}` : ""}.`,
        })
        if (result.json) {
          setGeneratedContent((prev: any) => ({ ...prev, landing: result.json }))
          return "Landing clonata con successo!"
        }
        return result.error || "Errore nella clonazione"
      }

      if (actionName === "translate_landing") {
        const landingJson = generatedContent.landing
        if (!landingJson) return "Nessuna landing da tradurre. Creane una prima."
        const lingua = data.lingua || "English"
        addMessage({ role: "system", content: `Traduzione landing in ${lingua}...`, time: formatTime() })

        const jsonCopy = JSON.parse(JSON.stringify(landingJson))
        const extractedTexts = extractTextsFromElementor(jsonCopy)
        const totalTexts = extractedTexts.length
        if (totalTexts === 0) return "Nessun testo trovato nella landing da tradurre."

        addMessage({ role: "system", content: `Trovati ${totalTexts} testi da tradurre...`, time: formatTime() })

        let batchIndex = 0
        let allTranslated: any[] = []
        while (true) {
          const result = await callEdgeFunction("translate", { json: landingJson, lingua, batchIndex, batchSize: 8 })
          if (result.textsTranslated) allTranslated = [...allTranslated, ...result.textsTranslated]
          const progress = Math.min(100, Math.round(((result.endIndex || 0) / totalTexts) * 100))
          addMessage({ role: "system", content: `Traduzione: ${progress}% (${result.endIndex || 0}/${totalTexts})`, time: formatTime() })
          if (result.isComplete || !result.nextBatchIndex) break
          batchIndex = result.nextBatchIndex
        }

        for (let i = 0; i < extractedTexts.length && i < allTranslated.length; i++) {
          const t = allTranslated[i]
          const ref = extractedTexts[i].reference
          if (ref?.parent && ref?.key && t.new) {
            ref.parent[ref.key] = t.new
          }
        }

        setGeneratedContent((prev: any) => ({ ...prev, [`landing_${lingua}`]: jsonCopy }))
        return `Landing tradotta in ${lingua}! ${allTranslated.length} testi tradotti.`
      }

      return "Azione non riconosciuta"
    } catch (e: any) {
      return `Errore: ${e.message || "Errore nella generazione"}`
    }
  }

  const sendToAI = async (text: string) => {
    if (isProcessing) return
    setIsProcessing(true)

    const adsActions = [
      "pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple",
      "update_budget", "sync_campaigns", "get_campaign_details", "get_campaign_structure",
      "sync_traffic_manager", "search_offers", "fetch_offers",
      "publish_wordpress", "change_lp_offer",
      "create_campaign", "create_adset", "create_ad",
      "duplicate_campaign", "update_adset", "update_ad",
      "search_interests",
    ]
    const funnelActions = [
      "create_landing", "create_video_ads", "create_retargeting",
      "create_funnel", "translate_landing", "generate_images",
      "create_thank_page",
    ]
    const actionLabels: Record<string, (d: any) => string> = {
      pause_campaign: d => `Pausa "${d.campaignName || ""}"`,
      activate_campaign: d => `Attiva "${d.campaignName || ""}"`,
      pause_multiple: d => `Pausa ${(d.campaignNames || []).length} campagne`,
      activate_multiple: d => `Attiva ${(d.campaignNames || []).length} campagne`,
      update_budget: d => `Budget → €${d.budget || "?"}`,
      sync_campaigns: () => "Sincronizza",
      get_campaign_details: () => "Dettagli Campagna",
      get_campaign_structure: d => `Struttura "${d.campaignName || ""}"`,
      sync_traffic_manager: () => "Sincronizza Traffic Manager",
      search_offers: () => "Cerca Offerte Network",
      fetch_offers: () => "Carica Offerte Network",
      create_campaign: d => `Crea Campagna "${d.name || ""}"`,
      create_adset: d => `Crea Adset "${d.name || ""}"`,
      create_ad: d => `Crea Ad "${d.name || ""}"`,
      duplicate_campaign: d => `Duplica "${d.campaignName || ""}"`,
      update_adset: d => `Modifica Adset`,
      update_ad: d => `Modifica Ad ${d.adId || ""}`,
      search_interests: d => `Cerca Interessi "${d.query || ""}"`,
      create_landing: d => `Crea Landing "${d.nome || ""}"`,
      create_video_ads: d => `Crea Video Ads "${d.nome || ""}"`,
      create_retargeting: d => `Crea Retargeting "${d.nome || ""}"`,
      create_funnel: d => `Funnel Completo "${d.nome || ""}"`,
      translate_landing: d => `Traduci in ${d.lingua || "..."}`,
      generate_images: () => "Genera Immagini AI",
      create_thank_page: d => `Thank Page "${d.nome || ""}"`,
      publish_wordpress: d => `Pubblica su WP "${d.pageTitle || ""}"`,
      change_lp_offer: () => "Cambia LP/Offerta",
    }

    let runningHistory = [...chatHistory, { role: "user", content: text }]
    setChatHistory(runningHistory)

    let loopCount = 0
    const maxLoops = 5

    try {
      while (loopCount < maxLoops) {
        const msg = loopCount === 0 ? text : runningHistory[runningHistory.length - 1].content

        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, history: runningHistory.slice(-20) }),
        })

        if (!res.ok) {
          addMessage({ role: "agent", content: `Errore AI: ${res.status}. Controlla le API key nelle Impostazioni.`, time: formatTime() })
          break
        }

        const result = await res.json()
        const reply = result.reply || result.error || "Non ho capito, puoi ripetere?"
        runningHistory = [...runningHistory, { role: "assistant", content: reply }]
        setChatHistory([...runningHistory])
        addMessage({ role: "agent", content: reply, time: formatTime() })

        const shouldExecute = result.autoExecute === true || (result.confidence || 0) >= 0.95
        const actionName = result.suggestedAction
        const extractedData = result.extractedData || {}

        if (extractedData && Object.keys(extractedData).length > 0) {
          setProductData((prev: any) => ({ ...prev, ...extractedData }))
        }

        if (!shouldExecute || !actionName) {
          if (actionName && (result.confidence || 0) >= 0.5) {
            const label = actionLabels[actionName]?.(extractedData) || actionName
            if ([...adsActions, ...funnelActions].includes(actionName)) {
              setMessages(prev => {
                const last = prev[prev.length - 1]
                if (last?.role === "agent") return [...prev.slice(0, -1), { ...last, actions: [{ label, value: actionName, params: extractedData }] }]
                return prev
              })
            }
          }
          break
        }

        let actionResultText = ""
        let actionResultOffers: any[] | undefined

        if (actionName === "publish_wordpress") {
          const contentKey = extractedData.pageType === "thank_page" ? "thank_page" : "landing"
          const content = generatedContent[contentKey]
          if (!content) {
            actionResultText = `Nessuna ${contentKey} da pubblicare. Crea prima il contenuto.`
            addMessage({ role: "agent", content: actionResultText, time: formatTime() })
          } else {
            const html = elementorToHtml(content)
            addMessage({ role: "system", content: `Pubblicazione su WordPress...`, time: formatTime() })
            const actionResult = await executeAction("publish_wordpress", { ...extractedData, htmlContent: html })
            actionResultText = actionResult.message
            addMessage({ role: "agent", content: actionResult.message, time: formatTime() })
          }
        } else if (adsActions.includes(actionName)) {
          addMessage({ role: "system", content: `Esecuzione: ${actionName}...`, time: formatTime() })
          const actionResult = await executeAction(actionName, extractedData)
          actionResultText = actionResult.message
          actionResultOffers = actionResult.offers
          addMessage({ role: "agent", content: actionResult.message, time: formatTime(), offers: actionResult.offers })
        } else if (funnelActions.includes(actionName)) {
          const funnelResult = await executeFunnelAction(actionName, extractedData)
          if (typeof funnelResult === "string") {
            actionResultText = funnelResult
            addMessage({ role: "agent", content: funnelResult, time: formatTime() })
          } else {
            addMessage({ role: "agent", content: funnelResult.message, time: formatTime(), actions: funnelResult.actions })
            break
          }
        } else {
          break
        }

        const feedbackParts = [actionResultText]
        if (actionResultOffers && actionResultOffers.length > 0) {
          const offersSummary = actionResultOffers.slice(0, 15).map(o =>
            `{id:${o.id}, nome:"${o.nome}", paese:"${o.paese}", payout:${o.payout}, verticale:"${o.verticale}", prezzo:"${o.prezzo || ""}", descrizione:"${o.descrizione || ""}"}`
          ).join(",\n")
          feedbackParts.push(`\nDati offerte ricevuti:\n[${offersSummary}]`)
        }

        runningHistory = [...runningHistory, { role: "user", content: `[SISTEMA — Risultato azione "${actionName}"]:\n${feedbackParts.join("")}` }]
        setChatHistory([...runningHistory])

        loopCount++
      }
    } catch (e) {
      addMessage({ role: "agent", content: "Errore di connessione. Riprova.", time: formatTime() })
    }
    setIsProcessing(false)
    loadMemoryCount()
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    addMessage({ role: "user", content: text, time: formatTime() })
    sendToAI(text)
  }

  const handleQuickAction = async (value: string, params?: any) => {
    if (value === "preview_landing") {
      if (generatedContent.landing) {
        setPreviewHtml(elementorToHtml(generatedContent.landing))
        setShowPreview(true)
      }
      return
    }

    const adsActions = ["pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple", "update_budget", "sync_campaigns", "get_campaign_details", "get_campaign_structure", "sync_traffic_manager", "search_offers", "fetch_offers", "create_campaign", "create_adset", "create_ad", "duplicate_campaign", "update_adset", "update_ad", "search_interests"]
    const funnelActions = ["create_landing", "create_video_ads", "create_retargeting", "create_funnel", "translate_landing", "generate_images"]

    if (value === "publish_wordpress" && params) {
      setIsProcessing(true)
      const contentKey = params.pageType === "thank_page" ? "thank_page" : "landing"
      const content = generatedContent[contentKey]
      if (!content) {
        addMessage({ role: "agent", content: `Nessuna ${contentKey === "thank_page" ? "thank page" : "landing page"} da pubblicare. Creane una prima.`, time: formatTime() })
        setIsProcessing(false)
        return
      }
      const html = elementorToHtml(content)
      addMessage({ role: "system", content: `Pubblicazione ${params.pageType || "landing"} su WordPress...`, time: formatTime() })
      const result = await executeAction("publish_wordpress", { ...params, htmlContent: html })
      addMessage({ role: "agent", content: result.message, time: formatTime() })
      setIsProcessing(false)
      return
    }

    if (adsActions.includes(value) && params) {
      setIsProcessing(true)
      addMessage({ role: "system", content: `Esecuzione: ${value}...`, time: formatTime() })
      const result = await executeAction(value, params)
      addMessage({ role: "agent", content: result.message, time: formatTime(), offers: result.offers })
      setIsProcessing(false)
      return
    }
    if (funnelActions.includes(value) && params) {
      setIsProcessing(true)
      const result = await executeFunnelAction(value, params)
      if (typeof result === "string") {
        addMessage({ role: "agent", content: result, time: formatTime() })
      } else {
        addMessage({ role: "agent", content: result.message, time: formatTime(), actions: result.actions })
      }
      setIsProcessing(false)
      return
    }
    const prompt = ACTION_PROMPTS[value]
    if (prompt) {
      addMessage({ role: "user", content: prompt, time: formatTime() })
      sendToAI(prompt)
    }
  }

  const copyToClipboard = (content: any) => {
    const text = typeof content === "string" ? content : JSON.stringify(content, null, 2)
    navigator.clipboard.writeText(text)
    addMessage({ role: "system", content: "Copiato negli appunti!", time: formatTime() })
  }

  const downloadContent = (content: any, filename: string) => {
    const isText = typeof content === "string"
    const text = isText ? content : JSON.stringify(content, null, 2)
    const mimeType = filename.endsWith(".json") ? "application/json" : "text/plain"
    const blob = new Blob([text], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    addMessage({ role: "system", content: `Scaricato: ${filename}`, time: formatTime() })
  }

  const previewLanding = (content: any) => {
    const html = typeof content === "string" ? content : elementorToHtml(content)
    setPreviewHtml(html)
    setShowPreview(true)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6 bg-[#17212b]">
      <div className="flex items-center gap-3 px-5 py-3 bg-[#0e1621] border-b border-white/[0.08]">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
          <Bot size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">AI Assistant</p>
          <p className="text-xs text-green-400">Online — Accesso completo al tool</p>
        </div>
        <button
          onClick={() => { setShowMemory(!showMemory); if (!showMemory) loadMemoryCount() }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20"
          title="Memoria AI">
          <Brain size={14} />
          <span>{memoryCount}</span>
        </button>
        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/10"
          onClick={() => { setMessages([{ role: "agent", content: "Conversazione resettata. Come posso aiutarti?", time: formatTime() }]); setChatHistory([]); setProductData({}); setGeneratedContent({}) }}>
          <RefreshCw size={16} />
        </Button>
      </div>

      <div className="flex gap-2 px-5 py-3 overflow-x-auto bg-[#0e1621]/50 border-b border-white/[0.05]">
        {QUICK_ACTIONS.map(({ label, value, icon: Icon }) => (
          <button key={value} onClick={() => handleQuickAction(value)} disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/40 disabled:opacity-50">
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-[#2b5278] text-white rounded-br-md" : msg.role === "system" ? "bg-yellow-500/10 text-yellow-300 text-center max-w-[90%] rounded-lg text-xs border border-yellow-500/20" : "bg-[#182533] text-gray-100 rounded-bl-md"}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            <span className={`text-[11px] text-gray-500 mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>{msg.time}</span>
            {msg.offers && msg.offers.length > 0 && (
              <div className="mt-3 w-full max-w-[90vw] md:max-w-[600px]">
                <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {msg.offers.map((o: any, j: number) => {
                    const isActive = o.stato === "active" || o.stato === "1" || o.stato === 1
                    return (
                      <div key={j} className="bg-[#1e2d3d] rounded-lg p-3 border border-white/5 hover:border-purple-500/30 transition-colors cursor-pointer"
                        onClick={() => { setInput(`Parlami dell'offerta #${o.id} ${o.nome}`); }}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">{o.paese || "?"} - {o.nome || "—"}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
                            {isActive ? "Attiva" : o.stato || "?"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          <span>ID: {o.id}</span>
                          <span className="text-green-400">€{o.payout || "?"}</span>
                          <span className="text-purple-300">{o.verticale || "—"}</span>
                          <span>{o.paese || "—"}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Clicca su un&apos;offerta per saperne di più</p>
              </div>
            )}
            {msg.actions && msg.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {msg.actions.map((action, j) => (
                  <button key={j} onClick={() => handleQuickAction(action.value, action.params)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/30 hover:border-green-500 transition-all hover:-translate-y-0.5">
                    Esegui: {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-start">
            <div className="bg-[#182533] px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {Object.keys(generatedContent).length > 0 && (
        <div className="px-4 py-2 bg-[#0e1621]/80 border-t border-white/[0.05]">
          <p className="text-[11px] text-gray-500 mb-1.5 uppercase tracking-wider">Contenuti Generati</p>
          <div className="flex flex-wrap gap-2">
            {generatedContent.landing && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-green-400 mr-1">Landing</span>
                <button onClick={() => copyToClipboard(generatedContent.landing)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Copia"><Copy size={12} /></button>
                <button onClick={() => downloadContent(generatedContent.landing, "landing.json")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Scarica"><Download size={12} /></button>
                <button onClick={() => previewLanding(generatedContent.landing)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Anteprima"><Eye size={12} /></button>
              </div>
            )}
            {generatedContent.videoAds && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-blue-400 mr-1">Video Ads</span>
                <button onClick={() => copyToClipboard(generatedContent.videoAds)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Copia"><Copy size={12} /></button>
                <button onClick={() => downloadContent(generatedContent.videoAds, "video-ads-script.txt")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Scarica"><Download size={12} /></button>
              </div>
            )}
            {generatedContent.retargeting && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-purple-400 mr-1">Retargeting</span>
                <button onClick={() => copyToClipboard(generatedContent.retargeting)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Copia"><Copy size={12} /></button>
                <button onClick={() => downloadContent(generatedContent.retargeting, "retargeting-ads.txt")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Scarica"><Download size={12} /></button>
              </div>
            )}
            {Object.keys(generatedContent).filter(k => k.startsWith("landing_")).map(k => (
              <div key={k} className="flex items-center gap-1">
                <span className="text-xs text-yellow-400 mr-1">Landing ({k.replace("landing_", "")})</span>
                <button onClick={() => copyToClipboard(generatedContent[k])} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Copia"><Copy size={12} /></button>
                <button onClick={() => downloadContent(generatedContent[k], `${k}.json`)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Scarica"><Download size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3 bg-[#0e1621] border-t border-white/[0.08]">
        <div className="flex items-end gap-2 bg-[#242f3d] rounded-xl px-3 py-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Chiedi qualsiasi cosa... o dai un ordine diretto."
            rows={1}
            className="flex-1 bg-transparent border-none text-white text-sm resize-none outline-none max-h-[120px] min-h-[20px] placeholder:text-gray-500 leading-relaxed"
            onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px" }}
          />
          <button onClick={handleSend} disabled={isProcessing || !input.trim()}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 text-white transition-transform hover:scale-110 disabled:opacity-50">
            <Send size={14} />
          </button>
        </div>
      </div>

      {showMemory && (
        <div className="fixed inset-y-0 right-0 z-40 w-96 bg-[#0e1621] border-l border-white/10 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-purple-400" />
              <h3 className="text-sm font-semibold text-white">Memoria AI ({memoryCount} apprendimenti)</h3>
            </div>
            <button onClick={() => setShowMemory(false)} className="text-gray-400 hover:text-white text-lg">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {memoryList.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">L&apos;agente non ha ancora imparato nulla. Inizia a chattare!</p>
            ) : (
              memoryList.map((m: any, i: number) => {
                const catColors: Record<string, string> = {
                  user_preference: "bg-blue-500/20 text-blue-300",
                  successful_pattern: "bg-green-500/20 text-green-300",
                  mistake_learned: "bg-red-500/20 text-red-300",
                  campaign_insight: "bg-yellow-500/20 text-yellow-300",
                  strategy_knowledge: "bg-purple-500/20 text-purple-300",
                  offer_insight: "bg-pink-500/20 text-pink-300",
                  workflow_pattern: "bg-cyan-500/20 text-cyan-300",
                  correction: "bg-orange-500/20 text-orange-300",
                }
                const catLabels: Record<string, string> = {
                  user_preference: "Preferenza",
                  successful_pattern: "Successo",
                  mistake_learned: "Errore",
                  campaign_insight: "Campagna",
                  strategy_knowledge: "Strategia",
                  offer_insight: "Offerta",
                  workflow_pattern: "Workflow",
                  correction: "Correzione",
                }
                return (
                  <div key={m.id || i} className="bg-[#182533] rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${catColors[m.category] || "bg-gray-500/20 text-gray-300"}`}>
                        {catLabels[m.category] || m.category}
                      </span>
                      <span className="text-[10px] text-gray-500">imp: {m.importance}/10</span>
                      {m.times_used > 0 && <span className="text-[10px] text-gray-500">usata {m.times_used}x</span>}
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{m.content}</p>
                  </div>
                )
              })
            )}
          </div>
          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-[10px] text-gray-500 mb-2">L&apos;agente impara automaticamente da ogni interazione. Le memorie più importanti e recenti vengono usate per migliorare le risposte.</p>
          </div>
        </div>
      )}

      {showPreview && previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-[#0e1621] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <Eye size={18} className="text-green-400" />
              <h3 className="text-white font-semibold text-sm">Anteprima Landing Page</h3>
            </div>
            <div className="flex items-center gap-2">
              {generatedContent.landing && (
                <>
                  <button onClick={() => copyToClipboard(generatedContent.landing)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white transition-colors">
                    <Copy size={12} /> Copia JSON
                  </button>
                  <button onClick={() => downloadContent(generatedContent.landing, "landing.json")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white transition-colors">
                    <Download size={12} /> Scarica
                  </button>
                  <button onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(previewHtml); w.document.close() } }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white transition-colors">
                    <Rocket size={12} /> Apri Tab
                  </button>
                </>
              )}
              <button onClick={() => setShowPreview(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-300 hover:bg-red-500/40 hover:text-white transition-colors ml-2">
                ✕ Chiudi
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 bg-white">
              <iframe srcDoc={previewHtml} className="w-full h-full border-none" sandbox="allow-same-origin" title="Landing Preview" />
            </div>
            <div className="w-64 bg-[#0e1621] p-4 border-l border-white/10 flex flex-col gap-3 shrink-0 overflow-y-auto">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Prossimi Passi</p>
              <button onClick={() => { handleQuickAction("generate_images", productData) }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-violet-300 hover:from-violet-500/30 hover:to-pink-500/30 transition-colors">
                🖼️ Genera Immagini AI
              </button>
              <button onClick={() => { setShowPreview(false); handleQuickAction("prompt_ad_copy") }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-colors">
                📝 Crea Copy Ads Facebook
              </button>
              <button onClick={() => { setShowPreview(false); handleQuickAction("prompt_video") }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition-colors">
                🎬 Crea Script Video Ads
              </button>
              <button onClick={() => { setShowPreview(false); handleQuickAction("prompt_launch_strategy") }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-colors">
                🚀 Strategia Lancio FB
              </button>
              <button onClick={() => { setShowPreview(false); handleQuickAction("prompt_translate_landing") }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 transition-colors">
                🌍 Traduci Landing
              </button>
              <button onClick={() => { handleQuickAction("create_thank_page", productData) }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 transition-colors">
                ✅ Crea Thank Page
              </button>
              <button onClick={() => { handleQuickAction("publish_wordpress", { ...productData, pageType: "landing", pageTitle: productData.nome || "Landing Page" }) }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 transition-colors">
                🌐 Pubblica su WordPress
              </button>
              <button onClick={() => { setShowPreview(false); if (generatedContent.landing) { handleQuickAction("create_retargeting", productData) } }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-pink-500/15 border border-pink-500/30 text-pink-300 hover:bg-pink-500/30 transition-colors">
                🎯 Crea Retargeting Ads
              </button>
              <hr className="border-white/10 my-1" />
              <button onClick={() => { setShowPreview(false); handleQuickAction("prompt_funnel") }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-left bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-white hover:from-purple-500/30 hover:to-pink-500/30 transition-colors">
                ⚡ Funnel Completo (Landing + Video + Retargeting)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
