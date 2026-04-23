"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type Connection = {
  id: string
  ad_account_id: string
  page_id: string
  app_id: string
  access_token: string
  token_expiry: string
  is_active: boolean
  name: string
  created_at: string
}

export default function KetNoiPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: "",
    ad_account_id: "",
    page_id: "",
    app_id: "",
    access_token: "",
    token_expiry: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const supabase = createClient()

  useEffect(() => {
    loadConnections()
  }, [])

  async function loadConnections() {
    setLoading(true)
    const { data, error } = await supabase
      .from("facebook_connections")
      .select("*")
      .order("created_at", { ascending: false })
    if (!error) setConnections(data || [])
    setLoading(false)
  }

  async function saveConnection() {
    if (!form.name || !form.ad_account_id || !form.access_token) {
      setError("Vui lòng điền đầy đủ thông tin bắt buộc")
      return
    }
    setSaving(true)
    setError("")
    const { error } = await supabase
      .from("facebook_connections")
      .insert([{ ...form, is_active: true }])
    if (error) {
      setError("Lỗi: " + error.message)
    } else {
      setShowForm(false)
      setForm({ name: "", ad_account_id: "", page_id: "", app_id: "", access_token: "", token_expiry: "" })
      await loadConnections()
    }
    setSaving(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("facebook_connections").update({ is_active: !current }).eq("id", id)
    await loadConnections()
  }

  async function deleteConnection(id: string) {
    if (!confirm("Xóa kết nối này?")) return
    await supabase.from("facebook_connections").delete().eq("id", id)
    await loadConnections()
  }

  function maskToken(token: string) {
    if (!token) return "-"
    return token.substring(0, 10) + "..." + token.substring(token.length - 6)
  }

  function isExpired(expiry: string) {
    if (!expiry) return false
    return new Date(expiry) < new Date()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kết nối Facebook</h1>
          <p className="text-gray-500 mt-1">Quản lý kết nối với Facebook Ads API</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white">
          {showForm ? "Hủy" : "+ Thêm kết nối"}
        </Button>
      </div>

      {/* Security notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <span className="text-blue-500">🔒</span>
        <div className="text-sm">
          <p className="font-semibold text-blue-700">Bảo mật token</p>
          <p className="text-blue-600">Access token được lưu trữ an toàn và chỉ được sử dụng ở backend. Token không bao giờ hiển thị ở frontend.</p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Thêm kết nối mới</h2>
          {error && <p className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên kết nối *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                placeholder="VD: Tài khoản chính"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ad Account ID *</label>
              <input
                type="text"
                value={form.ad_account_id}
                onChange={e => setForm({...form, ad_account_id: e.target.value})}
                placeholder="act_123456789"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Page ID</label>
              <input
                type="text"
                value={form.page_id}
                onChange={e => setForm({...form, page_id: e.target.value})}
                placeholder="123456789"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input
                type="text"
                value={form.app_id}
                onChange={e => setForm({...form, app_id: e.target.value})}
                placeholder="App ID của bạn"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Token *</label>
              <input
                type="password"
                value={form.access_token}
                onChange={e => setForm({...form, access_token: e.target.value})}
                placeholder="EAAxxxxxxxx..."
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày hết hạn token</label>
              <input
                type="datetime-local"
                value={form.token_expiry}
                onChange={e => setForm({...form, token_expiry: e.target.value})}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveConnection} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
              {saving ? "Đang lưu..." : "Lưu kết nối"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          </div>
        </div>
      )}

      {/* Connection list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : connections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🔌</p>
          <p className="text-lg font-medium">Chưa có kết nối nào</p>
          <p className="text-sm">Thêm kết nối Facebook Ads để bắt đầu</p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map(conn => (
            <div key={conn.id} className="bg-white border rounded-lg p-5 flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-800">{conn.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    conn.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {conn.is_active ? "Đang hoạt động" : "Đã tắt"}
                  </span>
                  {isExpired(conn.token_expiry) && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      Token hết hạn
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span><span className="font-medium">Ad Account:</span> {conn.ad_account_id}</span>
                  {conn.page_id && <span><span className="font-medium">Page:</span> {conn.page_id}</span>}
                  {conn.app_id && <span><span className="font-medium">App:</span> {conn.app_id}</span>}
                  <span><span className="font-medium">Token:</span> {maskToken(conn.access_token)}</span>
                  {conn.token_expiry && (
                    <span><span className="font-medium">Hết hạn:</span> {new Date(conn.token_expiry).toLocaleDateString("vi-VN")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(conn.id, conn.is_active)}
                >
                  {conn.is_active ? "Tắt" : "Bật"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => deleteConnection(conn.id)}
                >
                  Xóa
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
