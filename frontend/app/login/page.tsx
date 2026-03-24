'use client'

import { FormEvent, Suspense, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Mail, ArrowRight } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

function LoginContent() {
  const searchParams = useSearchParams()
  const { supabase } = useAuth()
  const nextPath = searchParams.get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'auth_callback'
      ? 'Der Login-Link war ungültig oder abgelaufen. Bitte erneut anfordern.'
      : null
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <Image
            src="/logo.svg"
            alt="Jokari"
            width={120}
            height={38}
            className="h-8 w-auto"
          />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-neutral-900">
            Zugriff auf den Knowledge Hub
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Anmeldung per Magic Link ueber Supabase Auth.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-700">E-Mail</span>
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 focus-within:border-neutral-900">
              <Mail className="h-5 w-5 text-neutral-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@unternehmen.de"
                className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                required
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{submitting ? 'Link wird versendet' : 'Magic Link senden'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
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
