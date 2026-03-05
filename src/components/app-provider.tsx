"use client"

import { useEffect, useState } from "react"
import { useAppStore } from "@/lib/store"
import type { Profile, FbAdAccount } from "@/types/database"

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { setProfile, setAccounts } = useAppStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/me")
        const { profile } = await res.json()

        if (profile) {
          setProfile(profile as Profile)
        }

        const accRes = await fetch("/api/user/resources?type=accounts")
        const { data: accounts } = await accRes.json()

        if (accounts) {
          setAccounts(accounts as FbAdAccount[])
        }
      } catch (e) {
        console.error("AppProvider error:", e)
      }

      setLoaded(true)
    }

    loadData()
  }, [setProfile, setAccounts])

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Caricamento...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
