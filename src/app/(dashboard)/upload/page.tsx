'use client'
import { useState, useRef } from 'react'

type UploadType = 'ads' | 'orders'
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

type UploadResult = {
  ok?: boolean
  uploadedFileId?: string
  reportDate?: string
  totalRows?: number
  validCount?: number
  errorCount?: number
  inserted?: number
  preview?: any[]
  columnMapping?: Record<string, string>
  normalize?: any
  error?: string
  detail?: any
}

function Card({ title, type }: { title: string, type: UploadType }) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) { setFile(f); setStatus('idle'); setResult(null); setError(null) }
  }

  const upload = async () => {
    if (!file) return
    setStatus('uploading'); setError(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/upload/${type}`, { method: 'POST', body: fd })
      const j: UploadResult = await r.json().catch(() => ({ error: 'Khong doc duoc phan hoi' }))
      if (!r.ok || j.error) {
        setError(j.error || `HTTP ${r.status}`)
        setStatus('error')
        setResult(j)
      } else {
        setResult(j)
        setStatus('done')
      }
    } catch (e: any) {
      setError(e?.message || String(e))
      setStatus('error')
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${status === 'done' ? 'bg-green-100 text-green-700' : status === 'error' ? 'bg-red-100 text-red-700' : status === 'uploading' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {status === 'done' ? 'Xong' : status === 'error' ? 'Loi' : status === 'uploading' ? 'Dang xu ly' : 'San sang'}
        </span>
      </div>
      <div onDragOver={e => e.preventDefault()} onDrop={onDrop}
        className="border-2 border-dashed rounded p-6 text-center cursor-pointer text-sm text-gray-500"
        onClick={() => inputRef.current?.click()}>
        {file ? (
          <div>
            <div className="text-gray-800">{file.name}</div>
            <div className="text-xs">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
        ) : (
          <div>Keo tha file .xlsx/.csv vao day hoac click de chon</div>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setStatus('idle'); setResult(null); setError(null) } }} />
      </div>
      <button onClick={upload} disabled={!file || status === 'uploading'}
        className="mt-3 w-full py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
        {status === 'uploading' ? 'Dang xu ly...' : 'Upload va xu ly'}
      </button>

      {error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
          {result?.detail && <pre className="text-xs mt-1 overflow-auto max-h-24">{JSON.stringify(result.detail, null, 2)}</pre>}
        </div>
      )}

      {result?.ok && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-gray-50 rounded"><div className="text-xs text-gray-500">Tong dong</div><div className="font-semibold">{result.totalRows ?? 0}</div></div>
            <div className="p-2 bg-green-50 rounded"><div className="text-xs text-gray-500">Hop le</div><div className="font-semibold text-green-700">{result.validCount ?? 0}</div></div>
            <div className="p-2 bg-red-50 rounded"><div className="text-xs text-gray-500">Loi</div><div className="font-semibold text-red-700">{result.errorCount ?? 0}</div></div>
            <div className="p-2 bg-blue-50 rounded"><div className="text-xs text-gray-500">Da luu</div><div className="font-semibold text-blue-700">{result.inserted ?? 0}</div></div>
          </div>
          <div className="text-xs text-gray-500">Ngay bao cao: {result.reportDate ? result.reportDate.substring(0,10) : '-'}</div>
          {result.normalize && (
            <div className="text-xs text-gray-600 p-2 bg-yellow-50 rounded">
              Normalize: {result.normalize.ok === false ? <span className="text-red-600">{result.normalize.error || 'loi'}</span> : 'OK'}
              {result.normalize.summary?.summaryRows != null && <> - Sub summary: {result.normalize.summary.summaryRows}</>}
            </div>
          )}
          {result.preview && result.preview.length > 0 && (
            <details>
              <summary className="cursor-pointer text-blue-600 text-xs">Xem 20 dong dau</summary>
              <pre className="text-[10px] mt-1 max-h-48 overflow-auto bg-gray-50 p-2 rounded">{JSON.stringify(result.preview, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  const [reCalculating, setReCalculating] = useState(false)
  const recalc = async () => {
    setReCalculating(true)
    try {
      const r = await fetch('/api/normalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'all' }) })
      const j = await r.json()
      alert('Tinh lai xong. Sub summary: ' + (j.summary?.summaryRows ?? '?'))
    } catch (e: any) { alert('Loi: ' + (e?.message || String(e))) }
    finally { setReCalculating(false) }
  }
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Upload du lieu</h1>
        <button onClick={recalc} disabled={reCalculating} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50">
          {reCalculating ? 'Dang tinh...' : 'Tinh toan lai'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="File Ads Facebook" type="ads" />
        <Card title="File Don hang Affiliate" type="orders" />
      </div>
      <div className="text-xs text-gray-500">
        Luu y: Vercel gioi han 4.5MB cho moi request. Voi file lon hon, hay tach file truoc khi upload.
      </div>
    </div>
  )
}
