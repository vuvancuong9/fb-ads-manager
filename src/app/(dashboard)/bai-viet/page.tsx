"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type Post = {
  id: string
  post_id: string
  page_id: string
  message: string
  created_time: string
  promotion_status: "never_promoted" | "was_promoted" | "currently_promoted"
  permalink_url: string
  full_picture: string
  likes_count: number
  comments_count: number
  shares_count: number
}

export default function BaiVietPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState("never_promoted")
  const [syncMessage, setSyncMessage] = useState("")
  const [pageId, setPageId] = useState("")
  const supabase = createClient()

  useEffect(() => {
    loadPosts()
  }, [filterStatus])

  async function loadPosts() {
    setLoading(true)
    let query = supabase.from("page_posts").select("*").order("created_time", { ascending: false })
    if (filterStatus !== "all") {
      query = query.eq("promotion_status", filterStatus)
    }
    const { data } = await query.limit(100)
    setPosts(data || [])
    setLoading(false)
  }

  async function syncPosts() {
    if (!pageId) {
      alert("Nhập Page ID để đồng bộ")
      return
    }
    setSyncing(true)
    setSyncMessage("")
    try {
      const res = await fetch("/api/facebook/sync-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId })
      })
      const json = await res.json()
      setSyncMessage(json.message || "Đồng bộ hoàn tất!")
      await loadPosts()
    } catch (e: any) {
      setSyncMessage("Lỗi: " + e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function createAdsFromPosts() {
    if (selected.size === 0) {
      alert("Chọn ít nhất 1 bài viết")
      return
    }
    const selectedPosts = posts.filter(p => selected.has(p.post_id))
    const confirmed = confirm(`Tạo ads cho ${selectedPosts.length} bài viết?`)
    if (!confirmed) return
    
    try {
      const res = await fetch("/api/facebook/create-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_ids: Array.from(selected) })
      })
      const json = await res.json()
      alert(json.message || "Đã gửi yêu cầu tạo ads!")
      setSelected(new Set())
      await loadPosts()
    } catch (e: any) {
      alert("Lỗi: " + e.message)
    }
  }

  function toggleSelect(postId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  const statusLabels: Record<string, string> = {
    never_promoted: "Chưa chạy ads",
    was_promoted: "Đã từng chạy",
    currently_promoted: "Đang chạy",
    all: "Tất cả"
  }

  const statusColors: Record<string, string> = {
    never_promoted: "bg-yellow-100 text-yellow-700",
    was_promoted: "bg-gray-100 text-gray-600",
    currently_promoted: "bg-green-100 text-green-700",
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài viết chưa lên ads</h1>
          <p className="text-gray-500 mt-1">Sync bài viết từ Facebook Page và tạo ads</p>
        </div>
        <div className="flex gap-3">
          {selected.size > 0 && (
            <Button onClick={createAdsFromPosts} className="bg-green-600 hover:bg-green-700 text-white">
              🚀 Tạo ads ({selected.size} bài)
            </Button>
          )}
        </div>
      </div>

      {/* Sync controls */}
      <div className="bg-white border rounded-lg p-4 flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-gray-700 mb-1">Page ID</label>
          <input
            type="text"
            value={pageId}
            onChange={e => setPageId(e.target.value)}
            placeholder="Nhập Facebook Page ID..."
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button onClick={syncPosts} disabled={syncing} className="bg-blue-600 hover:bg-blue-700 text-white">
          {syncing ? "Đang sync..." : "🔄 Đồng bộ bài viết"}
        </Button>
        {syncMessage && (
          <p className="text-sm text-green-600 font-medium">{syncMessage}</p>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {["never_promoted", "currently_promoted", "was_promoted", "all"].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === status 
                ? "bg-blue-600 text-white" 
                : "bg-white border text-gray-600 hover:bg-gray-50"
            }`}
          >
            {statusLabels[status]}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">📝</p>
          <p className="text-lg font-medium">Không có bài viết</p>
          <p className="text-sm">Đồng bộ từ Facebook Page để xem bài viết</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map(post => (
            <div
              key={post.post_id}
              className={`bg-white border rounded-lg overflow-hidden transition-all hover:shadow-md ${
                selected.has(post.post_id) ? "ring-2 ring-blue-500 border-blue-300" : ""
              }`}
            >
              {post.full_picture && (
                <div className="relative">
                  <img src={post.full_picture} alt="" className="w-full h-40 object-cover" />
                  <div className="absolute top-2 right-2">
                    <input
                      type="checkbox"
                      checked={selected.has(post.post_id)}
                      onChange={() => toggleSelect(post.post_id)}
                      className="w-5 h-5 cursor-pointer"
                    />
                  </div>
                </div>
              )}
              <div className="p-4 space-y-3">
                {!post.full_picture && (
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-gray-400">{new Date(post.created_time).toLocaleDateString("vi-VN")}</span>
                    <input
                      type="checkbox"
                      checked={selected.has(post.post_id)}
                      onChange={() => toggleSelect(post.post_id)}
                      className="w-5 h-5 cursor-pointer"
                    />
                  </div>
                )}
                <p className="text-sm text-gray-700 line-clamp-3">{post.message || "(Không có nội dung)"}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span>👍 {post.likes_count || 0}</span>
                    <span>💬 {post.comments_count || 0}</span>
                    <span>↗️ {post.shares_count || 0}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[post.promotion_status] || ""}`}>
                    {statusLabels[post.promotion_status] || post.promotion_status}
                  </span>
                </div>
                {post.permalink_url && (
                  <a href={post.permalink_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline">
                    Xem bài viết →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
