import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jbisrrqodxehgyokmuov.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiaXNycnFvZHhlaGd5b2ttdW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDIzOTEsImV4cCI6MjA4ODI3ODM5MX0.r2gtSn_e4cK7vvJaqGO_6TNysXXw6_DdddBcpsVyKGo'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const url = SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, serviceKey)
}
