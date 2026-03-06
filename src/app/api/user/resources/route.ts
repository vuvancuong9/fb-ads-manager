import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const type = request.nextUrl.searchParams.get("type")

    if (type === "accounts") {
      if (isAdmin) {
        const { data } = await serviceClient.from("fb_ad_accounts").select("*").order("name")
        return NextResponse.json({ data: data || [] })
      }
      const { data: assignments } = await serviceClient
        .from("user_account_assignments")
        .select("fb_ad_account_id")
        .eq("user_id", user.id)
      const ids = (assignments || []).map(a => a.fb_ad_account_id)
      if (ids.length === 0) return NextResponse.json({ data: [] })
      const { data } = await serviceClient.from("fb_ad_accounts").select("*").in("id", ids).order("name")
      return NextResponse.json({ data: data || [] })
    }

    if (type === "pixels") {
      if (isAdmin) {
        const { data } = await serviceClient.from("fb_pixels").select("*, fb_ad_account:fb_ad_accounts(name)").order("name")
        return NextResponse.json({ data: data || [] })
      }
      const { data: assignments } = await serviceClient
        .from("user_pixel_assignments")
        .select("fb_pixel_id")
        .eq("user_id", user.id)
      const ids = (assignments || []).map(a => a.fb_pixel_id)
      if (ids.length === 0) return NextResponse.json({ data: [] })
      const { data } = await serviceClient.from("fb_pixels").select("*, fb_ad_account:fb_ad_accounts(name)").in("id", ids).order("name")
      return NextResponse.json({ data: data || [] })
    }

    if (type === "pages") {
      if (isAdmin) {
        const { data } = await serviceClient.from("fb_pages").select("*, fb_ad_account:fb_ad_accounts(name)").order("name")
        return NextResponse.json({ data: data || [] })
      }
      const { data: assignments } = await serviceClient
        .from("user_page_assignments")
        .select("fb_page_id")
        .eq("user_id", user.id)
      const ids = (assignments || []).map(a => a.fb_page_id)
      if (ids.length === 0) return NextResponse.json({ data: [] })
      const { data } = await serviceClient.from("fb_pages").select("*, fb_ad_account:fb_ad_accounts(name)").in("id", ids).order("name")
      return NextResponse.json({ data: data || [] })
    }

    if (type === "campaigns") {
      const accountId = request.nextUrl.searchParams.get("accountId")
      if (isAdmin) {
        let q = serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(name, account_id, access_token)").order("name")
        if (accountId) q = q.eq("fb_ad_account_id", accountId)
        const { data } = await q
        return NextResponse.json({ data: data || [] })
      }
      const { data: assignments } = await serviceClient
        .from("user_account_assignments")
        .select("fb_ad_account_id")
        .eq("user_id", user.id)
      const ids = (assignments || []).map(a => a.fb_ad_account_id)
      if (ids.length === 0) return NextResponse.json({ data: [] })
      let q = serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(name, account_id, access_token)").in("fb_ad_account_id", ids).order("name")
      if (accountId && ids.includes(accountId)) q = q.eq("fb_ad_account_id", accountId)
      const { data } = await q
      return NextResponse.json({ data: data || [] })
    }

    if (type === "insights") {
      const accountId = request.nextUrl.searchParams.get("accountId")
      const dateFrom = request.nextUrl.searchParams.get("from")
      const dateTo = request.nextUrl.searchParams.get("to")

      const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const defaultTo = new Date().toISOString().split("T")[0]

      const from = dateFrom || defaultFrom
      const to = dateTo || defaultTo

      const buildQuery = (q: any) => {
        q = q.gte("date", from).lte("date", to)
        if (accountId) q = q.eq("fb_ad_account_id", accountId)
        return q
      }

      if (isAdmin) {
        let q = serviceClient.from("campaign_insights").select("*")
        q = buildQuery(q)
        const { data } = await q
        return NextResponse.json({ data: data || [] })
      }
      const { data: assignments } = await serviceClient
        .from("user_account_assignments")
        .select("fb_ad_account_id")
        .eq("user_id", user.id)
      const ids = (assignments || []).map(a => a.fb_ad_account_id)
      if (ids.length === 0) return NextResponse.json({ data: [] })
      let q = serviceClient.from("campaign_insights").select("*").in("fb_ad_account_id", ids)
      q = buildQuery(q)
      const { data } = await q
      return NextResponse.json({ data: data || [] })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
