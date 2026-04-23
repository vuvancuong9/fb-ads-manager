'use client'
import { useEffect, useState } from 'react'

interface OverviewData {
  adsToday: number; ordersToday: number; commissionToday: number; roiToday: number
  totalAds: number; totalOrders: number; totalCommission: number; roiTotal: number
  activeSubCount: number; profitSubCount: number; lossSubCount: number; latestDate: string | null
}

function fmt(n: number) { return n.toLocaleString('vi-VN') }
function fmtK(n: number) { return n >= 1000000 ? (n/1000000).toFixed(1) + 'M' : n >= 1000 ? (n/1000).toFixed(0) + 'K' : String(n) }

function StatCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4 shadow-sm">
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function TongQuanPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/overview').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400">Dang tai...</div></div>

  const d = data!
  const roiColor = (roi: number) => roi >= 1 ? 'text-green-600' : roi >= 0.8 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Tong quan</h1>
        {d?.latestDate && (
          <span className="text-sm text-gray-500">Du lieu den: {new Date(d.latestDate).toLocaleDateString('vi-VN')}</span>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3 uppercase tracking-wide">Hom nay</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Chi phi Ads" value={fmtK(d?.adsToday ?? 0)} sub="VND" />
          <StatCard title="Don hang" value={fmt(d?.ordersToday ?? 0)} sub="don" />
          <StatCard title="Hoa hong" value={fmtK(d?.commissionToday ?? 0)} sub="VND" color="text-green-600" />
          <StatCard title="ROI" value={(d?.roiToday ?? 0).toFixed(2)} color={roiColor(d?.roiToday ?? 0)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3 uppercase tracking-wide">Luy ke</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Tong chi phi" value={fmtK(d?.totalAds ?? 0)} sub="VND" />
          <StatCard title="Tong don" value={fmt(d?.totalOrders ?? 0)} sub="don" />
          <StatCard title="Tong hoa hong" value={fmtK(d?.totalCommission ?? 0)} sub="VND" color="text-green-600" />
          <StatCard title="ROI tong" value={(d?.roiTotal ?? 0).toFixed(2)} color={roiColor(d?.roiTotal ?? 0)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3 uppercase tracking-wide">Sub ID</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard title="Sub dang chay" value={fmt(d?.activeSubCount ?? 0)} />
          <StatCard title="Sub co loi" value={fmt(d?.profitSubCount ?? 0)} color="text-green-600" />
          <StatCard title="Sub lo" value={fmt(d?.lossSubCount ?? 0)} color="text-red-600" />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Huong dan nhanh</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Upload file Ads tai trang Upload du lieu</li>
          <li>Upload file Don hang affiliate</li>
          <li>Bam "Tinh toan lai" de cap nhat dashboard</li>
          <li>Vao Sub ID de xem goi y hanh dong</li>
        </ol>
      </div>
    </div>
  )
}
