import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { post_ids } = await req.json()
    if (!post_ids || !Array.isArray(post_ids)) {
      return NextResponse.json({ error: "post_ids required" }, { status: 400 })
    }

    // Log the intent  
    for (const post_id of post_ids) {
      await supabaseAdmin.from("action_logs").insert([{
        user_id: user.id,
        action_type: "CREATE_AD_FROM_POST",
        target_type: "page_post",
        target_id: post_id,
        status: "pending",
        message: "Tạo ads từ bài viết: " + post_id
      }])

      // Update post status
      await supabaseAdmin.from("page_posts")
        .update({ promotion_status: "currently_promoted" })
        .eq("post_id", post_id)
    }

    return NextResponse.json({ 
      message: `Đã ghi nhận yêu cầu tạo ads cho ${post_ids.length} bài viết. Tính năng kết nối Facebook API sẽ thực thi khi cấu hình kết nối.`,
      count: post_ids.length
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
