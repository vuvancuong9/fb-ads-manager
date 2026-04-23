'use client'
import { useEffect, useMemo, useState } from 'react'

type Row = {
  sub_id: string
  tk_aff: string | null
  ads_day: number
  orders_day: number
  commission_day: number
  roi_day: number
  total_ads: number
  roi_total: number
  latest_ads_presence: boolean
  action_suggestion: string
  action_reason: string
}

type DryItem = {
  sub_id: string
  tk_aff: string | null
  ads_day: number
  orders_day: number
  roi_day: number
  target_campaigns: number
  campaigns: { campaign_id: string | null, campaign_name: string | null, ads_count: number, spend: number }[]
  proposed: { action: string, label: string, delta?: string }
  warning: string | null
}

const ACTIONS = [
  { key: 'pause', label: 'Tat ads', color: 'bg-red-600' },
  { key: 'resume', label: 'Bat lai', color: 'bg-blue-600' },
  { key: 'increase_budget', label: 'Tang ngan sach 20%', color: 'bg-green-600' },
  { key: 'decrease_budget', label: 'Giam ngan sach 20%', color: 'bg-orange-600' },
] as const

function fmt(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return '0'
  return Number(n).toLocaleString('vi-VN')
}

export default function HanhDongPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dryRun, setDryRun] = useState<any | null>(null)
  const [dryLoading, setDryLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [percent, setPercent] = useState(20)
  const [showOnlyActive, setShowOnlyActive] = useState(true)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const params = new URLSearchParams()
      if (showOnlyActive) params.set('onlyActive', 'true')
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
  useEffect(() => { load() }, [showOnlyActive])

  const toggle = (sub: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(sub)) n.delete(sub); else n.add(sub)
      return n
    })
  }
  const toggleAll = () => {
    setSelected(prev => {
      if (prev.size === rows.length) return new Set()
      return new Set(rows.map(r => r.sub_id))
    })
  }
  const selectBySuggestion = (sug: string) => {
    setSelected(new Set(rows.filter(r => r.action_suggestion === sug).map(r => r.sub_id)))
  }

  const runDry = async (action: string) => {
    setDryLoading(true); setErr(null); setDryRun(null)
    try {
      const r = await fetch('/api/bulk/dry-run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, subIds: Array.from(selected), percent }),
      })
      const j = await r.json()
      if (!j.ok) setErr(j.error || 'Loi dry-run')
      setDryRun(j)
    } catch (e: any) { setErr(e?.message || String(e)) }
    finally { setDryLoading(false) }
  }

  const execute = async () => {
    if (!dryRun?.ok) return
    setExecuting(true); setErr(null)
    try {
      const r = await fetch('/api/bulk/execute', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: dryRun.action, subIds: Array.from(selected), percent: dryRun.percent }),
      })
      const j = await r.json()
      if (!j.ok) setErr(j.error || 'Loi execute')
      else {
        alert('Da gui job: ' + (j.bulkJobId || '(khong co bulk_jobs)') + '. Items: ' + j.total_items)
        setDryRun(null); setSelected(new Set())
      }
    } catch (e: any) { setErr(e?.message || String(e)) }
    finally { setExecuting(false) }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Hanh dong loat</h1>
          <p className="text-sm text-gray-500">Ngay: {latestDate ? latestDate.substring(0,10) : 'chua co du lieu'} - Da chon: {selected.size}/{rows.length}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} /> Chi sub con ads</label>
          <span>%:</span>
          <input type="number" value={percent} min={5} max={90} onChange={e => setPercent(Number(e.target.value)||20)} className="w-16 px-2 py-1 border rounded" />
          <button onClick={load} className="px-3 py-1 bg-gray-200 rounded">Tai lai</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => selectBySuggestion('PAUSE')} className="px-3 py-1 bg-red-100 text-red-700 rounded">Chon goi y TAT</button>
        <button onClick={() => selectBySuggestion('REDUCE_20')} className="px-3 py-1 bg-orange-100 text-orange-700 rounded">Chon goi y GIAM</button>
        <button onClick={() => selectBySuggestion('INCREASE_20')} className="px-3 py-1 bg-green-100 text-green-700 rounded">Chon goi y TANG</button>
        <button onClick={() => setSelected(new Set())} className="px-3 py-1 bg-gray-100 rounded">Bo chon</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(a => (
          <button key={a.key} disabled={selected.size === 0 || dryLoading}
            onClick={() => runDry(a.key)}
            className={`px-4 py-2 text-white text-sm rounded ${a.color} disabled:opacity-50`}>
            Dry-run: {a.label}
          </button>
        ))}
      </div>

      {err && <div className="p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">{err}</div>}

      {dryRun?.ok && (
        <div className="border rounded bg-yellow-50 p-4 space-y-2">
          <div className="font-medium">Preview {dryRun.action_label} - {dryRun.total_subs} sub - {dryRun.total_campaigns} campaign</div>
          <div className="text-xs text-gray-600">{dryRun.note}</div>
          <div className="max-h-64 overflow-auto border rounded bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="px-2 py-1 text-left">Sub</th><th className="px-2 py-1 text-left">TK</th>
                <th className="px-2 py-1 text-right">Ads</th><th className="px-2 py-1 text-right">Don</th>
                <th className="px-2 py-1 text-right">ROI</th><th className="px-2 py-1 text-right">Camp</th>
                <th className="px-2 py-1 text-left">Hanh dong</th>
              </tr></thead>
              <tbody>
                {(dryRun.items as DryItem[]).map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1 font-mono">{it.sub_id}</td>
                    <td className="px-2 py-1">{it.tk_aff || '-'}</td>
                    <td className="px-2 py-1 text-right">{fmt(it.ads_day)}</td>
                    <td className="px-2 py-1 text-right">{it.orders_day}</td>
                    <td className="px-2 py-1 text-right">{it.roi_day.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{it.target_campaigns}</td>
                    <td className="px-2 py-1">{it.proposed.label}{it.proposed.delta ? ' '+it.proposed.delta : ''} {it.warning && <span className="text-red-600">- {it.warning}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={execute} disabled={executing} className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-50">{executing ? 'Dang chay...' : 'Xac nhan chay that'}</button>
            <button onClick={() => setDryRun(null)} className="px-4 py-2 bg-gray-200 text-sm rounded">Huy</button>
          </div>
        </div>
      )}

      <div className="border rounded overflow-x-auto bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} /></th>
              <th className="px-3 py-2 text-left">Sub ID</th>
              <th className="px-3 py-2 text-left">TK AFF</th>
              <th className="px-3 py-2 text-right">Ads ngay</th>
              <th className="px-3 py-2 text-right">Don ngay</th>
              <th className="px-3 py-2 text-right">HH ngay</th>
              <th className="px-3 py-2 text-right">ROI ngay</th>
              <th className="px-3 py-2 text-right">ROI tong</th>
              <th className="px-3 py-2 text-left">Goi y</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Dang tai...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Chua co du lieu sub.</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.sub_id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.sub_id)} onChange={() => toggle(r.sub_id)} /></td>
                <td className="px-3 py-2 font-mono">{r.sub_id || '(rong)'}</td>
                <td className="px-3 py-2">{r.tk_aff || '-'}</td>
                <td className="px-3 py-2 text-right">{fmt(r.ads_day)}</td>
                <td className="px-3 py-2 text-right">{r.orders_day}</td>
                <td className="px-3 py-2 text-right">{fmt(r.commission_day)}</td>
                <td className={`px-3 py-2 text-right ${r.roi_day >= 1 ? 'text-green-600' : 'text-red-600'}`}>{r.roi_day.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right ${r.roi_total >= 1 ? 'text-green-600' : 'text-red-600'}`}>{r.roi_total.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{r.action_suggestion}</span>
                  <div className="text-xs text-gray-500">{r.action_reason}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
