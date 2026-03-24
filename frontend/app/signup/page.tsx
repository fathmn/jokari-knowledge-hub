'use client'

import { FormEvent, Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Mail, Lock, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react'

function SignUpContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [role, setRole] = useState('admin')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    if (password !== passwordConfirm) {
      setError('Die Passwoerter stimmen nicht ueberein.')
      setSubmitting(false)
      return
    }

    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Fehler beim Erstellen des Accounts.')
        setSubmitting(false)
        return
      }

      setSuccess(true)
    } catch {
      setError('Verbindung zum Backend fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-[2rem] border border-accent-100/80 bg-white/95 p-8 shadow-soft">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-accent-700">
                Account erstellt
              </h1>
              <p className="mt-2 text-sm text-accent-400">
                Du kannst dich jetzt mit deiner E-Mail und deinem Passwort anmelden.
              </p>
            </div>
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-accent-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-600 shadow-[0_16px_30px_-18px_rgba(36,56,141,0.8)]"
            >
              Zur Anmeldung
              <ArrowRight className="h-4 w-4" />
            </Link>
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
            Neuer Account
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-accent-700">
            Account erstellen
          </h1>
          <p className="mt-2 text-sm text-accent-400">
            Erstelle einen neuen Zugang fuer den Knowledge Hub.
            Der Account wird sofort aktiviert (keine Bestaetigungsmail noetig).
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
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
                placeholder="Mindestens 6 Zeichen"
                className="w-full bg-transparent text-sm text-accent-700 outline-none placeholder:text-accent-300"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-accent-600">Passwort wiederholen</span>
            <div className="flex items-center gap-3 rounded-2xl border border-accent-100 bg-accent-50/30 px-4 py-3 focus-within:border-accent-500 focus-within:bg-white">
              <Lock className="h-5 w-5 text-accent-300" />
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Passwort bestaetigen"
                className="w-full bg-transparent text-sm text-accent-700 outline-none placeholder:text-accent-300"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-accent-600">Rolle</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-2xl border border-accent-100 bg-accent-50/30 px-4 py-3 text-sm text-accent-700 outline-none focus:border-accent-500 focus:bg-white"
            >
              <option value="admin">Admin</option>
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
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
            <span>{submitting ? 'Account wird erstellt...' : 'Account erstellen'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-accent-400 transition hover:text-accent-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurueck zur Anmeldung
          </Link>
        </div>
      </div>
    </div>
  )
}

function SignUpFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-200 border-t-accent-500" />
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpFallback />}>
      <SignUpContent />
    </Suspense>
  )
}
