'use client'
import { useEffect, useState } from 'react'

const SUGGESTION_OPTIONS = [
  { value: 'INCREASE_20', label: 'Tăng budget 20%' },
  { value: 'DECREASE_20', label: 'Giảm budget 20%' },
  { value: 'PAUSE', label: 'Tắt ads' },
  { value: 'KEEP', label: 'Giữ nguyên' },
  { value: 'NO_ACTION', label: 'Không hành động' },
]

export default function QuyTacPage() {
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  const loadRules = async () => {
    setLoading(true)
    const res = await fetch('/api/rules')
    const data = await res.json()
    setRules(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { loadRules() }, [])

  const seedDefault = async () => {
    setSeeding(true)
    await fetch('/api/rules', { method: 'PUT' })
    await loadRules()
    setSeeding(false)
  }

  const toggleRule = async (id: string, isActive: boolean) => {
    await fetch(`/api/rules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) })
    setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !isActive } : r))
  }

  const deleteRule = async (id: string) => {
    if (!confirm('Xac nhan xoa quy tac?')) return
    await fetch(`/api/rules/${id}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const SUGG_MAP: Record<string, { label: string; color: string }> = {
    INCREASE_20: { label: 'Tăng 20%', color: 'text-green-600' },
    DECREASE_20: { label: 'Giảm 20%', color: 'text-yellow-600' },
    PAUSE: { label: 'Tắt ads', color: 'text-red-600' },
    KEEP: { label: 'Giữ nguyên', color: 'text-blue-600' },
    NO_ACTION: { label: 'Không hành động', color: 'text-gray-400' },
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Quy tac goi y hanh dong</h1>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <button onClick={seedDefault} disabled={seeding} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {seeding ? 'Dang tao...' : 'Tao quy tac mac dinh'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Dang tai...</div>
      ) : rules.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-700 mb-3">Chua co quy tac nao. Bam "Tao quy tac mac dinh" de bat dau.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-white rounded-lg border p-4 ${!rule.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={() => toggleRule(rule.id, rule.isActive)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{rule.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Hanh dong: <span className={`font-medium ${SUGG_MAP[rule.suggestion]?.color}`}>{SUGG_MAP[rule.suggestion]?.label}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Ly do: {rule.reason}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Uu tien: {rule.priority}</span>
                  <button onClick={() => deleteRule(rule.id)} className="text-red-500 hover:text-red-700 text-sm px-2 py-1">Xoa</button>
                </div>
              </div>
              {rule.conditions && rule.conditions.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs font-medium text-gray-600 mb-1">Dieu kien ({rule.conditionLogic ?? 'AND'}):</p>
                  <div className="flex flex-wrap gap-2">
                    {rule.conditions.map((c: any, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                        {c.field} {c.operator} {c.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
