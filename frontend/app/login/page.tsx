'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, Lock, KeyRound, UserPlus } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

type LoginMode = 'password' | 'magic-link'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { supabase } = useAuth()
  const code = searchParams.get('code')
  const nextPath = searchParams.get('next') ?? '/'
  const [mode, setMode] = useState<LoginMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
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
    setMessage(null)
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

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)

    const redirectTo = new URL('/auth/callback', window.location.origin)
    redirectTo.searchParams.set('next', nextPath)
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo.toString(),
      },
    })

    if (signInError) {
      setError(signInError.message)
      setSubmitting(false)
      return
    }

    setMessage('Der Login-Link wurde versendet. Bitte pruefe dein Postfach.')
    setSubmitting(false)
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
            {mode === 'password'
              ? 'Melde dich mit deinem Passwort an.'
              : 'Anmeldung per Magic Link ueber E-Mail.'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6 flex rounded-xl border border-accent-100 bg-accent-50/30 p-1">
          <button
            type="button"
            onClick={() => { setMode('password'); setError(null); setMessage(null) }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
              mode === 'password'
                ? 'bg-white text-accent-700 shadow-sm'
                : 'text-accent-400 hover:text-accent-600'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            Passwort
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic-link'); setError(null); setMessage(null) }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
              mode === 'magic-link'
                ? 'bg-white text-accent-700 shadow-sm'
                : 'text-accent-400 hover:text-accent-600'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Magic Link
          </button>
        </div>

        {mode === 'password' ? (
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
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
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

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60 shadow-[0_16px_30px_-18px_rgba(36,56,141,0.8)]"
            >
              <span>{submitting ? 'Link wird versendet...' : 'Magic Link senden'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <p className="text-center text-xs text-accent-400">
              Hinweis: Supabase erlaubt ohne eigenen SMTP-Server nur 2 E-Mails pro Stunde.
            </p>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 text-sm text-accent-400 transition hover:text-accent-600"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Neuen Account erstellen
          </Link>
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
