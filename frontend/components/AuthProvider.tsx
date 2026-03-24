'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/utils/supabase/client'

type AuthContextValue = {
  session: Session | null
  signOut: () => Promise<void>
  supabase: SupabaseClient
  user: User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-8 py-10 shadow-sm">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-900">Sitzung wird geladen</p>
          <p className="mt-1 text-sm text-neutral-500">Authentifizierung wird geprüft</p>
        </div>
      </div>
    </div>
  )
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [supabase] = useState(() => getSupabaseBrowserClient())
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const isPublicRoute = pathname === '/login'

  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) {
        return
      }

      setSession(data.session ?? null)
      setLoading(false)

      if (!data.session && !isPublicRoute) {
        router.replace('/login')
      }
    }

    void initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return
      }

      setSession(nextSession)

      if (!nextSession && !isPublicRoute) {
        router.replace('/login')
      }
      if (nextSession && isPublicRoute) {
        router.replace('/')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [isPublicRoute, router, supabase])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      const isApiRequest =
        inputUrl.startsWith('/api/') ||
        inputUrl.startsWith(`${window.location.origin}/api/`)

      if (!isApiRequest) {
        return originalFetch(input, init)
      }

      const headers = new Headers(
        input instanceof Request ? input.headers : undefined
      )
      new Headers(init?.headers).forEach((value, key) => {
        headers.set(key, value)
      })
      if (session?.access_token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
      }

      return originalFetch(input, {
        ...init,
        headers,
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [session?.access_token])

  const value: AuthContextValue = {
    session,
    signOut: async () => {
      await supabase.auth.signOut()
      router.replace('/login')
    },
    supabase,
    user: session?.user ?? null,
  }

  if (!isPublicRoute && (loading || !session)) {
    return <AuthLoadingScreen />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
