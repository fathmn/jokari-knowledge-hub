'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, RefreshCw, Package, FileText, AlertCircle } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import CompletenessBar from '@/components/CompletenessBar'

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
}

interface RecordListResponse {
  records: RecordData[]
  total: number
  page: number
  pages: number
}

export default function ReviewPage() {
  const [data, setData] = useState<RecordListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')

  useEffect(() => {
    fetchRecords()
  }, [page, statusFilter, departmentFilter])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20'
      })
      if (statusFilter) params.append('status', statusFilter)
      if (departmentFilter) params.append('department', departmentFilter)

      const res = await fetch(`/api/review?${params}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Fehler:', err)
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
    TroubleshootingGuide: 'Fehlerbehebung'
  }

  const getDisplayTitle = (record: RecordData): string => {
    const d = record.data_json
    return d?.title || d?.name || d?.question || record.primary_key.split('|')[0] || 'Unbenannt'
  }

  const getShortDescription = (record: RecordData): string => {
    const d = record.data_json
    const desc = d?.description || d?.content || ''
    if (typeof desc === 'string') {
      return desc.slice(0, 120) + (desc.length > 120 ? '...' : '')
    }
    return ''
  }

  return (
    <div className="p-10 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-[28px] font-semibold text-neutral-900 tracking-tight">Review-Warteschlange</h1>
          <p className="text-neutral-500 mt-1">
            {data?.total || 0} Einträge zur Prüfung
          </p>
        </div>
        <button
          onClick={fetchRecords}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700
                     bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50
                     hover:border-neutral-300 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm
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
          onChange={(e) => {
            setDepartmentFilter(e.target.value)
            setPage(1)
          }}
          className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm
                     text-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">Alle Abteilungen</option>
          {Object.entries(departmentLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Record Cards */}
      {loading ? (
        <div className="p-12 text-center">
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
            <Link
              key={record.id}
              href={`/review/${record.id}`}
              className="card card-hover block p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Title & Badges */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-neutral-100 rounded-lg">
                      <Package className="w-4 h-4 text-neutral-600" />
                    </div>
                    <h3 className="text-base font-semibold text-neutral-900 truncate">
                      {getDisplayTitle(record)}
                    </h3>
                    {record.data_json?.artnr && (
                      <span className="px-2 py-0.5 bg-accent-100 text-accent-700 text-xs font-mono rounded-full">
                        Art. {record.data_json.artnr}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {getShortDescription(record) && (
                    <p className="text-sm text-neutral-500 mb-3 line-clamp-2 ml-11">
                      {getShortDescription(record)}
                    </p>
                  )}

                  {/* Meta Info */}
                  <div className="flex items-center gap-3 text-xs ml-11">
                    <span className="px-2 py-1 bg-neutral-100 text-neutral-600 font-medium rounded-lg">
                      {schemaLabels[record.schema_type] || record.schema_type}
                    </span>
                    <span className="text-neutral-400">•</span>
                    <span className="text-neutral-500">
                      {departmentLabels[record.department] || record.department}
                    </span>
                    <span className="text-neutral-400">•</span>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">Vollständig:</span>
                      <span className={`font-semibold tabular-nums ${
                        record.completeness_score >= 0.8 ? 'text-emerald-600' :
                        record.completeness_score >= 0.5 ? 'text-primary-600' :
                        'text-red-600'
                      }`}>
                        {Math.round(record.completeness_score * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side */}
                <div className="flex items-center gap-3 ml-4">
                  <StatusBadge status={record.status as any} size="sm" />
                  <div className="p-2 text-neutral-400 group-hover:text-neutral-900">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex justify-center items-center gap-1 mt-8">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-white text-neutral-600
                       border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            Zurück
          </button>
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
          <button
            onClick={() => setPage(Math.min(data.pages, page + 1))}
            disabled={page === data.pages}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-white text-neutral-600
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
