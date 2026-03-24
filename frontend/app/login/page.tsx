'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, Lock } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { supabase } = useAuth()
  const code = searchParams.get('code')
  const nextPath = searchParams.get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'auth_callback'
      ? 'Der Login-Link war ungueltig oder abgelaufen. Bitte erneut anfordern.'
      : null
  )

  // Forward auth code to callback route
  useEffect(() => {
    if (!code) return
    const callbackParams = new URLSearchParams(searchParams.toString())
    router.replace(`/auth/callback?${callbackParams.toString()}`)
  }, [code, router, searchParams])

  // Handle hash-based session tokens (from Supabase magic links)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    if (!hash) return

    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (!accessToken || !refreshToken) return

    let active = true

    const finalizeHashSession = async () => {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (!active) return

      if (sessionError) {
        setError('Die Session aus dem Login-Link konnte nicht uebernommen werden.')
        return
      }

      const cleanUrl = `${window.location.pathname}${window.location.search}`
      window.history.replaceState({}, '', cleanUrl)
      router.replace(nextPath)
    }

    void finalizeHashSession()
    return () => { active = false }
  }, [nextPath, router, supabase])

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message === 'Invalid login credentials'
        ? 'E-Mail oder Passwort ist falsch.'
        : signInError.message)
      setSubmitting(false)
      return
    }

    router.replace(nextPath)
  }
  // Show spinner while processing auth code or hash tokens
  if (code) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-accent-100/80 bg-white/95 p-8 shadow-soft">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-200 border-t-accent-500" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-accent-700">
                Anmeldung wird abgeschlossen
              </h1>
              <p className="mt-2 text-sm text-accent-400">
                Die Session wird uebernommen.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-accent-100/80 bg-white/95 p-8 shadow-soft">
        <div className="mb-8">
          <Image
            src="/logo.svg"
            alt="Jokari"
            width={120}
            height={38}
            className="h-8 w-auto"
          />
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary-300 bg-primary-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600">
            Interner Zugang
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-accent-700">
            Zugriff auf den Knowledge Hub
          </h1>
          <p className="mt-2 text-sm text-accent-400">
            Melde dich mit deinem Passwort an.
          </p>
        </div>

        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-accent-600">E-Mail</span>
            <div className="flex items-center gap-3 rounded-2xl border border-accent-100 bg-accent-50/30 px-4 py-3 focus-within:border-accent-500 focus-within:bg-white">
              <Mail className="h-5 w-5 text-accent-300" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@unternehmen.de"
                className="w-full bg-transparent text-sm text-accent-700 outline-none placeholder:text-accent-300"
                required
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-accent-600">Passwort</span>
            <div className="flex items-center gap-3 rounded-2xl border border-accent-100 bg-accent-50/30 px-4 py-3 focus-within:border-accent-500 focus-within:bg-white">
              <Lock className="h-5 w-5 text-accent-300" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort eingeben"
                className="w-full bg-transparent text-sm text-accent-700 outline-none placeholder:text-accent-300"
                required
                autoComplete="current-password"
              />
            </div>
          </label>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_16px_30px_-18px_rgba(36,56,141,0.8)]"
          >
            <span>{submitting ? 'Anmeldung...' : 'Anmelden'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-accent-400">
            Zugaenge werden zentral verwaltet. Bitte an einen Admin wenden.
          </p>
        </div>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-200 border-t-accent-500" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  )
}
