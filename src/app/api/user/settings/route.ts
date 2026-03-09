import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data } = await serviceClient
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single()

    return NextResponse.json({
      settings: data || {
        anthropic_api_key: "",
        openai_api_key: "",
        preferred_model: "claude",
      },
    })
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

    const { data: existing } = await serviceClient
      .from("user_settings")
      .select("id")
      .eq("user_id", user.id)
      .single()

    const settingsData = {
      user_id: user.id,
      anthropic_api_key: body.anthropic_api_key || null,
      openai_api_key: body.openai_api_key || null,
      preferred_model: body.preferred_model || "claude",
    }

    if (existing) {
      const { error } = await serviceClient
        .from("user_settings")
        .update(settingsData)
        .eq("user_id", user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await serviceClient
        .from("user_settings")
        .insert(settingsData)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
