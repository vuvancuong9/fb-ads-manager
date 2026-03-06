"use client"

import { useEffect, useState, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatNumber, formatPercent, getStatusBadgeColor } from "@/lib/utils"
import { Search, Play, Pause, RefreshCw, Calendar } from "lucide-react"
import type { Campaign, CampaignInsight } from "@/types/database"

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

export default function CampaignsPage() {
  const { selectedAccountId, accounts } = useAppStore()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [insights, setInsights] = useState<Record<string, CampaignInsight>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [toggling, setToggling] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState("")
  const [dateFrom, setDateFrom] = useState(() => daysAgo(7))
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
  const [dateLabel, setDateLabel] = useState("7g")

  const load = useCallback(async () => {
    setLoading(true)

    const accParam = selectedAccountId ? `&accountId=${selectedAccountId}` : ""
    const [campRes, insightRes] = await Promise.all([
      fetch(`/api/user/resources?type=campaigns${accParam}`).then(r => r.json()),
      fetch(`/api/user/resources?type=insights${accParam}&from=${dateFrom}&to=${dateTo}`).then(r => r.json()),
    ])

    const insightMap: Record<string, CampaignInsight> = {}
    for (const i of (insightRes.data || []) as CampaignInsight[]) {
      const existing = insightMap[i.campaign_id]
      if (!existing) {
        insightMap[i.campaign_id] = { ...i }
      } else {
        existing.spend += i.spend
        existing.impressions += i.impressions
        existing.clicks += i.clicks
        existing.reach += i.reach
        existing.conversions += i.conversions
        existing.conversion_value += i.conversion_value
        existing.ctr = existing.impressions > 0 ? (existing.clicks / existing.impressions) * 100 : 0
        existing.cpc = existing.clicks > 0 ? existing.spend / existing.clicks : 0
        existing.cpm = existing.impressions > 0 ? (existing.spend / existing.impressions) * 1000 : 0
        existing.cost_per_conversion = existing.conversions > 0 ? existing.spend / existing.conversions : 0
        existing.roas = existing.spend > 0 ? existing.conversion_value / existing.spend : 0
      }
    }

    setCampaigns((campRes.data || []) as Campaign[])
    setInsights(insightMap)
    setLoading(false)
  }, [selectedAccountId, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult("Recupero lista account...")
    let totalCampaigns = 0
    let totalInsights = 0
    const errors: string[] = []

    try {
      const firstRes = await fetch("/api/facebook/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const firstData = await firstRes.json()

      if (firstData.error) {
        setSyncResult(`Errore: ${firstData.error}`)
        setSyncing(false)
        return
      }

      if (firstData.results) {
        totalCampaigns += firstData.results.campaigns
        totalInsights += firstData.results.insights
        if (firstData.results.errors) errors.push(...firstData.results.errors)
        setSyncResult(`${firstData.results.account}: ${firstData.results.campaigns} campagne...`)
      }

      const allIds: string[] = firstData.allAccountIds || []
      const syncedFirst = firstData.results?.account

      for (let i = 0; i < allIds.length; i++) {
        try {
          const res = await fetch("/api/facebook/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId: allIds[i] }),
          })
          const data = await res.json()
          if (data.results) {
            if (data.results.account === syncedFirst && i === 0) continue
            totalCampaigns += data.results.campaigns
            totalInsights += data.results.insights
            if (data.results.errors) errors.push(...data.results.errors)
            setSyncResult(`Sync ${i + 1}/${allIds.length}: ${data.results.account} (${data.results.campaigns} campagne)`)
          }
        } catch {
          errors.push(`Account ${i + 1}: timeout`)
        }
      }

      setSyncResult(`Completato: ${totalCampaigns} campagne, ${totalInsights} insights${errors.length ? ` - ${errors.length} errori` : ""}`)
      await load()
    } catch {
      setSyncResult("Errore di connessione")
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(""), 10000)
    }
  }

  const handleToggleStatus = async (campaign: Campaign) => {
    setToggling(campaign.id)
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
    try {
      await fetch("/api/facebook/campaigns/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.fb_campaign_id,
          accountId: campaign.fb_ad_account_id,
          status: newStatus,
        }),
      })
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, status: newStatus } : c))
      )
    } finally {
      setToggling(null)
    }
  }

  const filtered = campaigns.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Campagne</h1>
          <p className="text-gray-500">{campaigns.length} campagne totali</p>
          {syncResult && <p className={`text-sm mt-1 ${syncResult.includes("Errore") ? "text-red-500" : "text-blue-500"}`}>{syncResult}</p>}
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Sincronizzazione..." : "Sincronizza da Facebook"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            placeholder="Cerca campagna..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="ACTIVE">Attive</SelectItem>
            <SelectItem value="PAUSED">In pausa</SelectItem>
            <SelectItem value="DELETED">Eliminate</SelectItem>
            <SelectItem value="ARCHIVED">Archiviate</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex gap-1">
            {[
              { label: "Oggi", days: 0 },
              { label: "Ieri", days: 1 },
              { label: "3g", days: 3 },
              { label: "7g", days: 7 },
              { label: "14g", days: 14 },
              { label: "30g", days: 30 },
            ].map(({ label, days }) => (
              <Button
                key={label}
                variant={dateLabel === label ? "default" : "outline"}
                size="sm"
                className="px-2.5 text-xs h-8"
                onClick={() => {
                  const to = days === 1 ? daysAgo(1) : new Date().toISOString().split("T")[0]
                  const from = days <= 1 ? to : daysAgo(days)
                  setDateFrom(from)
                  setDateTo(to)
                  setDateLabel(label)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-gray-400" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setDateLabel("") }}
              className="w-[130px] h-8 text-xs"
            />
            <span className="text-gray-400 text-xs">-</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setDateLabel("") }}
              className="w-[130px] h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Campagna</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Account</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">Stato</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Spesa{dateLabel ? ` ${dateLabel}` : ""}</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Impr.</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Click</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">CTR</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Conv.</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">CPA</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">ROAS</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-500">
                      Nessuna campagna trovata
                    </td>
                  </tr>
                ) : (
                  filtered.map((campaign) => {
                    const insight = insights[campaign.id]
                    const acc = campaign.fb_ad_account as { name: string } | undefined
                    return (
                      <tr key={campaign.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                            {campaign.name}
                          </p>
                          <p className="text-xs text-gray-400">{campaign.objective}</p>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-300 text-xs">
                          {acc?.name || "-"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge className={getStatusBadgeColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">{insight ? formatCurrency(insight.spend) : "-"}</td>
                        <td className="py-3 px-4 text-right">{insight ? formatNumber(insight.impressions) : "-"}</td>
                        <td className="py-3 px-4 text-right">{insight ? formatNumber(insight.clicks) : "-"}</td>
                        <td className="py-3 px-4 text-right">{insight ? formatPercent(insight.ctr) : "-"}</td>
                        <td className="py-3 px-4 text-right font-medium">{insight ? formatNumber(insight.conversions) : "-"}</td>
                        <td className="py-3 px-4 text-right">{insight ? formatCurrency(insight.cost_per_conversion) : "-"}</td>
                        <td className="py-3 px-4 text-right">
                          {insight ? (
                            <span className={insight.roas >= 1 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                              {insight.roas.toFixed(2)}x
                            </span>
                          ) : "-"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={toggling === campaign.id}
                            onClick={() => handleToggleStatus(campaign)}
                          >
                            {campaign.status === "ACTIVE" ? (
                              <Pause size={16} className="text-yellow-500" />
                            ) : (
                              <Play size={16} className="text-green-500" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
