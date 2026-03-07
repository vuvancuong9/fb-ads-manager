"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, RefreshCw, Zap, TrendingDown, TrendingUp, BarChart3, Search, Rocket, FileCode, Video, Target, Copy, Download, Globe, Eye, EyeOff } from "lucide-react"

const AGENT_URL = "https://smwtkyvnmyetlektphyy.supabase.co"
const AGENT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtd3RreXZubXlldGxla3RwaHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMzk1MzEsImV4cCI6MjA3NTYxNTUzMX0.9YhnYyA7n9qXMgIOvh64Z9-ylYADrW7x2SysbAGvVp0"

interface ChatMessage {
  role: "user" | "agent" | "system"
  content: string
  time: string
  actions?: { label: string; value: string; params?: any }[]
}

const QUICK_ACTIONS = [
  { label: "Report Performance", value: "show_report", icon: BarChart3 },
  { label: "Campagne in Perdita", value: "show_losing", icon: TrendingDown },
  { label: "Campagne Profittevoli", value: "show_profitable", icon: TrendingUp },
  { label: "Ottimizza Budget", value: "optimize_budget", icon: Zap },
  { label: "Sincronizza", value: "sync_campaigns", icon: RefreshCw },
  { label: "Approval Rate TM", value: "check_approval", icon: Search },
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

const AGENT_ROLE_TEMPLATE = `Sei l'AI Assistant di FB Ads Manager — un esperto di performance marketing e gestione campagne Facebook Ads.

HAI ACCESSO AI DATI DEL TOOL IN TEMPO REALE:
{CONTEXT}

COSA PUOI FARE:

**ADS MANAGER:**
- Analizzare performance campagne (spesa, ROAS, CPA, CTR)
- Suggerire ottimizzazioni, pausare/attivare campagne, cambiare budget
- Identificare campagne in perdita/profittevoli
- Analizzare approval rate Traffic Manager
- Sincronizzare dati da Facebook

**FUNNEL BUILDER (via conversazione):**
- Creare landing page (formato Elementor JSON) a partire dai dati prodotto
- Tradurre landing in altre lingue
- Modificare landing con istruzioni
- Generare script video ads
- Generare copy retargeting ads
- Generare funnel completo (landing + video + retargeting)
- Clonare landing da URL competitor
- Generare sequenze email e campagne SMS

Per la creazione contenuti, ESTRAI I DATI PRODOTTO dalla conversazione e salvali in extractedData:
- nome, descrizione, prezzoP (prezzo pieno), prezzoS (prezzo scontato)
- spedizione, garanzia, target, categoria (GADGET/HEALTH/BEAUTY/HOME/FOOD/TECH)
- pageType (LANDING/ADVERTORIAL), copywritingFramework (AIDA/PAS/BAB/4P/STAR)

AZIONI (campo "suggestedAction"):

Ads Manager:
- "sync_campaigns" — Sincronizza campagne
- "pause_campaign" — extractedData.campaignName
- "activate_campaign" — extractedData.campaignName
- "pause_multiple" — extractedData.campaignNames[]
- "activate_multiple" — extractedData.campaignNames[]
- "update_budget" — extractedData.campaignName + extractedData.budget

Funnel Builder:
- "create_landing" — Genera landing (extractedData = dati prodotto)
- "create_video_ads" — Genera script video ads (extractedData = dati prodotto)
- "create_retargeting" — Genera retargeting ads (extractedData = dati prodotto)
- "create_funnel" — Genera funnel completo (landing + video + retargeting)
- "clone_landing" — Clona landing (extractedData.url)
- "translate_landing" — Traduci landing (extractedData.lingua)

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

  useEffect(() => {
    if (agentLoggedIn) {
      fetch("/api/agent/context").then(r => r.json()).then(d => setToolContext(d.context)).catch(() => {})
    }
  }, [agentLoggedIn])

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

  const executeAction = async (action: string, params: any): Promise<string> => {
    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      })
      const result = await res.json()
      if (result.success) await refreshContext()
      return result.message || result.error || "Azione completata"
    } catch { return "Errore nell'esecuzione" }
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

  const executeFunnelAction = async (actionName: string, data: any): Promise<string> => {
    try {
      setProductData((prev: any) => ({ ...prev, ...data }))
      const merged = { ...productData, ...data }

      if (actionName === "create_landing") {
        addMessage({ role: "system", content: "Generazione landing page in corso...", time: formatTime() })
        const result = await callEdgeFunction("create", {
          nome: merged.nome || "Prodotto",
          descrizione: merged.descrizione || "",
          prezzoP: merged.prezzoP || "",
          prezzoS: merged.prezzoS || "",
          scontoPerc: merged.scontoPerc || "",
          spedizione: merged.spedizione || "",
          garanzia: merged.garanzia || "",
          target: merged.target || "",
          categoria: merged.categoria || "GADGET",
          pageType: merged.pageType || "LANDING",
          copywritingFramework: merged.copywritingFramework || "AIDA",
          lingua: merged.lingua || "Italiano",
        })
        if (result.landing) {
          setGeneratedContent((prev: any) => ({ ...prev, landing: result.landing }))
          return "Landing page generata con successo! Puoi scaricarla o copiarla."
        }
        return result.reply || result.error || "Errore nella generazione"
      }

      if (actionName === "create_video_ads") {
        addMessage({ role: "system", content: "Generazione script video ads...", time: formatTime() })
        const result = await callEdgeFunction("create", {
          ...merged,
          tipo: "VIDEO_ADS",
          videoStile: merged.videoStile || "UGC",
          videoDuration: merged.videoDuration || "30s",
        })
        if (result.landing || result.reply) {
          const content = result.landing || result.reply
          setGeneratedContent((prev: any) => ({ ...prev, videoAds: content }))
          return typeof content === "string" ? content : "Script video ads generati!"
        }
        return result.error || "Errore nella generazione"
      }

      if (actionName === "create_retargeting") {
        addMessage({ role: "system", content: "Generazione copy retargeting...", time: formatTime() })
        const result = await callEdgeFunction("create", {
          ...merged,
          tipo: "RETARGETING",
          retargAudience: merged.retargAudience || "ViewContent",
          retargPiattaforma: merged.retargPiattaforma || "Facebook",
        })
        if (result.landing || result.reply) {
          const content = result.landing || result.reply
          setGeneratedContent((prev: any) => ({ ...prev, retargeting: content }))
          return typeof content === "string" ? content : "Copy retargeting generato!"
        }
        return result.error || "Errore nella generazione"
      }

      if (actionName === "create_funnel") {
        addMessage({ role: "system", content: "Generazione funnel completo (landing + video + retargeting)...", time: formatTime() })

        const landingResult = await callEdgeFunction("create", {
          ...merged, categoria: merged.categoria || "GADGET", pageType: merged.pageType || "LANDING",
          copywritingFramework: merged.copywritingFramework || "AIDA", lingua: merged.lingua || "Italiano",
        })
        if (landingResult.landing) setGeneratedContent((prev: any) => ({ ...prev, landing: landingResult.landing }))
        addMessage({ role: "system", content: "Landing generata. Generazione video ads...", time: formatTime() })

        const videoResult = await callEdgeFunction("create", {
          ...merged, tipo: "VIDEO_ADS", videoStile: merged.videoStile || "UGC", videoDuration: merged.videoDuration || "30s",
        })
        if (videoResult.landing || videoResult.reply) setGeneratedContent((prev: any) => ({ ...prev, videoAds: videoResult.landing || videoResult.reply }))
        addMessage({ role: "system", content: "Video ads generati. Generazione retargeting...", time: formatTime() })

        const retargResult = await callEdgeFunction("create", {
          ...merged, tipo: "RETARGETING", retargAudience: merged.retargAudience || "ViewContent", retargPiattaforma: merged.retargPiattaforma || "Facebook",
        })
        if (retargResult.landing || retargResult.reply) setGeneratedContent((prev: any) => ({ ...prev, retargeting: retargResult.landing || retargResult.reply }))

        return "Funnel completo generato! Landing page + Video Ads + Retargeting pronti."
      }

      if (actionName === "clone_landing") {
        addMessage({ role: "system", content: `Clonazione landing da ${data.url}...`, time: formatTime() })
        const result = await callEdgeFunction("clone", { url: data.url, lingua: data.lingua || "Italiano" })
        if (result.landing) {
          setGeneratedContent((prev: any) => ({ ...prev, landing: result.landing }))
          return "Landing clonata con successo!"
        }
        return result.reply || result.error || "Errore nella clonazione"
      }

      if (actionName === "translate_landing") {
        if (!generatedContent.landing) return "Nessuna landing da tradurre. Creane una prima."
        addMessage({ role: "system", content: `Traduzione landing in ${data.lingua}...`, time: formatTime() })
        const result = await callEdgeFunction("translate", {
          landing: generatedContent.landing,
          lingua: data.lingua || "English",
        })
        if (result.landing) {
          setGeneratedContent((prev: any) => ({ ...prev, [`landing_${data.lingua}`]: result.landing }))
          return `Landing tradotta in ${data.lingua}!`
        }
        return result.reply || result.error || "Errore nella traduzione"
      }

      return "Azione non riconosciuta"
    } catch (e: any) {
      return `Errore: ${e.message || "Errore nella generazione"}`
    }
  }

  const sendToAI = async (text: string) => {
    if (isProcessing || !agentSession) return
    setIsProcessing(true)

    const newHistory = [...chatHistory, { role: "user", content: text }]
    setChatHistory(newHistory)

    const ctx = await refreshContext()
    const contextWithProduct = {
      ...(ctx || toolContext || {}),
      productData: Object.keys(productData).length > 0 ? productData : null,
      generatedContent: Object.keys(generatedContent).length > 0 ? Object.keys(generatedContent) : null,
    }
    const agentRole = AGENT_ROLE_TEMPLATE.replace("{CONTEXT}", JSON.stringify(contextWithProduct, null, 1))

    try {
      let session = agentSession
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        const { data } = await agentSupabase.current.auth.refreshSession()
        if (data?.session) { session = data.session; setAgentSession(session) }
      }

      const res = await fetch(`${AGENT_URL}/functions/v1/funnel-builder-claude-v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": AGENT_KEY,
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "chat",
          userId: agentUser?.id,
          data: {
            message: text,
            history: newHistory.slice(-20),
            agentRole,
            toolState: {
              hasProduct: Object.keys(productData).length > 0 && !!productData.nome,
              agentPhase: Object.keys(productData).length > 0 ? "PRODUCT_LOADED" : "FREE_CHAT",
              wpSitesConfigured: 0,
              hasLanding: !!generatedContent.landing,
              hasVideoAds: !!generatedContent.videoAds,
              hasRetargeting: !!generatedContent.retargeting,
            },
          },
        }),
      })

      if (!res.ok) {
        addMessage({ role: "agent", content: `Errore AI: ${res.status}. Riprova.`, time: formatTime() })
        setIsProcessing(false)
        return
      }

      const result = await res.json()
      const reply = result.reply || result.error || "Non ho capito, puoi ripetere?"
      setChatHistory(prev => [...prev, { role: "assistant", content: reply }])
      addMessage({ role: "agent", content: reply, time: formatTime() })

      const shouldExecute = result.autoExecute === true || (result.confidence || 0) >= 0.95
      const actionName = result.suggestedAction
      const extractedData = result.extractedData || {}
      const adsActions = [
        "pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple",
        "update_budget", "sync_campaigns", "get_campaign_details",
      ]
      const funnelActions = [
        "create_landing", "create_video_ads", "create_retargeting",
        "create_funnel", "clone_landing", "translate_landing",
      ]

      if (extractedData && Object.keys(extractedData).length > 0) {
        setProductData((prev: any) => ({ ...prev, ...extractedData }))
      }

      if (shouldExecute && actionName && adsActions.includes(actionName)) {
        addMessage({ role: "system", content: `Esecuzione: ${actionName}...`, time: formatTime() })
        const actionResult = await executeAction(actionName, extractedData)
        addMessage({ role: "agent", content: actionResult, time: formatTime() })
      } else if (shouldExecute && actionName && funnelActions.includes(actionName)) {
        const funnelResult = await executeFunnelAction(actionName, extractedData)
        addMessage({ role: "agent", content: funnelResult, time: formatTime() })
      } else if (actionName && (result.confidence || 0) >= 0.5) {
        const labels: Record<string, string> = {
          pause_campaign: `Pausa "${extractedData.campaignName || ""}"`,
          activate_campaign: `Attiva "${extractedData.campaignName || ""}"`,
          pause_multiple: `Pausa ${(extractedData.campaignNames || []).length} campagne`,
          activate_multiple: `Attiva ${(extractedData.campaignNames || []).length} campagne`,
          update_budget: `Budget → €${extractedData.budget || "?"}`,
          sync_campaigns: "Sincronizza",
          get_campaign_details: "Dettagli Campagna",
          create_landing: "Crea Landing Page",
          create_video_ads: "Crea Video Ads",
          create_retargeting: "Crea Retargeting",
          create_funnel: "Crea Funnel Completo",
          clone_landing: `Clona Landing da ${extractedData.url || "URL"}`,
          translate_landing: `Traduci in ${extractedData.lingua || "..."}`,
        }
        const label = labels[actionName] || actionName
        const allActions = [...adsActions, ...funnelActions]
        if (allActions.includes(actionName)) {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === "agent") {
              return [...prev.slice(0, -1), { ...last, actions: [{ label, value: actionName, params: extractedData }] }]
            }
            return prev
          })
        }
      }
    } catch (e) {
      addMessage({ role: "agent", content: "Errore di connessione. Riprova.", time: formatTime() })
    }
    setIsProcessing(false)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    addMessage({ role: "user", content: text, time: formatTime() })
    sendToAI(text)
  }

  const handleQuickAction = async (value: string, params?: any) => {
    const adsActions = ["pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple", "update_budget", "sync_campaigns", "get_campaign_details"]
    const funnelActions = ["create_landing", "create_video_ads", "create_retargeting", "create_funnel", "clone_landing", "translate_landing"]

    if (adsActions.includes(value) && params) {
      setIsProcessing(true)
      addMessage({ role: "system", content: `Esecuzione: ${value}...`, time: formatTime() })
      const result = await executeAction(value, params)
      addMessage({ role: "agent", content: result, time: formatTime() })
      setIsProcessing(false)
      return
    }
    if (funnelActions.includes(value) && params) {
      setIsProcessing(true)
      const result = await executeFunnelAction(value, params)
      addMessage({ role: "agent", content: result, time: formatTime() })
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
    const text = typeof content === "string" ? content : JSON.stringify(content, null, 2)
    const blob = new Blob([text], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    addMessage({ role: "system", content: `Scaricato: ${filename}`, time: formatTime() })
  }

  const previewLanding = (content: any) => {
    let html = ""
    if (typeof content === "string") {
      html = content
    } else {
      html = `<html><head><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px}</style></head><body><h1>Landing Preview</h1><pre>${JSON.stringify(content, null, 2)}</pre></body></html>`
    }
    const w = window.open("", "_blank")
    if (w) { w.document.write(html); w.document.close() }
  }

  if (checkingAuth) {
    return <div className="flex h-[calc(100vh-4rem)] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" /></div>
  }

  if (!agentLoggedIn) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-md bg-[#0e1621] rounded-2xl p-8 shadow-2xl border border-white/10">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
              <Bot size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Agent Hub Login</h2>
            <p className="text-sm text-gray-400 mt-1">Accedi con le credenziali Agent Hub</p>
          </div>
          <div className="space-y-4">
            <Input type="email" placeholder="Email" value={agentLoginEmail} onChange={e => setAgentLoginEmail(e.target.value)} className="bg-[#242f3d] border-white/10 text-white placeholder:text-gray-500" onKeyDown={e => e.key === "Enter" && handleAgentLogin()} />
            <Input type="password" placeholder="Password" value={agentLoginPassword} onChange={e => setAgentLoginPassword(e.target.value)} className="bg-[#242f3d] border-white/10 text-white placeholder:text-gray-500" onKeyDown={e => e.key === "Enter" && handleAgentLogin()} />
            {agentLoginError && <p className="text-red-400 text-sm">{agentLoginError}</p>}
            <Button onClick={handleAgentLogin} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">Accedi</Button>
          </div>
        </div>
      </div>
    )
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
                <button onClick={() => downloadContent(generatedContent.videoAds, "video-ads.json")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Scarica"><Download size={12} /></button>
              </div>
            )}
            {generatedContent.retargeting && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-purple-400 mr-1">Retargeting</span>
                <button onClick={() => copyToClipboard(generatedContent.retargeting)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Copia"><Copy size={12} /></button>
                <button onClick={() => downloadContent(generatedContent.retargeting, "retargeting.json")} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" title="Scarica"><Download size={12} /></button>
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
    </div>
  )
}
