"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSeverityColor } from "@/lib/utils"
import { Bell, Plus, Trash2, Send, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react"
import type { AlertConfig, AlertLog } from "@/types/database"

export default function AlertsPage() {
  const { selectedAccountId, accounts, profile } = useAppStore()
  const [configs, setConfigs] = useState<AlertConfig[]>([])
  const [logs, setLogs] = useState<AlertLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const [name, setName] = useState("")
  const [alertType, setAlertType] = useState<"loss" | "profit" | "budget" | "performance">("loss")
  const [alertAccountId, setAlertAccountId] = useState(selectedAccountId || "")
  const [telegramChatId, setTelegramChatId] = useState("")
  const [includeSuggestions, setIncludeSuggestions] = useState(true)
  const [checkInterval, setCheckInterval] = useState("30")
  const [cooldown, setCooldown] = useState("120")
  const [conditionMetric, setConditionMetric] = useState("roas")
  const [conditionOperator, setConditionOperator] = useState("lt")
  const [conditionValue, setConditionValue] = useState("1")
  const [minSpend, setMinSpend] = useState("10")

  const load = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)

    const { data: configData } = await supabase
      .from("alert_configs")
      .select("*")
      .order("created_at", { ascending: false })

    const { data: logData } = await supabase
      .from("alert_logs")
      .select("*, campaign:campaigns(name), fb_ad_account:fb_ad_accounts(name)")
      .order("created_at", { ascending: false })
      .limit(100)

    setConfigs((configData || []) as AlertConfig[])
    setLogs((logData || []) as AlertLog[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const supabase = createClient()
    await supabase.from("alert_configs").insert({
      name,
      fb_ad_account_id: alertAccountId || null,
      created_by: profile?.id,
      alert_type: alertType,
      conditions: {
        metric: conditionMetric,
        operator: conditionOperator,
        value: parseFloat(conditionValue),
        min_spend: parseFloat(minSpend),
      },
      telegram_chat_id: telegramChatId || profile?.telegram_chat_id,
      include_suggestions: includeSuggestions,
      check_interval_minutes: parseInt(checkInterval),
      cooldown_minutes: parseInt(cooldown),
    })
    setShowCreate(false)
    load()
  }

  const toggleConfig = async (config: AlertConfig) => {
    const supabase = createClient()
    await supabase.from("alert_configs").update({ is_active: !config.is_active }).eq("id", config.id)
    setConfigs((prev) => prev.map((c) => (c.id === config.id ? { ...c, is_active: !c.is_active } : c)))
  }

  const deleteConfig = async (id: string) => {
    const supabase = createClient()
    await supabase.from("alert_configs").delete().eq("id", id)
    setConfigs((prev) => prev.filter((c) => c.id !== id))
  }

  const testAlert = async () => {
    try {
      await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: telegramChatId || profile?.telegram_chat_id }),
      })
    } catch { /* ignore */ }
  }

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "loss": return <TrendingDown className="text-red-500" size={20} />
      case "profit": return <TrendingUp className="text-green-500" size={20} />
      default: return <AlertTriangle className="text-yellow-500" size={20} />
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alert Telegram</h1>
          <p className="text-gray-500">Ricevi notifiche su Telegram per le tue campagne</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus size={16} /> Nuovo Alert</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Configura Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Alert perdita campagne" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Tipo alert</label>
                  <Select value={alertType} onValueChange={(v) => setAlertType(v as typeof alertType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loss">Perdita</SelectItem>
                      <SelectItem value="profit">Profitto</SelectItem>
                      <SelectItem value="budget">Budget</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Account (opzionale)</label>
                  <Select value={alertAccountId || "all"} onValueChange={(v) => setAlertAccountId(v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Condizione</label>
                <div className="flex items-center gap-2">
                  <Select value={conditionMetric} onValueChange={setConditionMetric}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="roas">ROAS</SelectItem>
                      <SelectItem value="cpa">CPA</SelectItem>
                      <SelectItem value="ctr">CTR</SelectItem>
                      <SelectItem value="spend">Spesa</SelectItem>
                      <SelectItem value="conversions">Conversioni</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={conditionOperator} onValueChange={setConditionOperator}>
                    <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lt">&lt;</SelectItem>
                      <SelectItem value="gt">&gt;</SelectItem>
                      <SelectItem value="lte">&le;</SelectItem>
                      <SelectItem value="gte">&ge;</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} className="w-[100px]" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-1">Spesa minima per attivare (€)</label>
                  <Input type="number" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} className="w-[150px]" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Telegram Chat ID</label>
                <div className="flex gap-2">
                  <Input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="Es. 123456789" />
                  <Button variant="outline" size="icon" onClick={testAlert} title="Test">
                    <Send size={16} />
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Invia /start al bot per ottenere il chat ID</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Controlla ogni (min)</label>
                  <Input type="number" value={checkInterval} onChange={(e) => setCheckInterval(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Cooldown (min)</label>
                  <Input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={includeSuggestions} onCheckedChange={setIncludeSuggestions} />
                <label className="text-sm">Includi suggerimenti nell&apos;alert</label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Annulla</Button>
              <Button onClick={handleCreate} disabled={!name}>Crea Alert</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="configs">
        <TabsList>
          <TabsTrigger value="configs">Configurazioni ({configs.length})</TabsTrigger>
          <TabsTrigger value="logs">Storico Alert ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="space-y-4">
          {configs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Bell size={48} className="text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">Nessun alert configurato</p>
                <p className="text-gray-400 text-sm">Configura il tuo primo alert Telegram</p>
              </CardContent>
            </Card>
          ) : (
            configs.map((config) => (
              <Card key={config.id} className={!config.is_active ? "opacity-60" : ""}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getAlertIcon(config.alert_type)}
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{config.name}</h3>
                        <p className="text-sm text-gray-500">
                          Tipo: {config.alert_type} | Ogni {config.check_interval_minutes} min | Cooldown: {config.cooldown_minutes} min
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">
                            {(config.conditions as { metric?: string })?.metric || ""}{" "}
                            {(config.conditions as { operator?: string })?.operator || ""}{" "}
                            {(config.conditions as { value?: number })?.value || ""}
                          </Badge>
                          {config.include_suggestions && <Badge variant="secondary">Con suggerimenti</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={config.is_active} onCheckedChange={() => toggleConfig(config)} />
                      <Button variant="ghost" size="icon" onClick={() => deleteConfig(config.id)}>
                        <Trash2 size={16} className="text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-3">
          {logs.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-gray-500">
                Nessun alert inviato
              </CardContent>
            </Card>
          ) : (
            logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getAlertIcon(log.alert_type)}
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{log.title}</h4>
                        <p className="text-sm text-gray-500 mt-1">{log.message}</p>
                        {log.suggestions && log.suggestions.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {log.suggestions.map((s, i) => (
                              <li key={i} className="text-xs text-gray-400">• {s}</li>
                            ))}
                          </ul>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={log.severity === "critical" ? "destructive" : log.severity === "warning" ? "warning" : "default"}>
                            {log.severity}
                          </Badge>
                          {log.telegram_sent && <Badge variant="success">Inviato su Telegram</Badge>}
                          <span className="text-xs text-gray-400">
                            {new Date(log.created_at).toLocaleString("it-IT")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
