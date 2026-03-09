"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Key, Eye, EyeOff, CheckCircle2, Bot } from "lucide-react"

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    anthropic_api_key: "",
    openai_api_key: "",
    preferred_model: "claude",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showClaude, setShowClaude] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)

  useEffect(() => {
    fetch("/api/user/settings")
      .then(r => r.json())
      .then(d => {
        if (d.settings) setSettings({
          anthropic_api_key: d.settings.anthropic_api_key || "",
          openai_api_key: d.settings.openai_api_key || "",
          preferred_model: d.settings.preferred_model || "claude",
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (json.success) setSaved(true)
    } catch { /* ignore */ }
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const maskKey = (key: string) => {
    if (!key || key.length < 10) return key
    return key.slice(0, 7) + "..." + key.slice(-4)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Impostazioni</h1>
        <p className="text-gray-500">Caricamento...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Impostazioni</h1>
        <p className="text-gray-500 mt-1">Configura le tue API key per l&apos;AI Assistant</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot size={20} />
            AI Assistant — Configurazione Modello
          </CardTitle>
          <p className="text-sm text-gray-500">
            Inserisci le tue API key per abilitare l&apos;AI Assistant. Puoi usare Claude (Anthropic), GPT (OpenAI) o entrambi.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Modello Preferito</label>
            <Select value={settings.preferred_model} onValueChange={v => setSettings({ ...settings, preferred_model: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">Claude (Anthropic) — Consigliato</SelectItem>
                <SelectItem value="openai">GPT-4o (OpenAI)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400 mt-1">Se il modello preferito non ha una chiave, verrà usato l&apos;altro automaticamente</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <Key size={14} />
              Anthropic API Key (Claude)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showClaude ? "text" : "password"}
                  value={settings.anthropic_api_key}
                  onChange={e => setSettings({ ...settings, anthropic_api_key: e.target.value })}
                  placeholder="sk-ant-api03-..."
                />
                <button
                  type="button"
                  onClick={() => setShowClaude(!showClaude)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showClaude ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Ottienila su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">console.anthropic.com</a>
            </p>
            {settings.anthropic_api_key && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> Chiave configurata: {maskKey(settings.anthropic_api_key)}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <Key size={14} />
              OpenAI API Key (GPT-4o)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showOpenai ? "text" : "password"}
                  value={settings.openai_api_key}
                  onChange={e => setSettings({ ...settings, openai_api_key: e.target.value })}
                  placeholder="sk-proj-..."
                />
                <button
                  type="button"
                  onClick={() => setShowOpenai(!showOpenai)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOpenai ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Ottienila su <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">platform.openai.com</a>
            </p>
            {settings.openai_api_key && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> Chiave configurata: {maskKey(settings.openai_api_key)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save size={16} />
              {saving ? "Salvataggio..." : "Salva Impostazioni"}
            </Button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 size={16} /> Salvato!
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
