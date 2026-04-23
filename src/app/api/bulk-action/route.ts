import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { items, dry_run = false } = body

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "items required" }, { status: 400 })
    }

    const results = []
    for (const item of items) {
      if (dry_run) {
        results.push({
          sub_id: item.sub_id,
          action: item.action,
          message: `[DRY RUN] Sẽ thực hiện: ${item.action_label || item.action}`,
          success: true
        })
        continue
      }

      // Log action
      const { error: logErr } = await supabase.from("action_logs").insert([{
        user_id: user.id,
        action_type: item.action,
        target_type: "sub_id",
        target_id: item.sub_id,
        details: { reason: item.reason, roi: item.roi_ngay, ads_ngay: item.ads_ngay },
        status: "pending",
        message: item.action_label || item.action
      }])

      // Note: Actual Facebook API call would be here
      // For now we log the intent
      results.push({
        sub_id: item.sub_id,
        action: item.action,
        message: `Đã ghi nhận hành động: ${item.action_label || item.action}`,
        success: !logErr
      })
    }

    return NextResponse.json({ results, count: results.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
