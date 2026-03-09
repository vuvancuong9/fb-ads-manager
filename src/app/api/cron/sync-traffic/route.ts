import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const serviceClient = await createServiceClient()
    const { data: managers } = await serviceClient.from("traffic_managers").select("*").eq("is_active", true)
    if (!managers || managers.length === 0) {
      return NextResponse.json({ message: "No active traffic managers" })
    }

    const today = new Date().toISOString().split("T")[0]
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`

    const safeNum = (v: any): number => {
      const n = Number(v)
      return isNaN(n) ? 0 : n
    }

    const results = []

    for (const manager of managers) {
      try {
        let apiUrl = manager.api_base_url || ""
        if (manager.endpoint_path && manager.endpoint_path !== "/") {
          apiUrl = apiUrl.replace(/\/$/, "") + manager.endpoint_path
        }
        apiUrl = apiUrl.replace(/\/$/, "") + `/${monthStart}/${today}`

        const headers: Record<string, string> = { "Accept": "application/json" }
        if (manager.api_key) headers["x-api-key"] = manager.api_key
        if (manager.api_secret) headers["x-user-id"] = manager.api_secret

        const res = await fetch(apiUrl, { headers })
        if (!res.ok) {
          results.push({ name: manager.name, error: `API ${res.status}` })
          continue
        }

        const apiData = await res.json()
        let records: any[] = []
        if (Array.isArray(apiData)) records = apiData
        else if (apiData?.data && Array.isArray(apiData.data)) records = apiData.data
        else if (typeof apiData === "object" && apiData !== null) records = [apiData]

        let totalLeads = 0, totalConfirmed = 0, totalCanceled = 0, totalPending = 0
        let totalRevenue = 0, totalApprovedConv = 0

        for (const r of records) {
          const l = r.leads || {}
          const c = r.conversions || {}
          const confirmed = safeNum(l.confirmed?.total ?? r.confirmed?.total)
          const canceled = safeNum(l.canceled?.total ?? r.canceled?.total)
          const pendingConv = safeNum(c.pending?.total ?? l.to_call_back?.total)
          const approvedConv = safeNum(c.approved?.total)
          const doubles = safeNum(l.double ?? r.double)
          const trash = safeNum(l.trash ?? r.trash)

          totalLeads += confirmed + canceled + pendingConv + doubles + trash
          totalConfirmed += confirmed
          totalCanceled += canceled
          totalPending += pendingConv
          totalApprovedConv += approvedConv
          totalRevenue += safeNum(l.confirmed?.payout) + safeNum(c.approved?.payout)
        }

        const approved = totalApprovedConv > 0 ? totalApprovedConv : totalConfirmed
        const approvalRate = totalLeads > 0 ? (approved / totalLeads) * 100 : 0

        await serviceClient.from("traffic_manager_data").delete().eq("traffic_manager_id", manager.id)
        await serviceClient.from("traffic_manager_data").insert({
          traffic_manager_id: manager.id,
          date: today,
          total_conversions: totalLeads,
          approved_conversions: approved,
          rejected_conversions: totalCanceled,
          pending_conversions: totalPending,
          approval_rate: Math.round(approvalRate * 100) / 100,
          revenue: totalRevenue,
          raw_data: apiData,
        })

        await serviceClient.from("traffic_managers").update({ last_synced_at: new Date().toISOString() }).eq("id", manager.id)
        results.push({ name: manager.name, ok: true, offers: records.length })
      } catch (e) {
        results.push({ name: manager.name, error: e instanceof Error ? e.message : "unknown" })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
