'use client'
import { useEffect, useState, useMemo } from 'react'

type Row = {
  sub_id: string
  tk_aff: string | null
  ads_day: number
  orders_day: number
  commission_day: number
  roi_day: number
  total_ads: number
  total_orders: number
  total_commission: number
  roi_total: number
  latest_ads_presence: boolean
  action_suggestion: string
  action_reason: string
}

const SUG_LABEL: Record<string, { text: string, color: string }> = {
  PAUSE: { text: 'Tat', color: 'bg-red-100 text-red-700' },
  REDUCE_20: { text: 'Giam 20%', color: 'bg-orange-100 text-orange-700' },
  KEEP: { text: 'Giu nguyen', color: 'bg-gray-100 text-gray-700' },
  INCREASE_20: { text: 'Tang 20%', color: 'bg-green-100 text-green-700' },
}

function fmt(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return '0'
  return Number(n).toLocaleString('vi-VN')
}

export default function SubIdPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [tkAff, setTkAff] = useState<string>('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const params = new URLSearchParams()
      if (tkAff) params.set('tkAff', tkAff)
      if (onlyActive) params.set('onlyActive', 'true')
      params.set('limit', '500')
      const r = await fetch('/api/dashboard/subids?' + params.toString(), { cache: 'no-store' })
      const j = await r.json()
      if (j.error) setErr(j.error)
      setRows(j.data || [])
      setLatestDate(j.latestDate || null)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tkAff, onlyActive])

  const filtered = useMemo(() => {
    if (!search) return rows
    const s = search.toLowerCase()
    return rows.filter(r => (r.sub_id || '').toLowerCase().includes(s) || (r.tk_aff || '').toLowerCase().includes(s))
  }, [rows, search])

  const tkOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.tk_aff) set.add(r.tk_aff)
    return Array.from(set).sort()
  }, [rows])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Quan ly Sub ID</h1>
          <p className="text-sm text-gray-500">Ngay moi nhat: {latestDate ? latestDate.substring(0,10) : 'chua co du lieu'} - Tong: {filtered.length} sub</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tim Sub ID/TK..." className="px-3 py-1.5 text-sm border rounded" />
          <select value={tkAff} onChange={e => setTkAff(e.target.value)} className="px-3 py-1.5 text-sm border rounded">
            <option value="">Tat ca TK AFF</option>
            {tkOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="text-sm flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />
            Chi sub con chay ads
          </label>
          <button onClick={load} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">Tai lai</button>
        </div>
      </div>

      {err && <div className="p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">{err}</div>}

      <div className="border rounded overflow-x-auto bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">Sub ID</th>
              <th className="px-3 py-2 text-left">TK AFF</th>
              <th className="px-3 py-2 text-right">Ads ngay</th>
              <th className="px-3 py-2 text-right">Don ngay</th>
              <th className="px-3 py-2 text-right">HH ngay</th>
              <th className="px-3 py-2 text-right">ROI ngay</th>
              <th className="px-3 py-2 text-right">Tong ads</th>
              <th className="px-3 py-2 text-right">Tong don</th>
              <th className="px-3 py-2 text-right">Tong HH</th>
              <th className="px-3 py-2 text-right">ROI tong</th>
              <th className="px-3 py-2 text-center">Ads moi nhat</th>
              <th className="px-3 py-2 text-left">Goi y</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="px-3 py-8 text-center text-gray-500">Dang tai...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-gray-500">Chua co du lieu. Hay upload file Ads va Don hang truoc.</td></tr>}
            {!loading && filtered.map((r, i) => {
              const sug = SUG_LABEL[r.action_suggestion] || SUG_LABEL.KEEP
              return (
                <tr key={r.sub_id + '_' + i} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono">{r.sub_id || '(rong)'}</td>
                  <td className="px-3 py-2">{r.tk_aff || '-'}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.ads_day)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.orders_day)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.commission_day)}</td>
                  <td className={`px-3 py-2 text-right ${r.roi_day >= 1 ? 'text-green-600' : 'text-red-600'}`}>{r.roi_day.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.total_ads)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.total_orders)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.total_commission)}</td>
                  <td className={`px-3 py-2 text-right ${r.roi_total >= 1 ? 'text-green-600' : 'text-red-600'}`}>{r.roi_total.toFixed(2)}</td>
                  <td className="px-3 py-2 text-center">{r.latest_ads_presence ? <span className="text-green-600">co</span> : <span className="text-gray-400">khong</span>}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${sug.color}`}>{sug.text}</span>
                    <div className="text-xs text-gray-500 mt-0.5">{r.action_reason}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
