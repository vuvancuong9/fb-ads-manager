'use client'
import { useEffect, useState } from 'react'

export default function NhatKyPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 50

  useEffect(() => {
    setLoading(true)
    fetch(`/api/logs?page=${page}&limit=${limit}`)
      .then(r => r.json())
      .then(d => { setLogs(d.data ?? []); setTotal(d.total ?? 0); setLoading(false) })
  }, [page])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Nhat ky hoat dong</h1>
        <span className="text-sm text-gray-500">Tong: {total}</span>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Thoi gian</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Nguoi dung</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Hanh dong</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Doi tuong</th>
              <th className="px-3 py-3 text-left font-medium text-gray-600">Ket qua</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Dang tai...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Chua co nhat ky nao</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                <td className="px-3 py-2 text-xs">{log.user?.name ?? log.userId ?? 'System'}</td>
                <td className="px-3 py-2"><span className="font-mono text-xs bg-gray-100 rounded px-1">{log.action}</span></td>
                <td className="px-3 py-2 text-xs text-gray-600">{log.target}{log.targetId ? ` (${log.targetId.substring(0,8)})` : ''}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${log.result === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {log.result ?? 'unknown'}
                  </span>
                  {log.error && <p className="text-xs text-red-500 mt-0.5">{log.error}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Truoc</button>
          <span className="px-3 py-1 text-sm text-gray-600">Trang {page} / {Math.ceil(total/limit)}</span>
          <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/limit)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Sau</button>
        </div>
      )}
    </div>
  )
}
