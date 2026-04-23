import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { page_id } = await req.json()
    if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 })

    // Get active Facebook connection
    const { data: conn } = await supabaseAdmin
      .from("facebook_connections")
      .select("access_token")
      .eq("is_active", true)
      .single()

    if (!conn) {
      return NextResponse.json({ error: "Không tìm thấy kết nối Facebook đang hoạt động" }, { status: 400 })
    }

    // Fetch posts from Facebook Graph API
    const fbUrl = `https://graph.facebook.com/v18.0/${page_id}/posts?fields=id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares&access_token=${conn.access_token}&limit=50`
    
    const fbRes = await fetch(fbUrl)
    const fbData = await fbRes.json()

    if (fbData.error) {
      return NextResponse.json({ error: fbData.error.message }, { status: 400 })
    }

    const posts = fbData.data || []
    let synced = 0

    for (const post of posts) {
      await supabaseAdmin.from("page_posts").upsert({
        post_id: post.id,
        page_id,
        message: post.message || "",
        created_time: post.created_time,
        full_picture: post.full_picture || "",
        permalink_url: post.permalink_url || "",
        likes_count: post.likes?.summary?.total_count || 0,
        comments_count: post.comments?.summary?.total_count || 0,
        shares_count: post.shares?.count || 0,
        promotion_status: "never_promoted",
        synced_at: new Date().toISOString()
      }, { onConflict: "post_id", ignoreDuplicates: false })
      synced++
    }

    return NextResponse.json({ 
      message: `Đã đồng bộ ${synced} bài viết từ Page ${page_id}`,
      synced 
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
