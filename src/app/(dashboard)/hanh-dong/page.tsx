"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"

type SubIDRow = {
  sub_id: string
  sub_id_normalized: string
  tk_aff: string
  ads_ngay: number
  don_ngay: number
  hh_ngay: number
  roi_ngay: number
  action_suggestion: string
  action_reason: string
  ngay_ads: string
}

type JobStatus = "idle" | "dry_run" | "confirming" | "running" | "done"

const actionColors: Record<string, string> = {
  PAUSE: "bg-red-100 text-red-700 border-red-200",
  INCREASE_20: "bg-green-100 text-green-700 border-green-200",
  DECREASE_20: "bg-yellow-100 text-yellow-700 border-yellow-200",
  KEEP: "bg-blue-100 text-blue-700 border-blue-200",
  NO_ACTION: "bg-gray-100 text-gray-600 border-gray-200",
}

const actionLabels: Record<string, string> = {
  PAUSE: "Tạm dừng",
  INCREASE_20: "Tăng 20%",
  DECREASE_20: "Giảm 20%",
  KEEP: "Giữ nguyên",
  NO_ACTION: "Không làm gì",
}

export default function HanhDongPage() {
  const [data, setData] = useState<SubIDRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<JobStatus>("idle")
  const [dryRunResult, setDryRunResult] = useState<any[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [filterAction, setFilterAction] = useState("ALL")
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/subids")
      const json = await res.json()
      setData(json.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filterAction === "ALL" ? data : data.filter(r => r.action_suggestion === filterAction)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(r => r.sub_id_normalized)))
    }
  }

  function selectByAction(action: string) {
    const ids = filtered.filter(r => r.action_suggestion === action).map(r => r.sub_id_normalized)
    setSelected(new Set(ids))
  }

  async function doDryRun() {
    if (selected.size === 0) {
      alert("Vui lòng chọn ít nhất 1 Sub ID")
      return
    }
    setStatus("dry_run")
    setLogs([])
    
    const selectedRows = data.filter(r => selected.has(r.sub_id_normalized))
    const preview = selectedRows.map(r => ({
      sub_id: r.sub_id_normalized,
      action: r.action_suggestion,
      action_label: actionLabels[r.action_suggestion] || r.action_suggestion,
      reason: r.action_reason,
      ads_ngay: r.ads_ngay,
      roi_ngay: r.roi_ngay,
    }))
    
    setDryRunResult(preview)
    setStatus("confirming")
  }

  async function doExecute() {
    setStatus("running")
    const newLogs: string[] = []
    
    try {
      const res = await fetch("/api/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: dryRunResult,
          dry_run: false
        })
      })
      const json = await res.json()
      
      if (json.results) {
        json.results.forEach((r: any) => {
          const icon = r.success ? "✅" : "❌"
          newLogs.push(`${icon} ${r.sub_id}: ${r.message || r.action}`)
        })
      } else {
        newLogs.push("⚠️ " + (json.error || "Không có phản hồi từ server"))
      }
    } catch (e: any) {
      newLogs.push("❌ Lỗi: " + e.message)
    }
    
    setLogs(newLogs)
    setStatus("done")
    setSelected(new Set())
    setDryRunResult([])
    await loadData()
  }

  function reset() {
    setStatus("idle")
    setDryRunResult([])
    setLogs([])
    setSelected(new Set())
  }

  const pauseCount = data.filter(r => r.action_suggestion === "PAUSE").length
  const increaseCount = data.filter(r => r.action_suggestion === "INCREASE_20").length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hành động hàng loạt</h1>
        <p className="text-gray-500 mt-1">Thực thi gợi ý từ rule engine trên Facebook Ads</p>
      </div>

      {/* Warning */}
      {pauseCount > 10 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <span className="text-red-500 text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-700">Cảnh báo: Có {pauseCount} Sub ID cần tạm dừng</p>
            <p className="text-sm text-red-600">Số lượng ads tắt nhiều. Hãy kiểm tra kỹ trước khi thực hiện.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["PAUSE", "DECREASE_20", "KEEP", "INCREASE_20"].map(action => {
          const count = data.filter(r => r.action_suggestion === action).length
          return (
            <button
              key={action}
              onClick={() => { setFilterAction(action === filterAction ? "ALL" : action); selectByAction(action) }}
              className={`p-4 rounded-lg border-2 text-left transition-all ${actionColors[action]} hover:shadow-md`}
            >
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-sm font-medium">{actionLabels[action]}</p>
            </button>
          )
        })}
      </div>

      {/* Dry run result */}
      {status === "confirming" && dryRunResult.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-yellow-800">Xem trước hành động ({dryRunResult.length} Sub ID)</h3>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {dryRunResult.map(r => (
              <div key={r.sub_id} className="flex items-center gap-2 text-sm py-1 border-b border-yellow-100">
                <span className="font-mono text-xs bg-white px-2 py-0.5 rounded">{r.sub_id}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[r.action]}`}>{r.action_label}</span>
                <span className="text-gray-600 text-xs">{r.reason}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={doExecute} className="bg-blue-600 hover:bg-blue-700 text-white">
              ✅ Xác nhận thực hiện
            </Button>
            <Button variant="outline" onClick={reset}>Hủy</Button>
          </div>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Kết quả thực hiện</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {logs.map((log, i) => (
              <p key={i} className="text-sm font-mono text-green-400">{log}</p>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={reset}>Đặt lại</Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-800">
              Danh sách Sub ID ({filtered.length})
            </h2>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="ALL">Tất cả hành động</option>
              {["PAUSE", "DECREASE_20", "KEEP", "INCREASE_20", "NO_ACTION"].map(a => (
                <option key={a} value={a}>{actionLabels[a]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-sm text-blue-600 font-medium">Đã chọn: {selected.size}</span>
            )}
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selected.size === filtered.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </Button>
            <Button 
              onClick={doDryRun}
              disabled={selected.size === 0 || status === "running"}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {status === "running" ? "Đang thực hiện..." : `Xem trước (${selected.size})`}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Không có dữ liệu</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <input type="checkbox" 
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={selectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Sub ID</th>
                  <th className="px-4 py-3 text-left">TK AFF</th>
                  <th className="px-4 py-3 text-right">Ads ngày</th>
                  <th className="px-4 py-3 text-right">Đơn</th>
                  <th className="px-4 py-3 text-right">ROI</th>
                  <th className="px-4 py-3 text-left">Ngày ads</th>
                  <th className="px-4 py-3 text-left">Gợi ý</th>
                  <th className="px-4 py-3 text-left">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(row => (
                  <tr 
                    key={row.sub_id_normalized}
                    className={`hover:bg-gray-50 ${selected.has(row.sub_id_normalized) ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        checked={selected.has(row.sub_id_normalized)}
                        onChange={() => toggleSelect(row.sub_id_normalized)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">{row.sub_id_normalized}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                        {row.tk_aff || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {(row.ads_ngay || 0).toLocaleString("vi-VN")}đ
                    </td>
                    <td className="px-4 py-3 text-right">{row.don_ngay || 0}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      row.roi_ngay >= 1.3 ? "text-green-600" :
                      row.roi_ngay >= 0.8 ? "text-blue-600" :
                      row.roi_ngay >= 0.3 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {row.roi_ngay?.toFixed(2) || "0.00"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{row.ngay_ads || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${actionColors[row.action_suggestion]}`}>
                        {actionLabels[row.action_suggestion] || row.action_suggestion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{row.action_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
