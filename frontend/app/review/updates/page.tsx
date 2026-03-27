'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, GitPullRequest, RefreshCw } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import { useAuth } from '@/components/AuthProvider'

interface ProposedUpdate {
  id: string
  record_id: string
  source_document_id?: string | null
  new_data_json: Record<string, unknown>
  diff_json: {
    added?: Record<string, unknown>
    removed?: Record<string, unknown>
    changed?: Record<string, { old: unknown; new: unknown }>
    unchanged?: Record<string, unknown>
  }
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at?: string | null
  reviewed_by?: string | null
}

interface PendingUpdatesResponse {
  updates: ProposedUpdate[]
  total: number
  page: number
  pages: number
}

function UpdatesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { session } = useAuth()
  const [data, setData] = useState<PendingUpdatesResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const page = Number(searchParams.get('page') || '1')

  useEffect(() => {
    if (session?.access_token) {
      void fetchUpdates()
    }
  }, [page, session?.access_token])

  const fetchUpdates = async () => {
    setLoading(true)

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      })
      const res = await fetch(`/api/review/updates/pending?${params}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (res.status === 401 || res.status === 404) {
        setData({ updates: [], total: 0, page: 1, pages: 1 })
        return
      }
      if (!res.ok) throw new Error('Fehler beim Laden der Updates')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setData({ updates: [], total: 0, page: 1, pages: 1 })
    } finally {
      setLoading(false)
    }
  }

  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(nextPage))
    router.push(`/review/updates?${params}`)
  }

  const getTitle = (update: ProposedUpdate): string => {
    const rawTitle = update.new_data_json.title
      || update.new_data_json.name
      || update.new_data_json.question
      || update.record_id

    return typeof rawTitle === 'string' ? rawTitle : update.record_id
  }

  const getPreview = (update: ProposedUpdate): string => {
    const rawPreview = update.new_data_json.content
      || update.new_data_json.description
      || update.new_data_json.answer
      || ''

    if (typeof rawPreview !== 'string') return ''
    return rawPreview.slice(0, 140) + (rawPreview.length > 140 ? '...' : '')
  }

  const getChangeSummary = (update: ProposedUpdate): string => {
    const added = Object.keys(update.diff_json.added || {}).length
    const removed = Object.keys(update.diff_json.removed || {}).length
    const changed = Object.keys(update.diff_json.changed || {}).length

    const parts = []
    if (added) parts.push(`${added} neu`)
    if (changed) parts.push(`${changed} geändert`)
    if (removed) parts.push(`${removed} entfernt`)

    return parts.length > 0 ? parts.join(' • ') : 'Keine Feldänderungen erkannt'
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 min-h-full">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 tracking-tight">Updates</h1>
          <p className="text-neutral-500 mt-1 text-sm sm:text-base">
            Vorschläge zur Aktualisierung bestehender Records
          </p>
        </div>
        <button
          onClick={() => void fetchUpdates()}
          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700
                     bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50
                     hover:border-neutral-300 transition-colors w-full sm:w-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="card p-12 text-center">
          <div className="w-10 h-10 border-4 border-neutral-200 border-t-primary-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-neutral-500 mt-4">Lade Updates...</p>
        </div>
      ) : data?.updates.length === 0 ? (
        <div className="card p-12 text-center">
          <GitPullRequest className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <p className="text-neutral-500 font-medium">Aktuell noch keine Updates</p>
          <p className="text-sm text-neutral-400 mt-1">
            Sobald ein neuer Upload einen bereits genehmigten Record aktualisieren würde, erscheint hier ein Änderungsvorschlag.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.updates.map((update) => (
            <Link
              key={update.id}
              href={`/review/updates/${update.id}`}
              className="card card-hover block p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-neutral-100 rounded-lg shrink-0">
                    <GitPullRequest className="w-4 h-4 text-neutral-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-sm sm:text-base font-semibold text-neutral-900 truncate">
                        {getTitle(update)}
                      </h3>
                      <StatusBadge status={update.status} size="sm" />
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-500 mb-2">
                      {getChangeSummary(update)}
                    </p>
                    {getPreview(update) && (
                      <p className="text-sm text-neutral-500 line-clamp-2">
                        {getPreview(update)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-neutral-400">
                      <span>Record: {update.record_id}</span>
                      <span>•</span>
                      <span>{new Date(update.created_at).toLocaleString('de-DE')}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex justify-center items-center gap-1 mt-6 lg:mt-8 flex-wrap">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 sm:px-4 py-2 text-sm font-medium rounded-lg bg-white text-neutral-600
                       border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            Zurück
          </button>
          <span className="px-3 py-2 text-sm text-neutral-600">
            {page} / {data.pages}
          </span>
          <button
            onClick={() => setPage(Math.min(data.pages, page + 1))}
            disabled={page === data.pages}
            className="px-3 sm:px-4 py-2 text-sm font-medium rounded-lg bg-white text-neutral-600
                       border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  )
}

export default function UpdatesPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center"><div className="w-10 h-10 border-4 border-neutral-200 border-t-primary-500 rounded-full animate-spin mx-auto" /></div>}>
      <UpdatesContent />
    </Suspense>
  )
}
