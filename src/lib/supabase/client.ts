import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jbisrrqodxehgyokmuov.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiaXNycnFvZHhlaGd5b2ttdW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDIzOTEsImV4cCI6MjA4ODI3ODM5MX0.r2gtSn_e4cK7vvJaqGO_6TNysXXw6_DdddBcpsVyKGo'

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
