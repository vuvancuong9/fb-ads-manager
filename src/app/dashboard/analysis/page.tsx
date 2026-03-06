"use client"

import { useEffect, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area, ComposedChart,
} from "recharts"
import type { Campaign, CampaignInsight } from "@/types/database"

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"]

export default function AnalysisPage() {
  const { selectedAccountId } = useAppStore()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [insights, setInsights] = useState<CampaignInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all")

  useEffect(() => {
    async function load() {
      setLoading(true)
      const accParam = selectedAccountId ? `&accountId=${selectedAccountId}` : ""
      const [campRes, insightRes] = await Promise.all([
        fetch(`/api/user/resources?type=campaigns${accParam}`).then(r => r.json()),
        fetch(`/api/user/resources?type=insights${accParam}&from=${dateFrom}&to=${dateTo}`).then(r => r.json()),
      ])
      setCampaigns((campRes.data || []) as Campaign[])
      let filteredInsights = (insightRes.data || []) as CampaignInsight[]
      if (selectedCampaign !== "all") {
        filteredInsights = filteredInsights.filter(i => i.campaign_id === selectedCampaign)
      }
      setInsights(filteredInsights)
      setLoading(false)
    }

    load()
  }, [selectedAccountId, dateFrom, dateTo, selectedCampaign])

  const totals = insights.reduce(
    (acc, i) => ({
      spend: acc.spend + Number(i.spend),
      impressions: acc.impressions + i.impressions,
      clicks: acc.clicks + i.clicks,
      conversions: acc.conversions + i.conversions,
      conversionValue: acc.conversionValue + Number(i.conversion_value),
      reach: acc.reach + i.reach,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, reach: 0 }
  )

  const roas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0
  const profit = totals.conversionValue - totals.spend

  const dailyData = insights.reduce((acc, i) => {
    const existing = acc.find((d) => d.date === i.date)
    if (existing) {
      existing.spend += Number(i.spend)
      existing.conversions += i.conversions
      existing.revenue += Number(i.conversion_value)
      existing.clicks += i.clicks
      existing.impressions += i.impressions
    } else {
      acc.push({
        date: i.date,
        spend: Number(i.spend),
        conversions: i.conversions,
        revenue: Number(i.conversion_value),
        clicks: i.clicks,
        impressions: i.impressions,
      })
    }
    return acc
  }, [] as { date: string; spend: number; conversions: number; revenue: number; clicks: number; impressions: number }[])

  const campaignPerformance = campaigns.map((c) => {
    const cInsights = insights.filter((i) => i.campaign_id === c.id)
    const totalSpend = cInsights.reduce((s, i) => s + Number(i.spend), 0)
    const totalConv = cInsights.reduce((s, i) => s + i.conversions, 0)
    const totalRevenue = cInsights.reduce((s, i) => s + Number(i.conversion_value), 0)
    return {
      name: c.name.length > 25 ? c.name.slice(0, 25) + "..." : c.name,
      spend: totalSpend,
      conversions: totalConv,
      revenue: totalRevenue,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      cpa: totalConv > 0 ? totalSpend / totalConv : 0,
    }
  }).filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend)

  const spendDistribution = campaignPerformance.slice(0, 8).map((c) => ({
    name: c.name,
    value: c.spend,
  }))

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analisi Campagne</h1>
        <p className="text-gray-500">Analisi dettagliata delle performance</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Da:</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">A:</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto" />
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Tutte le campagne" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le campagne</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              variant="outline"
              size="sm"
              onClick={() => {
                const from = new Date()
                from.setDate(from.getDate() - d)
                setDateFrom(from.toISOString().split("T")[0])
                setDateTo(new Date().toISOString().split("T")[0])
              }}
            >
              {d}g
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: "Spesa", value: formatCurrency(totals.spend) },
          { label: "Revenue", value: formatCurrency(totals.conversionValue) },
          { label: "Profitto", value: formatCurrency(profit), color: profit >= 0 ? "text-green-600" : "text-red-600" },
          { label: "ROAS", value: roas.toFixed(2) + "x", color: roas >= 1 ? "text-green-600" : "text-red-600" },
          { label: "Conversioni", value: formatNumber(totals.conversions) },
          { label: "CPA", value: formatCurrency(cpa) },
          { label: "CTR", value: formatPercent(ctr) },
          { label: "Impressioni", value: formatNumber(totals.impressions) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color || "text-gray-900 dark:text-white"}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="comparison">Confronto</TabsTrigger>
          <TabsTrigger value="distribution">Distribuzione</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Spesa e Revenue nel tempo</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" fill="#dcfce7" stroke="#22c55e" name="Revenue" />
                  <Bar dataKey="spend" fill="#ef4444" name="Spesa" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="conversions" stroke="#3b82f6" strokeWidth={2} name="Conversioni" yAxisId="right" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Performance per Campagna</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={campaignPerformance.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="spend" fill="#ef4444" name="Spesa" />
                  <Bar dataKey="revenue" fill="#22c55e" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>ROAS per Campagna</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={campaignPerformance.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="roas" name="ROAS" radius={[4, 4, 0, 0]}>
                    {campaignPerformance.slice(0, 10).map((entry, index) => (
                      <Cell key={index} fill={entry.roas >= 1 ? "#22c55e" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution">
          <Card>
            <CardHeader><CardTitle>Distribuzione Spesa</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie data={spendDistribution} cx="50%" cy="50%" outerRadius={150} fill="#8884d8" dataKey="value" label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
                    {spendDistribution.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
