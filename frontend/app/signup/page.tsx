'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

function SignUpContent() {
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
            Registrierung deaktiviert
          </h1>
          <p className="mt-2 text-sm text-accent-400">
            Neue Zugaenge werden nicht direkt ueber die App erstellt.
            Bitte einen Admin kontaktieren, damit dein Supabase-Account zentral eingerichtet wird.
          </p>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Account-Erstellung ist nur durch Administratoren erlaubt.</p>
              <p className="mt-1 text-amber-800">
                Dadurch vermeiden wir offene Registrierungen und behalten Rollen und Berechtigungen unter Kontrolle.
              </p>
            </div>
          </div>
        </div>

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
