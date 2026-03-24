import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    throw new Error('Supabase client configuration is missing')
  }

  return { publishableKey, url }
}

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { publishableKey, url } = getSupabaseConfig()
    browserClient = createBrowserClient(url, publishableKey)
  }

  return browserClient
}
