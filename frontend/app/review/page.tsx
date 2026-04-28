'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, RefreshCw, Package, FileText } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import { SCHEMA_COVERAGE_LABEL, formatSchemaCoverage } from '@/lib/schemaCoverage'
import { displayExcerpt, getSourceMetadata, sourceBadgeClass, type SourceMetadata } from '@/lib/recordSource'

interface RecordData {
  id: string
  department: string
  schema_type: string
  primary_key: string
  data_json: {
    title?: string
    name?: string
    question?: string
    artnr?: string
    description?: string
    [key: string]: any
  }
  completeness_score: number
  status: string
  created_at: string
  document_id?: string | null
  source_metadata?: SourceMetadata | null
}

interface RecordListResponse {
  records: RecordData[]
  total: number
  page: number
  pages: number
}

function ReviewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<RecordListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const page = Number(searchParams.get('page') || '1')
  const statusFilter = searchParams.get('status') || ''
  const departmentFilter = searchParams.get('department') || ''

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value); else params.delete(key)
    }
    router.push(`/review?${params}`)
  }

  const setPage = (p: number) => updateParams({ page: String(p) })
  const setStatusFilter = (s: string) => updateParams({ status: s, page: '1' })
  const setDepartmentFilter = (d: string) => updateParams({ department: d, page: '1' })

  useEffect(() => {
    fetchRecords()
  }, [page, statusFilter, departmentFilter])

  const fetchRecords = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20'
      })
      if (statusFilter) params.append('status', statusFilter)
      if (departmentFilter) params.append('department', departmentFilter)

      const res = await fetch(`/api/review?${params}`)
      if (!res.ok) throw new Error('Fehler beim Laden der Records')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  const departmentLabels: { [key: string]: string } = {
    sales: 'Vertrieb',
    support: 'Support',
    marketing: 'Marketing',
    product: 'Produkt',
    legal: 'Recht'
  }

  const schemaLabels: { [key: string]: string } = {
    TrainingModule: 'Schulungsmodul',
    ProductSpec: 'Produktspezifikation',
    FAQ: 'FAQ',
    Objection: 'Einwand',
    TroubleshootingGuide: 'Fehlerbehebung',
    HowToSteps: 'Anleitung',
    Persona: 'Persona',
    PitchScript: 'Pitch-Skript',
    EmailTemplate: 'E-Mail-Vorlage',
    CompatibilityMatrix: 'Kompatibilitätsmatrix',
    SafetyNotes: 'Sicherheitshinweise',
    MessagingPillars: 'Messaging-Pfeiler',
    ContentGuidelines: 'Content-Richtlinien',
    ComplianceNotes: 'Compliance-Hinweise',
    ClaimsDoDont: 'Werbeaussagen Do/Dont',
  }

  const getDisplayTitle = (record: RecordData): string => {
    const d = record.data_json
    return d?.title || d?.name || d?.question || record.primary_key.split('|')[0] || 'Unbenannt'
  }

  const getShortDescription = (record: RecordData): string => {
    const d = record.data_json
    const desc = d?.description || d?.content || ''
    if (typeof desc === 'string') {
      return displayExcerpt(desc, 150, getSourceMetadata(record))
    }
    return ''
  }

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 tracking-tight">Review-Warteschlange</h1>
          <p className="text-neutral-500 mt-1 text-sm sm:text-base">
            {data?.total || 0} Einträge zur Prüfung
          </p>
        </div>
        <button
          onClick={fetchRecords}
          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700
                     bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50
                     hover:border-neutral-300 transition-colors w-full sm:w-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 lg:mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm
                     text-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">Alle Status</option>
          <option value="pending">Ausstehend</option>
          <option value="needs_review">Prüfung nötig</option>
          <option value="approved">Genehmigt</option>
          <option value="rejected">Abgelehnt</option>
        </select>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="w-full sm:w-auto px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm
                     text-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">Alle Abteilungen</option>
          {Object.entries(departmentLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 border-red-200 bg-red-50 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Record Cards */}
      {loading ? (
        <div className="card p-12 text-center">
          <div className="w-10 h-10 border-4 border-neutral-200 border-t-primary-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-neutral-500 mt-4">Lade Records...</p>
        </div>
      ) : data?.records.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <p className="text-neutral-500 font-medium">Keine Records in dieser Kategorie</p>
          <p className="text-sm text-neutral-400 mt-1">Laden Sie ein Dokument hoch, um Records zu extrahieren</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.records.map((record) => (
            (() => {
              const source = getSourceMetadata(record)
              return (
            <Link
              key={record.id}
              href={`/review/${record.id}`}
              className="card card-hover block p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Title & Badges */}
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 mb-2">
                    <div className="p-1.5 sm:p-2 bg-neutral-100 rounded-lg shrink-0">
                      <Package className="w-4 h-4 text-neutral-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-semibold text-neutral-900 truncate">
                        {getDisplayTitle(record)}
                      </h3>
                      {record.data_json?.artnr && (
                        <span className="inline-block mt-1 sm:hidden px-2 py-0.5 bg-accent-100 text-accent-700 text-xs font-mono rounded-full">
                          Art. {record.data_json.artnr}
                        </span>
                      )}
                      <span className={`inline-flex mt-1 sm:hidden px-2 py-0.5 border text-xs font-medium rounded-full ${sourceBadgeClass(source.source_kind)}`}>
                        {source.label}
                      </span>
                    </div>
                    {record.data_json?.artnr && (
                      <span className="hidden sm:inline-block px-2 py-0.5 bg-accent-100 text-accent-700 text-xs font-mono rounded-full shrink-0">
                        Art. {record.data_json.artnr}
                      </span>
                    )}
                    <span className={`hidden sm:inline-flex px-2 py-0.5 border text-xs font-medium rounded-full shrink-0 ${sourceBadgeClass(source.source_kind)}`}>
                      {source.label}
                    </span>
                  </div>

                  {/* Description - hidden on mobile */}
                  {getShortDescription(record) && (
                    <p className="hidden sm:block text-sm text-neutral-500 mb-3 line-clamp-2 ml-11">
                      {getShortDescription(record)}
                    </p>
                  )}

                  {/* Meta Info */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs ml-7 sm:ml-11">
                    <span className="px-2 py-1 bg-neutral-100 text-neutral-600 font-medium rounded-lg">
                      {schemaLabels[record.schema_type] || record.schema_type}
                    </span>
                    <span className="hidden sm:inline text-neutral-400">•</span>
                    <span className="hidden sm:inline text-neutral-500">
                      {departmentLabels[record.department] || record.department}
                    </span>
                    <span className="text-neutral-400">•</span>
                    <span className={`font-semibold tabular-nums ${
                      record.completeness_score >= 0.8 ? 'text-emerald-600' :
                      record.completeness_score >= 0.5 ? 'text-primary-600' :
                      'text-red-600'
                    }`}>
                      {SCHEMA_COVERAGE_LABEL} {formatSchemaCoverage(record.completeness_score)}
                    </span>
                    {source.source_url && (
                      <>
                        <span className="text-neutral-400">•</span>
                        <span className="text-neutral-500 truncate max-w-[260px]">
                          {getHostname(source.source_url)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Side */}
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3 shrink-0">
                  <StatusBadge status={record.status as any} size="sm" />
                  <ChevronRight className="w-5 h-5 text-neutral-400 hidden sm:block" />
                </div>
              </div>
            </Link>
              )
            })()
          ))}
        </div>
      )}

      {/* Pagination */}
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
          {/* Show limited pages on mobile */}
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
              const p = i + 1
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    p === page
                      ? 'bg-neutral-900 text-white'
                      : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  {p}
                </button>
              )
            })}
          </div>
          {/* Mobile page indicator */}
          <span className="sm:hidden px-3 py-2 text-sm text-neutral-600">
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

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center"><div className="w-10 h-10 border-4 border-neutral-200 border-t-primary-500 rounded-full animate-spin mx-auto" /></div>}>
      <ReviewContent />
    </Suspense>
  )
}
