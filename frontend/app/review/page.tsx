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
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review-Warteschlange</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.total || 0} Einträge zur Prüfung
          </p>
        </div>
        <button
          onClick={fetchRecords}
          className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Aktualisieren
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
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
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Alle Abteilungen</option>
          {Object.entries(departmentLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Record Cards */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : data?.records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Keine Records in dieser Kategorie</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.records.map((record) => (
            <Link
              key={record.id}
              href={`/review/${record.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Title & Badges */}
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {getDisplayTitle(record)}
                    </h3>
                    {record.data_json?.artnr && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-mono rounded">
                        Art. {record.data_json.artnr}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {getShortDescription(record)}
                  </p>

                  {/* Meta Info */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {schemaLabels[record.schema_type] || record.schema_type}
                    </span>
                    <span>
                      {departmentLabels[record.department] || record.department}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>Vollständigkeit:</span>
                      <CompletenessBar score={record.completeness_score} showLabel size="sm" />
                    </div>
                  </div>
                </div>

                {/* Right Side */}
                <div className="flex items-center gap-4 ml-4">
                  <StatusBadge status={record.status as any} />
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          >
            Zurück
          </button>
          {Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
            const p = i + 1
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-3 py-1 rounded ${
                  p === page
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p}
              </button>
            )
          })}
          <button
            onClick={() => setPage(Math.min(data.pages, page + 1))}
            disabled={page === data.pages}
            className="px-3 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  )
}
