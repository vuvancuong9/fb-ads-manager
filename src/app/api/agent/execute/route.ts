import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const { action, params } = await request.json()

    if (action === "pause_campaign" || action === "activate_campaign") {
      const campaignName = params?.campaignName
      const campaignId = params?.campaignId
      const newStatus = action === "pause_campaign" ? "PAUSED" : "ACTIVE"

      let campaign: any = null
      if (campaignId) {
        const { data } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").eq("id", campaignId).single()
        campaign = data
      } else if (campaignName) {
        const { data } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${campaignName}%`).limit(1).single()
        campaign = data
      }

      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName || campaignId}" non trovata` })

      const token = (campaign.fb_ad_account as any)?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante per questo account" })

      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, access_token: token }),
      })

      if (!fbRes.ok) {
        const err = await fbRes.json().catch(() => ({}))
        return NextResponse.json({ success: false, message: err?.error?.message || `Facebook API error ${fbRes.status}` })
      }

      await serviceClient.from("campaigns").update({ status: newStatus }).eq("id", campaign.id)

      return NextResponse.json({
        success: true,
        message: `Campagna "${campaign.name}" ${newStatus === "PAUSED" ? "messa in pausa" : "attivata"} con successo`,
      })
    }

    if (action === "pause_multiple" || action === "activate_multiple") {
      const campaignNames: string[] = params?.campaignNames || []
      const newStatus = action === "pause_multiple" ? "PAUSED" : "ACTIVE"
      const results: string[] = []

      for (const name of campaignNames) {
        const { data: campaign } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${name}%`).limit(1).single()
        if (!campaign) { results.push(`"${name}": non trovata`); continue }

        const token = (campaign.fb_ad_account as any)?.access_token
        if (!token) { results.push(`"${name}": token mancante`); continue }

        const fbRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, access_token: token }),
        })

        if (fbRes.ok) {
          await serviceClient.from("campaigns").update({ status: newStatus }).eq("id", campaign.id)
          results.push(`"${campaign.name}": ${newStatus === "PAUSED" ? "pausata" : "attivata"}`)
        } else {
          results.push(`"${campaign.name}": errore Facebook`)
        }
      }

      return NextResponse.json({ success: true, message: results.join("\n") })
    }

    if (action === "update_budget") {
      const campaignName = params?.campaignName
      const newBudget = params?.budget

      if (!campaignName || !newBudget) return NextResponse.json({ success: false, message: "Nome campagna e budget richiesti" })

      const { data: campaign } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${campaignName}%`).limit(1).single()
      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName}" non trovata` })

      const token = (campaign.fb_ad_account as any)?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante" })

      const budgetCents = Math.round(Number(newBudget) * 100)
      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_budget: budgetCents, access_token: token }),
      })

      if (!fbRes.ok) {
        const err = await fbRes.json().catch(() => ({}))
        return NextResponse.json({ success: false, message: err?.error?.message || "Errore Facebook" })
      }

      await serviceClient.from("campaigns").update({ daily_budget: budgetCents }).eq("id", campaign.id)
      return NextResponse.json({ success: true, message: `Budget di "${campaign.name}" aggiornato a €${newBudget}/giorno` })
    }

    if (action === "sync_campaigns") {
      const { data: accounts } = isAdmin
        ? await serviceClient.from("fb_ad_accounts").select("id").eq("status", "active")
        : await serviceClient.from("user_account_assignments").select("fb_ad_account_id").eq("user_id", user.id)

      const ids = isAdmin ? (accounts || []).map((a: any) => a.id) : (accounts || []).map((a: any) => a.fb_ad_account_id)
      let total = 0

      for (const id of ids) {
        try {
          const res = await fetch(new URL("/api/facebook/sync", request.url).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
            body: JSON.stringify({ accountId: id }),
          })
          const data = await res.json()
          if (data.results) total += data.results.campaigns
        } catch { /* skip */ }
      }

      return NextResponse.json({ success: true, message: `Sincronizzazione completata: ${total} campagne aggiornate da ${ids.length} account` })
    }

    if (action === "get_campaign_details") {
      const campaignName = params?.campaignName
      if (!campaignName) return NextResponse.json({ success: false, message: "Nome campagna richiesto" })

      const { data: campaign } = await serviceClient.from("campaigns").select("*").ilike("name", `%${campaignName}%`).limit(1).single()
      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName}" non trovata` })

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const { data: insights } = await serviceClient.from("campaign_insights").select("*").eq("campaign_id", campaign.id).gte("date", weekAgo).order("date")

      return NextResponse.json({
        success: true,
        campaign,
        insights: insights || [],
        message: `Dettagli campagna "${campaign.name}" caricati`,
      })
    }

    return NextResponse.json({ success: false, message: `Azione "${action}" non supportata` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
