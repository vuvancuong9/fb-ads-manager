import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function DashboardRootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  redirect("/dashboard/tong-quan")
}
