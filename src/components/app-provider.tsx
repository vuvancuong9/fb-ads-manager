"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAppStore } from "@/lib/store"
import type { Profile, FbAdAccount } from "@/types/database"

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { setProfile, setAccounts } = useAppStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function loadData() {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) console.error("Auth error:", userError)
      if (!user) {
        setLoaded(true)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) console.error("Profile error:", profileError)
      console.log("Profile loaded:", profile)

      if (profile) {
        setProfile(profile as Profile)
      }

      const { data: accounts } = await supabase
        .from("fb_ad_accounts")
        .select("*")
        .order("name")

      if (accounts) {
        setAccounts(accounts as FbAdAccount[])
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
