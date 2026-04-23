'use client'
import { useState, useRef } from 'react'

type UploadType = 'ads' | 'orders'
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface UploadResult {
  success: boolean; totalRows: number; savedRows: number; errorCount: number
  preview: any[]; columnMapping: Record<string, string>; error?: string; uploadedFileId?: string
}

export default function UploadPage() {
  const [adsFile, setAdsFile] = useState<File | null>(null)
  const [ordersFile, setOrdersFile] = useState<File | null>(null)
  const [adsStatus, setAdsStatus] = useState<UploadStatus>('idle')
  const [ordersStatus, setOrdersStatus] = useState<UploadStatus>('idle')
  const [adsResult, setAdsResult] = useState<UploadResult | null>(null)
  const [ordersResult, setOrdersResult] = useState<UploadResult | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const adsRef = useRef<HTMLInputElement>(null)
  const ordersRef = useRef<HTMLInputElement>(null)

  const upload = async (type: UploadType) => {
    const file = type === 'ads' ? adsFile : ordersFile
    if (!file) return
    const setStatus = type === 'ads' ? setAdsStatus : setOrdersStatus
    const setResult = type === 'ads' ? setAdsResult : setOrdersResult
    setStatus('uploading')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/upload/${type}`, { method: 'POST', body: fd })
      const data = await res.json()
      setResult(data)
      setStatus(data.success ? 'done' : 'error')
    } catch (e: any) {
      setResult({ success: false, error: e.message, totalRows: 0, savedRows: 0, errorCount: 0, preview: [], columnMapping: {} })
      setStatus('error')
    }
  }

  const rebuild = async () => {
    setRebuilding(true)
    await fetch('/api/engine/rebuild', { method: 'POST' })
    setRebuilding(false)
    alert('Da tinh toan lai thanh cong!')
  }

  const StatusBadge = ({ status }: { status: UploadStatus }) => {
    const map = { idle: '', uploading: 'bg-yellow-100 text-yellow-700', done: 'bg-green-100 text-green-700', error: 'bg-red-100 text-red-700' }
    const txt = { idle: '', uploading: 'Dang tai len...', done: 'Thanh cong', error: 'Loi' }
    if (!txt[status]) return null
    return <span className={`px-2 py-1 rounded text-xs font-medium ${map[status]}`}>{txt[status]}</span>
  }

  const UploadBox = ({ type, label, file, setFile, status, result, inputRef }:
    { type: UploadType; label: string; file: File | null; setFile: (f: File | null) => void; status: UploadStatus; result: UploadResult | null; inputRef: any }) => (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{label}</h2>
        <StatusBadge status={status} />
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div>
            <p className="font-medium text-gray-900">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500">Keo tha hoac click de chon file</p>
            <p className="text-xs text-gray-400 mt-1">Ho tro: .xlsx, .xls, .csv</p>
          </div>
        )}
      </div>

      <button
        onClick={() => upload(type)}
        disabled={!file || status === 'uploading'}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
      >
        {status === 'uploading' ? 'Dang xu ly...' : 'Upload va xu ly'}
      </button>

      {result && (
        <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {result.success ? (
            <div className="space-y-2">
              <p className="font-medium text-green-800">Upload thanh cong</p>
              <div className="text-sm text-green-700 space-y-1">
                <p>Tong dong: {result.totalRows} | Da luu: {result.savedRows} | Loi: {result.errorCount}</p>
              </div>
              {result.preview && result.preview.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-800 mt-3 mb-2">Xem truoc 20 dong dau:</p>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-green-100">
                          {Object.keys(result.preview[0]).filter(k => !['rawData','parseErrors'].includes(k)).map(k => (
                            <th key={k} className="px-2 py-1 text-left">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.preview.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-t border-green-100">
                            {Object.entries(row).filter(([k]) => !['rawData','parseErrors'].includes(k)).map(([k, v]) => (
                              <td key={k} className="px-2 py-1">{String(v ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-red-700">{result.error}</p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Upload du lieu</h1>
        <button
          onClick={rebuild}
          disabled={rebuilding}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-purple-700"
        >
          {rebuilding ? 'Dang tinh toan...' : 'Tinh toan lai'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UploadBox type="ads" label="File Ads Facebook" file={adsFile} setFile={setAdsFile} status={adsStatus} result={adsResult} inputRef={adsRef} />
        <UploadBox type="orders" label="File Don hang Affiliate" file={ordersFile} setFile={setOrdersFile} status={ordersStatus} result={ordersResult} inputRef={ordersRef} />
      </div>
    </div>
  )
}
