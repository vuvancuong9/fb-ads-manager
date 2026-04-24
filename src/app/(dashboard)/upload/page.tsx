'use client'
import { useState, useRef } from 'react'

type UploadType = 'ads' | 'orders'
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error' | 'duplicate'

type DuplicateInfo = {
  uploadedFileId: string
  existingStatus: string
  existingCreatedAt: string
}

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

function Card({ title, type }: { title: string; type: UploadType }) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) { setFile(f); setStatus('idle'); setResult(null); setError(null); setDuplicate(null) }
  }

  const doUpload = async (forceReplace = false) => {
    if (!file) return
    setStatus('uploading'); setError(null); setResult(null); setDuplicate(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (forceReplace) fd.append('forceReplace', 'true')

      const r = await fetch(`/api/upload/${type}`, { method: 'POST', body: fd })
      const j: any = await r.json().catch(() => ({ error: 'Khong doc duoc phan hoi' }))

      if (r.status === 409 && j.code === 'DUPLICATE_FILE') {
        setStatus('duplicate')
        setDuplicate({
          uploadedFileId: j.uploadedFileId,
          existingStatus: j.existingStatus,
          existingCreatedAt: j.existingCreatedAt,
        })
        setError(j.message || 'File nay da duoc upload truoc do')
        return
      }

      if (!r.ok || j.error) {
        setError(j.message || j.error || `HTTP ${r.status}`)
        setStatus('error')
        return
      }

      setResult(j)
      setStatus('done')
    } catch (e: any) {
      setError(e?.message || String(e))
      setStatus('error')
    }
  }

  const upload = () => doUpload(false)
  const forceUpload = () => doUpload(true)

  const reset = () => {
    setFile(null); setStatus('idle'); setResult(null); setError(null); setDuplicate(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        {(file || status !== 'idle') && (
          <button onClick={reset} className="text-xs text-gray-400 hover:text-red-500 border px-2 py-0.5 rounded">
            Xong
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded p-6 text-center text-sm text-gray-500 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
      >
        {file ? (
          <div>
            <div className="font-medium text-gray-700">{file.name}</div>
            <div className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
        ) : (
          'Keo tha file .xlsx/.csv vao day hoac click de chon'
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { setFile(f); setStatus('idle'); setResult(null); setError(null); setDuplicate(null) }
          }}
        />
      </div>

      {/* Upload button */}
      <button
        onClick={upload}
        disabled={!file || status === 'uploading'}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded font-medium text-sm transition"
      >
        {status === 'uploading' ? 'Dang xu ly...' : 'Upload va xu ly'}
      </button>

      {/* DUPLICATE: hien thi thong bao + nut ghi de */}
      {status === 'duplicate' && duplicate && (
        <div className="mt-1 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm">
          <div className="font-semibold text-yellow-800 mb-1">File nay da upload roi</div>
          <div className="text-xs text-yellow-700 mb-2">
            Trang thai: <span className="font-medium">{duplicate.existingStatus}</span>
            {duplicate.existingCreatedAt && (
              <span className="ml-2 text-gray-500">
                · {new Date(duplicate.existingCreatedAt).toLocaleString('vi-VN')}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={forceUpload}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-1.5 rounded text-xs font-medium transition"
            >
              Upload lai / Ghi de
            </button>
            <button
              onClick={reset}
              className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-1.5 rounded text-xs transition"
            >
              Huy
            </button>
          </div>
        </div>
      )}

      {/* Error (non-duplicate) */}
      {status === 'error' && error && (
        <div className="mt-1 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
          {result?.detail && (
            <pre className="text-xs mt-1 overflow-auto max-h-24">{JSON.stringify(result.detail, null, 2)}</pre>
          )}
        </div>
      )}

      {/* Success result */}
      {status === 'done' && result?.ok && (
        <div className="mt-1 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Tong dong</div>
              <div className="font-semibold">{result.totalRows ?? 0}</div>
            </div>
            <div className="p-2 bg-green-50 rounded">
              <div className="text-xs text-gray-500">Hop le</div>
              <div className="font-semibold text-green-700">{result.validCount ?? 0}</div>
            </div>
            <div className="p-2 bg-red-50 rounded">
              <div className="text-xs text-gray-500">Loi</div>
              <div className="font-semibold text-red-600">{result.errorCount ?? 0}</div>
            </div>
            <div className="p-2 bg-blue-50 rounded">
              <div className="text-xs text-gray-500">Da luu</div>
              <div className="font-semibold text-blue-700">{result.inserted ?? 0}</div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Ngay bao cao: {result.reportDate ? result.reportDate.substring(0, 10) : '-'}
          </div>

          {result.normalize && (
            <div className="text-xs p-2 bg-yellow-50 rounded">
              Normalize:{' '}
              {result.normalize.ok === false ? (
                <span className="text-red-600">{result.normalize.error || 'Loi'}</span>
              ) : (
                'OK'
              )}
              {result.normalize.summary?.summaryRows != null && (
                <> · Sub summary: {result.normalize.summary.summaryRows}</>
              )}
            </div>
          )}

          {result.preview && result.preview.length > 0 && (
            <details>
              <summary className="cursor-pointer text-blue-600 text-xs">Xem {result.preview.length} dong dau</summary>
              <pre className="text-[10px] mt-1 max-h-48 overflow-auto bg-gray-50 p-2 rounded">
                {JSON.stringify(result.preview, null, 2)}
              </pre>
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Upload du lieu</h1>
        <button
          onClick={recalc}
          disabled={reCalculating}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm px-4 py-2 rounded font-medium transition"
        >
          {reCalculating ? 'Dang tinh...' : 'Tinh toan lai'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="File Ads Facebook" type="ads" />
        <Card title="File Don hang Affiliate" type="orders" />
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Luu y: Vercel gioi han 4.5MB cho moi request. Voi file lon hon, hay tach file truoc khi upload.
      </p>
    </div>
  )
}
