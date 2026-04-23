'use client'
import { useEffect, useState } from 'react'

const SUGGESTION_LABEL: Record<string, { label: string; color: string }> = {
  INCREASE_20: { label: 'Tang 20%', color: 'bg-green-100 text-green-700' },
  DECREASE_20: { label: 'Giam 20%', color: 'bg-yellow-100 text-yellow-700' },
  PAUSE:       { label: 'Tat ads', color: 'bg-red-100 text-red-700' },
  KEEP:        { label: 'Giu nguyen', color: 'bg-blue-100 text-blue-700' },
  NO_ACTION:   { label: 'Khong hanh dong', color: 'bg-gray-100 text-gray-500' },
}

function fmtVND(n: number) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(Math.round(n)) }
function RoiBadge({ roi }: { roi: number }) {
  const color = roi >= 1 ? 'bg-green-100 text-green-700' : roi >= 0.8 ? 'bg-yellow-100 text-yellow-700' : roi > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{roi.toFixed(2)}</span>
}

export default function SubIdPage() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tkAff, setTkAff] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const limit = 50

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit), onlyActive: String(onlyActive) })
    if (tkAff) params.set('tkAff', tkAff)
    const res = await fetch(`/api/dashboard/subids?${params}`)
    const d = await res.json()
    setData(d.data ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [page, tkAff, onlyActive])

  const toggleSelect = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const selectedRows = data.filter(r => selected.has(r.id))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Quan ly Sub ID</h1>
        <span className="text-sm text-gray-500">Tong: {total} sub</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text" placeholder="TK AFF (VKC, ANN...)" value={tkAff}
          onChange={e => { setTkAff(e.target.value); setPage(1) }}
          className="border rounded px-3 py-1.5 text-sm w-40"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyActive} onChange={e => { setOnlyActive(e.target.checked); setPage(1) }} />
          Chi sub con ads ngay moi nhat
        </label>
        {selected.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <span className="text-sm text-gray-500">Da chon {selected.size}</span>
            <button className="px-3 py-1 bg-yellow-500 text-white rounded text-sm">Giam 20%</button>
            <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">Tang 20%</button>
            <button className="px-3 py-1 bg-red-500 text-white rounded text-sm">Tat ads</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 px-3 py-3"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(data.map(r => r.id)) : new Set())} /></th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Sub ID</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">TK AFF</th>
              <th className="px-3 py-3 text-right font-medium text-gray-600">Ads ngay</th>
              <th className="px-3 py-3 text-right font-medium text-gray-600">Don ngay</th>
              <th className="px-3 py-3 text-right font-medium text-gray-600">HH ngay</th>
              <th className="px-3 py-3 text-center font-medium text-gray-600">ROI ngay</th>
              <th className="px-3 py-3 text-right font-medium text-gray-600">Tong ads</th>
              <th className="px-3 py-3 text-right font-medium text-gray-600">Tong HH</th>
              <th className="px-3 py-3 text-center font-medium text-gray-600">ROI tong</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Goi y</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">Dang tai...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">Chua co du lieu. Hay upload file ads va tinh toan lai.</td></tr>
            ) : data.map(row => (
              <tr key={row.id} className={`hover:bg-gray-50 ${selected.has(row.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                <td className="px-3 py-2 font-mono text-xs font-medium">{row.subIdNormalized}</td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{row.tkAff ?? '-'}</span></td>
                <td className="px-3 py-2 text-right">{fmtVND(row.adsSpend)}</td>
                <td className="px-3 py-2 text-right">{row.orderCount}</td>
                <td className="px-3 py-2 text-right text-green-600">{fmtVND(row.totalCommission)}</td>
                <td className="px-3 py-2 text-center"><RoiBadge roi={row.roiDaily} /></td>
                <td className="px-3 py-2 text-right text-gray-500">{fmtVND(row.totalAdsAllTime)}</td>
                <td className="px-3 py-2 text-right text-green-600">{fmtVND(row.totalCommissionAllTime)}</td>
                <td className="px-3 py-2 text-center"><RoiBadge roi={row.roiTotal} /></td>
                <td className="px-3 py-2">
                  {row.actionSuggestion && SUGGESTION_LABEL[row.actionSuggestion] && (
                    <div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SUGGESTION_LABEL[row.actionSuggestion].color}`}>
                        {SUGGESTION_LABEL[row.actionSuggestion].label}
                      </span>
                      {row.actionReason && <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{row.actionReason}</p>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Truoc</button>
          <span className="px-3 py-1 text-sm text-gray-600">Trang {page} / {Math.ceil(total/limit)}</span>
          <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/limit)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Sau</button>
        </div>
      )}
    </div>
  )
}
