import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const ctx: any = {}

    const { data: accounts } = isAdmin
      ? await serviceClient.from("fb_ad_accounts").select("id,name,account_id,status,currency,last_synced_at").order("name")
      : await (async () => {
          const { data: assignments } = await serviceClient.from("user_account_assignments").select("fb_ad_account_id").eq("user_id", user.id)
          const ids = (assignments || []).map((a: any) => a.fb_ad_account_id)
          if (ids.length === 0) return { data: [] }
          return serviceClient.from("fb_ad_accounts").select("id,name,account_id,status,currency,last_synced_at").in("id", ids)
        })()

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

      const { data: insights } = await serviceClient.from("campaign_insights").select("campaign_id,date,spend,impressions,clicks,ctr,conversions,conversion_value,roas,cost_per_conversion").in("fb_ad_account_id", accountIds).gte("date", weekAgo).lte("date", today)

      if (insights && insights.length > 0) {
        const totals = insights.reduce((acc: any, i: any) => ({
          spend: acc.spend + Number(i.spend),
          impressions: acc.impressions + Number(i.impressions),
          clicks: acc.clicks + Number(i.clicks),
          conversions: acc.conversions + Number(i.conversions),
          conversionValue: acc.conversionValue + Number(i.conversion_value),
        }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 })

        ctx.insights7d = {
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
          if (!byCampaign[i.campaign_id]) byCampaign[i.campaign_id] = { spend: 0, conversions: 0, convValue: 0, clicks: 0 }
          byCampaign[i.campaign_id].spend += Number(i.spend)
          byCampaign[i.campaign_id].conversions += Number(i.conversions)
          byCampaign[i.campaign_id].convValue += Number(i.conversion_value)
          byCampaign[i.campaign_id].clicks += Number(i.clicks)
        }

        const campaignPerf = Object.entries(byCampaign).map(([cid, data]) => {
          const camp = (campaigns || []).find((c: any) => c.id === cid)
          return {
            name: camp?.name || cid, status: camp?.status,
            spend: Math.round(data.spend * 100) / 100,
            conversions: data.conversions,
            roas: data.spend > 0 ? Math.round((data.convValue / data.spend) * 100) / 100 : 0,
            cpa: data.conversions > 0 ? Math.round((data.spend / data.conversions) * 100) / 100 : 0,
          }
        }).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend)

        ctx.topCampaigns = campaignPerf.slice(0, 15)
        ctx.worstRoas = campaignPerf.filter(c => c.roas < 1 && c.spend > 5).sort((a, b) => a.roas - b.roas).slice(0, 5)
        ctx.bestRoas = campaignPerf.filter(c => c.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, 5)
      }
    }

    const { data: tmData } = await serviceClient.from("traffic_manager_data").select("*").gte("date", weekAgo).lte("date", today)
    if (tmData && tmData.length > 0) {
      const tmTotals = tmData.reduce((acc: any, d: any) => ({
        total: acc.total + d.total_conversions,
        approved: acc.approved + d.approved_conversions,
        rejected: acc.rejected + d.rejected_conversions,
        pending: acc.pending + d.pending_conversions,
        revenue: acc.revenue + Number(d.revenue),
      }), { total: 0, approved: 0, rejected: 0, pending: 0, revenue: 0 })

      ctx.trafficManager = {
        totalConversions: tmTotals.total,
        approved: tmTotals.approved,
        rejected: tmTotals.rejected,
        pending: tmTotals.pending,
        approvalRate: tmTotals.total > 0 ? Math.round((tmTotals.approved / tmTotals.total) * 10000) / 100 : 0,
        revenue: Math.round(tmTotals.revenue * 100) / 100,
      }
    }

    return NextResponse.json({ context: ctx })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
