"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber, formatPercent, formatCurrency } from "@/lib/utils"
import {
  Plus, RefreshCw, Trash2, TestTube, Save, CheckCircle2, XCircle, Clock, Calendar,
  TrendingUp, ArrowUpRight, ArrowDownRight, BarChart3,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts"
import type { TrafficManager, TrafficManagerData } from "@/types/database"

const PRESETS: Record<string, Partial<TrafficManager>> = {
  custom: { name: "", api_base_url: "", auth_type: "bearer", endpoint_path: "/conversions", auth_param_name: "Authorization" },
  keitaro: { name: "Keitaro", api_base_url: "", auth_type: "api_key", auth_param_name: "Api-Key", endpoint_path: "/admin_api/v1/report/build" },
  binom: { name: "Binom", api_base_url: "", auth_type: "query_param", auth_param_name: "api_key", endpoint_path: "/click.php" },
  voluum: { name: "Voluum", api_base_url: "https://api.voluum.com", auth_type: "bearer", endpoint_path: "/report", auth_param_name: "Authorization" },
  redtrack: { name: "RedTrack", api_base_url: "https://api.redtrack.io", auth_type: "query_param", auth_param_name: "api_key", endpoint_path: "/report" },
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b"]

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

export default function TrafficManagerPage() {
  const [managers, setManagers] = useState<TrafficManager[]>([])
  const [tmData, setTmData] = useState<TrafficManagerData[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dateFrom, setDateFrom] = useState(() => daysAgo(30))
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
  const [dateLabel, setDateLabel] = useState("30g")
  const [selectedManager, setSelectedManager] = useState<string>("all")

  const [form, setForm] = useState({
    id: "",
    name: "",
    preset: "custom",
    api_base_url: "",
    api_key: "",
    api_secret: "",
    auth_type: "bearer" as TrafficManager["auth_type"],
    auth_param_name: "Authorization",
    endpoint_path: "/conversions",
    response_mapping: {
      data_root: "data",
      total_field: "total",
      approved_field: "approved",
      rejected_field: "rejected",
      pending_field: "pending",
      revenue_field: "revenue",
      date_field: "date",
    },
    extra_params: {} as Record<string, string>,
    extra_params_text: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/traffic-manager")
      const json = await res.json()
      setManagers(json.managers || [])
      setTmData(json.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setForm({
      id: "", name: "", preset: "custom", api_base_url: "", api_key: "", api_secret: "",
      auth_type: "bearer", auth_param_name: "Authorization", endpoint_path: "/conversions",
      response_mapping: { data_root: "data", total_field: "total", approved_field: "approved", rejected_field: "rejected", pending_field: "pending", revenue_field: "revenue", date_field: "date" },
      extra_params: {}, extra_params_text: "",
    })
    setTestResult(null)
    setShowForm(false)
  }

  const applyPreset = (preset: string) => {
    const p = PRESETS[preset]
    if (p) {
      setForm(prev => ({
        ...prev,
        preset,
        name: p.name || prev.name,
        api_base_url: p.api_base_url || prev.api_base_url,
        auth_type: (p.auth_type as TrafficManager["auth_type"]) || prev.auth_type,
        auth_param_name: p.auth_param_name || prev.auth_param_name,
        endpoint_path: p.endpoint_path || prev.endpoint_path,
      }))
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      let extraParams = form.extra_params
      if (form.extra_params_text.trim()) {
        try { extraParams = JSON.parse(form.extra_params_text) } catch { /* ignore */ }
      }
      const res = await fetch("/api/traffic-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          api_base_url: form.api_base_url,
          api_key: form.api_key,
          api_secret: form.api_secret,
          auth_type: form.auth_type,
          auth_param_name: form.auth_param_name,
          endpoint_path: form.endpoint_path,
          extra_params: extraParams,
        }),
      })
      const json = await res.json()
      setTestResult(json)
    } catch (e) {
      setTestResult({ error: "Connessione fallita" })
    }
    setTesting(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let extraParams = form.extra_params
      if (form.extra_params_text.trim()) {
        try { extraParams = JSON.parse(form.extra_params_text) } catch { /* ignore */ }
      }
      const res = await fetch("/api/traffic-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: form.id ? "update" : "create",
          id: form.id || undefined,
          name: form.name,
          api_base_url: form.api_base_url,
          api_key: form.api_key,
          api_secret: form.api_secret,
          auth_type: form.auth_type,
          auth_param_name: form.auth_param_name,
          endpoint_path: form.endpoint_path,
          response_mapping: form.response_mapping,
          extra_params: extraParams,
        }),
      })
      const json = await res.json()
      if (json.success) {
        resetForm()
        await load()
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questa connessione?")) return
    await fetch("/api/traffic-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    })
    await load()
  }

  const handleFetch = async (id: string) => {
    setSyncing(id)
    try {
      const res = await fetch("/api/traffic-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch", id, dateFrom, dateTo }),
      })
      const json = await res.json()
      if (json.error) alert(json.error)
      else await load()
    } catch { /* ignore */ }
    setSyncing(null)
  }

  const editManager = (m: TrafficManager) => {
    setForm({
      id: m.id,
      name: m.name,
      preset: "custom",
      api_base_url: m.api_base_url,
      api_key: m.api_key || "",
      api_secret: m.api_secret || "",
      auth_type: m.auth_type,
      auth_param_name: m.auth_param_name,
      endpoint_path: m.endpoint_path,
      response_mapping: m.response_mapping as any || {},
      extra_params: m.extra_params || {},
      extra_params_text: Object.keys(m.extra_params || {}).length > 0 ? JSON.stringify(m.extra_params, null, 2) : "",
    })
    setShowForm(true)
  }

  const filteredData = tmData.filter(d => {
    if (selectedManager !== "all" && d.traffic_manager_id !== selectedManager) return false
    if (d.date < dateFrom || d.date > dateTo) return false
    return true
  }).sort((a, b) => a.date.localeCompare(b.date))

  const totals = filteredData.reduce((acc, d) => ({
    total: acc.total + d.total_conversions,
    approved: acc.approved + d.approved_conversions,
    rejected: acc.rejected + d.rejected_conversions,
    pending: acc.pending + d.pending_conversions,
    revenue: acc.revenue + Number(d.revenue),
  }), { total: 0, approved: 0, rejected: 0, pending: 0, revenue: 0 })

  const overallApprovalRate = totals.total > 0 ? (totals.approved / totals.total) * 100 : 0

  const dailyChart = filteredData.reduce((acc, d) => {
    const existing = acc.find(x => x.date === d.date)
    if (existing) {
      existing.total += d.total_conversions
      existing.approved += d.approved_conversions
      existing.rejected += d.rejected_conversions
      existing.pending += d.pending_conversions
      existing.revenue += Number(d.revenue)
    } else {
      acc.push({
        date: d.date,
        total: d.total_conversions,
        approved: d.approved_conversions,
        rejected: d.rejected_conversions,
        pending: d.pending_conversions,
        revenue: Number(d.revenue),
        rate: 0,
      })
    }
    return acc
  }, [] as any[]).map(d => ({
    ...d,
    rate: d.total > 0 ? Math.round((d.approved / d.total) * 100 * 100) / 100 : 0,
  }))

  const pieData = [
    { name: "Approvate", value: totals.approved },
    { name: "Rifiutate", value: totals.rejected },
    { name: "In attesa", value: totals.pending },
  ].filter(d => d.value > 0)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Traffic Manager</h1>
          <p className="text-gray-500">Collegamento API e Approval Rate</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus size={16} /> Aggiungi Connessione
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Modifica" : "Collega"} Traffic Manager</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Piattaforma</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { value: "keitaro", label: "Keitaro" },
                  { value: "binom", label: "Binom" },
                  { value: "voluum", label: "Voluum" },
                  { value: "redtrack", label: "RedTrack" },
                  { value: "custom", label: "Altro" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => applyPreset(value)}
                    className={`px-4 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${form.preset === value ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600 dark:text-gray-400"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Nome</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Es. Il mio Keitaro" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">URL del tracker</label>
                <Input value={form.api_base_url} onChange={e => setForm({ ...form, api_base_url: e.target.value })} placeholder={form.preset === "voluum" ? "https://api.voluum.com" : form.preset === "redtrack" ? "https://api.redtrack.io" : "https://il-tuo-tracker.com"} />
                <p className="text-xs text-gray-400 mt-1">{form.preset === "keitaro" ? "Es. https://il-tuo-dominio.com" : form.preset === "binom" ? "Es. https://il-tuo-binom.com" : "L'indirizzo del tuo tracker"}</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">API Key</label>
              <Input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="Incolla qui la tua API key" />
              <p className="text-xs text-gray-400 mt-1">
                {form.preset === "keitaro" ? "La trovi in Keitaro → Impostazioni → API" : form.preset === "binom" ? "La trovi in Binom → Settings → API" : form.preset === "voluum" ? "La trovi in Voluum → Settings → Security → API access tokens" : form.preset === "redtrack" ? "La trovi in RedTrack → Tools → API" : "Controlla le impostazioni del tuo tracker"}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={handleTest} disabled={testing || !form.api_base_url || !form.api_key}>
                <TestTube size={16} />
                {testing ? "Testing..." : "Testa Connessione"}
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.name || !form.api_base_url || !form.api_key}>
                <Save size={16} />
                {saving ? "Salvataggio..." : "Salva"}
              </Button>
              <Button variant="ghost" onClick={resetForm}>Annulla</Button>
            </div>

            {testResult && (
              <div className={`rounded-lg p-4 ${testResult.ok ? "bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800"}`}>
                <p className={`font-medium flex items-center gap-2 ${testResult.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                  {testResult.ok ? <><CheckCircle2 size={16} /> Connessione riuscita!</> : <><XCircle size={16} /> {testResult.error || `Errore ${testResult.status}`}</>}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {managers.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managers.map(m => (
              <Card key={m.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${m.is_active ? "bg-green-500" : "bg-gray-400"}`} />
                      <h3 className="font-semibold text-gray-900 dark:text-white">{m.name}</h3>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editManager(m)}>
                        <Save size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(m.id)}>
                        <Trash2 size={14} className="text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-2">{m.api_base_url}{m.endpoint_path}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {m.last_synced_at ? `Sync: ${new Date(m.last_synced_at).toLocaleString("it")}` : "Mai sincronizzato"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={syncing === m.id}
                      onClick={() => handleFetch(m.id)}
                    >
                      <RefreshCw size={12} className={syncing === m.id ? "animate-spin" : ""} />
                      {syncing === m.id ? "Sync..." : "Sincronizza"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedManager} onValueChange={setSelectedManager}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i TM</SelectItem>
                {managers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              {[
                { label: "7g", days: 7 },
                { label: "14g", days: 14 },
                { label: "30g", days: 30 },
                { label: "90g", days: 90 },
              ].map(({ label, days }) => (
                <Button
                  key={label}
                  variant={dateLabel === label ? "default" : "outline"}
                  size="sm"
                  className="px-2.5 text-xs h-8"
                  onClick={() => {
                    setDateFrom(daysAgo(days))
                    setDateTo(new Date().toISOString().split("T")[0])
                    setDateLabel(label)
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-gray-400" />
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateLabel("") }} className="w-[130px] h-8 text-xs" />
              <span className="text-gray-400 text-xs">-</span>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateLabel("") }} className="w-[130px] h-8 text-xs" />
            </div>
          </div>

          {filteredData.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500">Approval Rate</p>
                    <p className={`text-2xl font-bold ${overallApprovalRate >= 70 ? "text-green-600" : overallApprovalRate >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                      {overallApprovalRate.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500">Totale</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(totals.total)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> Approvate</p>
                    <p className="text-2xl font-bold text-green-600">{formatNumber(totals.approved)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><XCircle size={12} className="text-red-500" /> Rifiutate</p>
                    <p className="text-2xl font-bold text-red-600">{formatNumber(totals.rejected)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12} className="text-yellow-500" /> In Attesa</p>
                    <p className="text-2xl font-bold text-yellow-600">{formatNumber(totals.pending)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500">Revenue TM</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totals.revenue)}</p>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="trend">
                <TabsList>
                  <TabsTrigger value="trend">Trend</TabsTrigger>
                  <TabsTrigger value="distribution">Distribuzione</TabsTrigger>
                  <TabsTrigger value="table">Tabella</TabsTrigger>
                </TabsList>

                <TabsContent value="trend" className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader><CardTitle>Approval Rate nel tempo</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={dailyChart}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                            <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Approval %" />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Conversioni giornaliere</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={dailyChart}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="approved" fill="#22c55e" name="Approvate" stackId="a" />
                            <Bar dataKey="rejected" fill="#ef4444" name="Rifiutate" stackId="a" />
                            <Bar dataKey="pending" fill="#f59e0b" name="In attesa" stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="distribution">
                  <Card>
                    <CardHeader><CardTitle>Distribuzione Conversioni</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" outerRadius={130} dataKey="value"
                            label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => formatNumber(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="table">
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50 dark:bg-gray-800/50">
                              <th className="text-left py-3 px-4 font-medium text-gray-500">Data</th>
                              {selectedManager === "all" && <th className="text-left py-3 px-4 font-medium text-gray-500">TM</th>}
                              <th className="text-right py-3 px-4 font-medium text-gray-500">Totale</th>
                              <th className="text-right py-3 px-4 font-medium text-gray-500">Approvate</th>
                              <th className="text-right py-3 px-4 font-medium text-gray-500">Rifiutate</th>
                              <th className="text-right py-3 px-4 font-medium text-gray-500">In Attesa</th>
                              <th className="text-right py-3 px-4 font-medium text-gray-500">Approval %</th>
                              <th className="text-right py-3 px-4 font-medium text-gray-500">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...filteredData].reverse().map((d) => {
                              const mgr = managers.find(m => m.id === d.traffic_manager_id)
                              return (
                                <tr key={d.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                  <td className="py-2 px-4 font-medium">{d.date}</td>
                                  {selectedManager === "all" && <td className="py-2 px-4 text-gray-500 text-xs">{mgr?.name || "-"}</td>}
                                  <td className="py-2 px-4 text-right">{formatNumber(d.total_conversions)}</td>
                                  <td className="py-2 px-4 text-right text-green-600">{formatNumber(d.approved_conversions)}</td>
                                  <td className="py-2 px-4 text-right text-red-600">{formatNumber(d.rejected_conversions)}</td>
                                  <td className="py-2 px-4 text-right text-yellow-600">{formatNumber(d.pending_conversions)}</td>
                                  <td className="py-2 px-4 text-right">
                                    <Badge className={d.approval_rate >= 70 ? "bg-green-100 text-green-700" : d.approval_rate >= 40 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}>
                                      {d.approval_rate.toFixed(1)}%
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-4 text-right">{formatCurrency(Number(d.revenue))}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <BarChart3 size={48} className="mx-auto mb-4 text-gray-300" />
                <p className="font-medium">Nessun dato disponibile</p>
                <p className="text-sm mt-1">Clicca &quot;Sincronizza&quot; su un Traffic Manager per importare i dati</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {managers.length === 0 && !showForm && (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">
            <TrendingUp size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="font-medium">Nessun Traffic Manager collegato</p>
            <p className="text-sm mt-2">Collega il tuo Traffic Manager per vedere l&apos;Approval Rate delle conversioni</p>
            <Button className="mt-4" onClick={() => { resetForm(); setShowForm(true) }}>
              <Plus size={16} /> Aggiungi Connessione
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
