"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, RefreshCw, Zap, TrendingDown, TrendingUp, BarChart3, Search } from "lucide-react"

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
]

const ACTION_PROMPTS: Record<string, string> = {
  show_report: "Genera un report completo delle performance degli ultimi 7 giorni: spesa totale, ROAS, CPA, le campagne migliori e peggiori, e suggerimenti pratici.",
  show_losing: "Quali campagne stanno perdendo soldi? Mostrami quelle con ROAS sotto 1 e dimmi cosa fare con ciascuna.",
  show_profitable: "Quali sono le campagne più profittevoli? Mostrami le top per ROAS e dimmi quali scalare.",
  optimize_budget: "Analizza l'allocazione del budget attuale e suggerisci come redistribuirlo per massimizzare il ROAS.",
  sync_campaigns: "Sincronizza le campagne da Facebook per avere dati aggiornati.",
  check_approval: "Qual è l'approval rate attuale dal Traffic Manager? Analizza i dati e dimmi se ci sono problemi.",
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
- Analizzare le performance delle campagne (spesa, ROAS, CPA, CTR)
- Suggerire ottimizzazioni (campagne da pausare, budget da spostare, targeting)
- Identificare campagne in perdita (ROAS < 1) e campagne profittevoli
- Analizzare l'approval rate dal Traffic Manager
- Dare consigli strategici su scaling e budget allocation
- ESEGUIRE azioni concrete: pausare/attivare campagne, cambiare budget

AZIONI CHE PUOI ESEGUIRE (campo "suggestedAction"):
- "sync_campaigns" — Sincronizza campagne da Facebook
- "pause_campaign" — Pausa una campagna (OBBLIGATORIO: extractedData.campaignName)
- "activate_campaign" — Attiva una campagna (OBBLIGATORIO: extractedData.campaignName)
- "pause_multiple" — Pausa più campagne (OBBLIGATORIO: extractedData.campaignNames = array di nomi)
- "activate_multiple" — Attiva più campagne (OBBLIGATORIO: extractedData.campaignNames = array)
- "update_budget" — Cambia budget (OBBLIGATORIO: extractedData.campaignName + extractedData.budget in EUR)
- "get_campaign_details" — Dettagli campagna (extractedData.campaignName)

REGOLE CRITICHE:
- Rispondi SEMPRE in italiano
- Usa i DATI REALI, NON inventare numeri
- Quando l'utente dice "ok", "sì", "fai", "procedi", "vai", "fallo", "esegui" → autoExecute: true, confidence: 1.0
- Quando l'utente ORDINA (es. "pausa X", "spegni X", "metti in pausa X") → autoExecute: true, confidence: 1.0
- "spegni" = pause_campaign, "accendi" = activate_campaign
- "spegni tutte le campagne in perdita" → pause_multiple con nomi campagne ROAS < 1
- SPECIFICA SEMPRE i nomi esatti in extractedData`

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "agent",
    content: "Ciao! Sono il tuo **AI Assistant** per FB Ads Manager. Ho accesso a tutti i dati delle tue campagne, insights e Traffic Manager.\n\nPosso **analizzare, suggerire e anche eseguire azioni** — pausare campagne, cambiare budget, sincronizzare.\n\nDimmi \"pausa la campagna X\" e lo faccio. Dimmi \"spegni tutte quelle in perdita\" e le spengo.\n\nCosa vuoi fare?",
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

  const sendToAI = async (text: string) => {
    if (isProcessing || !agentSession) return
    setIsProcessing(true)

    const newHistory = [...chatHistory, { role: "user", content: text }]
    setChatHistory(newHistory)

    const ctx = await refreshContext()
    const agentRole = AGENT_ROLE_TEMPLATE.replace("{CONTEXT}", JSON.stringify(ctx || toolContext || {}, null, 1))

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
              hasProduct: false,
              agentPhase: "FREE_CHAT",
              wpSitesConfigured: 0,
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
      const executableActions = [
        "pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple",
        "update_budget", "sync_campaigns", "get_campaign_details",
      ]

      if (shouldExecute && actionName && executableActions.includes(actionName)) {
        addMessage({ role: "system", content: `Esecuzione: ${actionName}...`, time: formatTime() })
        const actionResult = await executeAction(actionName, extractedData)
        addMessage({ role: "agent", content: actionResult, time: formatTime() })
      } else if (actionName && (result.confidence || 0) >= 0.5) {
        const labels: Record<string, string> = {
          pause_campaign: `Pausa "${extractedData.campaignName || ""}"`,
          activate_campaign: `Attiva "${extractedData.campaignName || ""}"`,
          pause_multiple: `Pausa ${(extractedData.campaignNames || []).length} campagne`,
          activate_multiple: `Attiva ${(extractedData.campaignNames || []).length} campagne`,
          update_budget: `Budget → €${extractedData.budget || "?"}`,
          sync_campaigns: "Sincronizza",
          get_campaign_details: "Dettagli Campagna",
        }
        const label = labels[actionName] || actionName
        if (executableActions.includes(actionName)) {
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
    const executableActions = ["pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple", "update_budget", "sync_campaigns", "get_campaign_details"]
    if (executableActions.includes(value) && params) {
      setIsProcessing(true)
      addMessage({ role: "system", content: `Esecuzione: ${value}...`, time: formatTime() })
      const result = await executeAction(value, params)
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
          onClick={() => { setMessages([{ role: "agent", content: "Conversazione resettata. Come posso aiutarti?", time: formatTime() }]); setChatHistory([]) }}>
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
