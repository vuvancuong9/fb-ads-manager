import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    let managers, managerData
    if (isAdmin) {
      const res = await serviceClient.from("traffic_managers").select("*").order("name")
      managers = res.data
    } else {
      const res = await serviceClient.from("traffic_managers").select("*").eq("created_by", user.id).order("name")
      managers = res.data
    }

    const ids = (managers || []).map((m: any) => m.id)
    if (ids.length > 0) {
      const res = await serviceClient.from("traffic_manager_data").select("*").in("traffic_manager_id", ids).order("date", { ascending: false }).limit(500)
      managerData = res.data
    }

    return NextResponse.json({ managers: managers || [], data: managerData || [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()

    const body = await request.json()
    const { action } = body

    if (action === "create") {
      let baseUrl = body.api_base_url || ""
      let endpointPath = ""
      try {
        const parsed = new URL(baseUrl)
        if (parsed.pathname && parsed.pathname !== "/") {
          endpointPath = parsed.pathname
          baseUrl = `${parsed.protocol}//${parsed.host}`
        }
      } catch { /* not a valid URL yet */ }

      const { data, error } = await serviceClient.from("traffic_managers").insert({
        name: body.name,
        api_base_url: baseUrl,
        api_key: body.api_key || null,
        api_secret: body.api_secret || null,
        auth_type: body.auth_type || "bearer",
        auth_param_name: body.auth_param_name || "Authorization",
        endpoint_path: endpointPath || body.endpoint_path || "/",
        response_mapping: body.response_mapping || {},
        extra_params: body.extra_params || {},
        is_active: true,
        created_by: user.id,
      }).select().single()

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, manager: data })
    }

    if (action === "update") {
      const { id, ...updates } = body
      delete updates.action
      const { error } = await serviceClient.from("traffic_managers").update(updates).eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (action === "delete") {
      await serviceClient.from("traffic_manager_data").delete().eq("traffic_manager_id", body.id)
      await serviceClient.from("traffic_managers").delete().eq("id", body.id)
      return NextResponse.json({ success: true })
    }

    if (action === "fetch") {
      const { data: manager } = await serviceClient.from("traffic_managers").select("*").eq("id", body.id).single()
      if (!manager) return NextResponse.json({ error: "Not found" }, { status: 404 })

      const dateFrom = body.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const dateTo = body.dateTo || new Date().toISOString().split("T")[0]

      let fetchUrl: URL
      try {
        const fullUrl = manager.endpoint_path && manager.endpoint_path !== "/"
          ? new URL(manager.endpoint_path, manager.api_base_url)
          : new URL(manager.api_base_url)
        fetchUrl = fullUrl
      } catch {
        return NextResponse.json({ error: "URL non valido nel manager" }, { status: 400 })
      }

      if (manager.api_secret) {
        fetchUrl.searchParams.set("user_id", manager.api_secret)
      }

      const extraParams = manager.extra_params || {}
      for (const [k, v] of Object.entries(extraParams)) {
        const val = String(v).replace("{dateFrom}", dateFrom).replace("{dateTo}", dateTo)
        fetchUrl.searchParams.set(k, val)
      }

      if (manager.auth_type === "query_param") {
        fetchUrl.searchParams.set(manager.auth_param_name, manager.api_key || "")
      }

      const headers: Record<string, string> = { "Accept": "application/json" }
      if (manager.auth_type === "bearer") {
        if (manager.api_key) headers["Authorization"] = `Bearer ${manager.api_key}`
      } else if (manager.auth_type === "api_key") {
        headers[manager.auth_param_name] = manager.api_key || ""
      } else if (manager.auth_type === "basic") {
        headers["Authorization"] = `Basic ${Buffer.from(`${manager.api_key}:${manager.api_secret || ""}`).toString("base64")}`
      }

      try {
        const res = await fetch(fetchUrl.toString(), { headers })
        if (!res.ok) {
          const errText = await res.text()
          return NextResponse.json({ error: `API Error ${res.status}: ${errText.slice(0, 200)}` }, { status: 400 })
        }

        const apiData = await res.json()
        const mapping = manager.response_mapping || {}

        const getNestedValue = (obj: any, path: string) => {
          return path.split(".").reduce((o, k) => o?.[k], obj)
        }

        let records = apiData
        if (mapping.data_root) {
          records = getNestedValue(apiData, mapping.data_root)
        }

        if (!Array.isArray(records)) records = [records]

        let savedCount = 0
        for (const record of records) {
          const total = Number(getNestedValue(record, mapping.total_field || "total") || 0)
          const approved = Number(getNestedValue(record, mapping.approved_field || "approved") || 0)
          const rejected = Number(getNestedValue(record, mapping.rejected_field || "rejected") || 0)
          const pending = Number(getNestedValue(record, mapping.pending_field || "pending") || 0)
          const revenue = Number(getNestedValue(record, mapping.revenue_field || "revenue") || 0)
          const date = String(getNestedValue(record, mapping.date_field || "date") || dateTo)

          const approvalRate = total > 0 ? (approved / total) * 100 : 0

          await serviceClient.from("traffic_manager_data").upsert({
            traffic_manager_id: manager.id,
            date: date.split("T")[0],
            total_conversions: total,
            approved_conversions: approved,
            rejected_conversions: rejected,
            pending_conversions: pending,
            approval_rate: Math.round(approvalRate * 100) / 100,
            revenue,
            raw_data: record,
          }, { onConflict: "traffic_manager_id,date" })
          savedCount++
        }

        await serviceClient.from("traffic_managers").update({ last_synced_at: new Date().toISOString() }).eq("id", manager.id)

        return NextResponse.json({ success: true, records: savedCount, raw: apiData })
      } catch (e) {
        return NextResponse.json({
          error: `Connessione fallita: ${e instanceof Error ? e.message : "errore"}`,
        }, { status: 400 })
      }
    }

    if (action === "test") {
      let testUrl: URL
      try {
        testUrl = new URL(body.api_base_url)
      } catch {
        try {
          testUrl = new URL(body.endpoint_path || "/", body.api_base_url)
        } catch {
          return NextResponse.json({ error: "URL non valido" }, { status: 400 })
        }
      }

      if (body.api_secret) {
        testUrl.searchParams.set("user_id", body.api_secret)
      }
      if (body.api_key && body.auth_type === "query_param") {
        testUrl.searchParams.set(body.auth_param_name || "api_key", body.api_key)
      }

      const extraParams = body.extra_params || {}
      for (const [k, v] of Object.entries(extraParams)) {
        testUrl.searchParams.set(k, String(v))
      }

      const headers: Record<string, string> = { "Accept": "application/json" }
      if (!body.auth_type || body.auth_type === "bearer") {
        if (body.api_key) headers["Authorization"] = `Bearer ${body.api_key}`
      } else if (body.auth_type === "api_key") {
        headers[body.auth_param_name || "X-Api-Key"] = body.api_key || ""
      } else if (body.auth_type === "basic") {
        headers["Authorization"] = `Basic ${Buffer.from(`${body.api_key}:${body.api_secret || ""}`).toString("base64")}`
      }

      try {
        const res = await fetch(testUrl.toString(), { headers })
        const text = await res.text()
        let json = null
        try { json = JSON.parse(text) } catch { /* not json */ }
        return NextResponse.json({ status: res.status, ok: res.ok, data: json, raw: json ? undefined : text.slice(0, 1000) })
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Connection failed" }, { status: 400 })
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
