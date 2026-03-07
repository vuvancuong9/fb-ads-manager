"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, User, RefreshCw, Zap, TrendingDown, TrendingUp, BarChart3, Pause, Play, Search } from "lucide-react"

const AGENT_SUPABASE_URL = "https://smwtkyvnmyetlektphyy.supabase.co"
const AGENT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtd3RreXZubXlldGxla3RwaHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMzk1MzEsImV4cCI6MjA3NTYxNTUzMX0.9YhnYyA7n9qXMgIOvh64Z9-ylYADrW7x2SysbAGvVp0"

interface ChatMessage {
  role: "user" | "agent" | "system"
  content: string
  time: string
  actions?: { label: string; value: string; params?: any }[]
}

interface PendingAction {
  action: string
  params: any
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
  analyze_campaign: "Analizza in dettaglio questa campagna e dimmi come ottimizzarla.",
  pause_campaign: "Pausa questa campagna che sta perdendo soldi.",
  activate_campaign: "Attiva questa campagna.",
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

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      content: "Ciao! Sono il tuo **AI Assistant** per FB Ads Manager. Ho accesso a tutti i dati delle tue campagne, insights e Traffic Manager.\n\nPosso aiutarti con:\n- Analisi performance e report\n- Identificare campagne in perdita o profittevoli\n- Suggerire ottimizzazioni di budget\n- Controllare approval rate\n- E molto altro!\n\nCosa vuoi sapere?",
      time: formatTime(),
    },
  ])
  const [input, setInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [agentSession, setAgentSession] = useState<string | null>(null)
  const [agentLoginEmail, setAgentLoginEmail] = useState("")
  const [agentLoginPassword, setAgentLoginPassword] = useState("")
  const [agentLoginError, setAgentLoginError] = useState("")
  const [agentLoggedIn, setAgentLoggedIn] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const agentSupabase = useRef(createBrowserClient(AGENT_SUPABASE_URL, AGENT_SUPABASE_KEY))

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    async function checkAgentAuth() {
      try {
        const { data: { session } } = await agentSupabase.current.auth.getSession()
        if (session?.access_token) {
          setAgentSession(session.access_token)
          setAgentLoggedIn(true)
        }
      } catch { /* no session */ }
      setCheckingAuth(false)
    }
    checkAgentAuth()
  }, [])

  const handleAgentLogin = async () => {
    setAgentLoginError("")
    try {
      const { data, error } = await agentSupabase.current.auth.signInWithPassword({
        email: agentLoginEmail,
        password: agentLoginPassword,
      })
      if (error) {
        setAgentLoginError(error.message)
        return
      }
      if (data.session) {
        setAgentSession(data.session.access_token)
        setAgentLoggedIn(true)
      }
    } catch (e) {
      setAgentLoginError("Errore di connessione")
    }
  }

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const executeAction = async (action: string, params: any): Promise<string> => {
    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      })
      const result = await res.json()
      return result.message || result.error || "Azione completata"
    } catch {
      return "Errore nell'esecuzione dell'azione"
    }
  }

  const sendToAI = async (text: string) => {
    if (isProcessing) return
    setIsProcessing(true)

    const newHistory = [...chatHistory, { role: "user", content: text }]
    setChatHistory(newHistory)

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: newHistory.slice(-20),
          agentSessionToken: agentSession,
          pendingAction: pendingAction,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Errore" }))
        addMessage({ role: "agent", content: `Errore: ${err.error || res.status}`, time: formatTime() })
        setIsProcessing(false)
        return
      }

      const result = await res.json()
      const reply = result.reply || result.error || "Non ho capito, puoi ripetere?"
      setChatHistory(prev => [...prev, { role: "assistant", content: reply }])

      addMessage({ role: "agent", content: reply, time: formatTime() })

      const shouldExecute = result.autoExecute === true || (result.confidence || 0) >= 0.95
      const actionToExecute = result.suggestedAction
      const extractedData = result.extractedData || {}

      if (shouldExecute && actionToExecute) {
        const executableActions = [
          "pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple",
          "update_budget", "sync_campaigns", "get_campaign_details",
        ]

        if (executableActions.includes(actionToExecute)) {
          addMessage({ role: "system", content: `Esecuzione: ${actionToExecute}...`, time: formatTime() })
          const actionResult = await executeAction(actionToExecute, extractedData)
          addMessage({ role: "agent", content: actionResult, time: formatTime() })
          setPendingAction(null)
        }
      } else if (actionToExecute && (result.confidence || 0) >= 0.5) {
        setPendingAction({ action: actionToExecute, params: extractedData })

        const actionLabels: Record<string, string> = {
          sync_campaigns: "Sincronizza Campagne",
          pause_campaign: `Pausa "${extractedData.campaignName || "campagna"}"`,
          activate_campaign: `Attiva "${extractedData.campaignName || "campagna"}"`,
          pause_multiple: `Pausa ${(extractedData.campaignNames || []).length} campagne`,
          activate_multiple: `Attiva ${(extractedData.campaignNames || []).length} campagne`,
          update_budget: `Cambia budget a €${extractedData.budget || "?"}`,
          get_campaign_details: "Dettagli Campagna",
          show_losing: "Mostra in Perdita",
          show_profitable: "Mostra Profittevoli",
          optimize_budget: "Ottimizza Budget",
          check_approval: "Controlla Approval",
          show_report: "Genera Report",
          create_landing: "Crea Landing",
          create_video_ads: "Crea Video Ads",
          create_retargeting: "Crea Retargeting",
          create_funnel: "Crea Funnel",
          search_offers: "Cerca Offerte",
        }

        const label = actionLabels[actionToExecute] || actionToExecute
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === "agent") {
            return [...prev.slice(0, -1), { ...last, actions: [{ label, value: actionToExecute, params: extractedData }] }]
          }
          return prev
        })
      } else {
        setPendingAction(null)
      }
    } catch {
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
    const executableActions = [
      "pause_campaign", "activate_campaign", "pause_multiple", "activate_multiple",
      "update_budget", "sync_campaigns", "get_campaign_details",
    ]

    if (executableActions.includes(value) && params) {
      setIsProcessing(true)
      addMessage({ role: "system", content: `Esecuzione: ${value}...`, time: formatTime() })
      const result = await executeAction(value, params)
      addMessage({ role: "agent", content: result, time: formatTime() })
      setPendingAction(null)
      setIsProcessing(false)
      return
    }

    const prompt = ACTION_PROMPTS[value]
    if (prompt) {
      addMessage({ role: "user", content: prompt, time: formatTime() })
      sendToAI(prompt)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    )
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
            <p className="text-sm text-gray-400 mt-1">Accedi con le credenziali Agent Hub per attivare l&apos;AI</p>
          </div>
          <div className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={agentLoginEmail}
              onChange={e => setAgentLoginEmail(e.target.value)}
              className="bg-[#242f3d] border-white/10 text-white placeholder:text-gray-500"
              onKeyDown={e => e.key === "Enter" && handleAgentLogin()}
            />
            <Input
              type="password"
              placeholder="Password"
              value={agentLoginPassword}
              onChange={e => setAgentLoginPassword(e.target.value)}
              className="bg-[#242f3d] border-white/10 text-white placeholder:text-gray-500"
              onKeyDown={e => e.key === "Enter" && handleAgentLogin()}
            />
            {agentLoginError && <p className="text-red-400 text-sm">{agentLoginError}</p>}
            <Button onClick={handleAgentLogin} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
              Accedi
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6 bg-[#17212b]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-[#0e1621] border-b border-white/[0.08]">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
          <Bot size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">AI Assistant</p>
          <p className="text-xs text-green-400">Online — Accesso completo al tool</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-white hover:bg-white/10"
          onClick={() => {
            setMessages([{
              role: "agent",
              content: "Conversazione resettata. Come posso aiutarti?",
              time: formatTime(),
            }])
            setChatHistory([])
          }}
        >
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 px-5 py-3 overflow-x-auto bg-[#0e1621]/50 border-b border-white/[0.05]">
        {QUICK_ACTIONS.map(({ label, value, icon: Icon }) => (
          <button
            key={value}
            onClick={() => handleQuickAction(value)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all
              bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/40
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div
              className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#2b5278] text-white rounded-br-md"
                  : msg.role === "system"
                  ? "bg-white/5 text-gray-400 text-center max-w-[90%] rounded-lg text-xs"
                  : "bg-[#182533] text-gray-100 rounded-bl-md"
              }`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
            <span className={`text-[11px] text-gray-500 mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>
              {msg.time}
            </span>
            {msg.actions && msg.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {msg.actions.map((action, j) => (
                  <button
                    key={j}
                    onClick={() => handleQuickAction(action.value, action.params)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/30 hover:border-green-500 transition-all hover:-translate-y-0.5"
                  >
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

      {/* Input */}
      <div className="px-4 py-3 bg-[#0e1621] border-t border-white/[0.08]">
        <div className="flex items-end gap-2 bg-[#242f3d] rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Chiedi qualsiasi cosa su campagne, performance, ottimizzazioni..."
            rows={1}
            className="flex-1 bg-transparent border-none text-white text-sm resize-none outline-none max-h-[120px] min-h-[20px] placeholder:text-gray-500 leading-relaxed"
            style={{ height: "auto" }}
            onInput={e => {
              const el = e.target as HTMLTextAreaElement
              el.style.height = "auto"
              el.style.height = Math.min(el.scrollHeight, 120) + "px"
            }}
          />
          <button
            onClick={handleSend}
            disabled={isProcessing || !input.trim()}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 text-white transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
