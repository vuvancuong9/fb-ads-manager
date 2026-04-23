import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import LoginForm from "./login-form"

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect("/dashboard/tong-quan")
  return <LoginForm />
}
