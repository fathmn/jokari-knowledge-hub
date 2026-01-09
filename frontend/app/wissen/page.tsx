'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Package, Filter, ChevronRight, BookOpen, CheckCircle } from 'lucide-react'

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
    kabeltypen?: string[]
    features?: string[]
    [key: string]: any
  }
  completeness_score: number
  status: string
  created_at: string
  updated_at: string
}

interface RecordListResponse {
  records: RecordData[]
  total: number
  page: number
  pages: number
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
  EmailTemplate: 'E-Mail-Vorlage'
}

const departmentColors: { [key: string]: string } = {
  sales: 'bg-blue-100 text-blue-800',
  support: 'bg-green-100 text-green-800',
  marketing: 'bg-purple-100 text-purple-800',
  product: 'bg-orange-100 text-orange-800',
  legal: 'bg-red-100 text-red-800'
}

export default function WissenPage() {
  const [data, setData] = useState<RecordListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [schemaFilter, setSchemaFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupByDepartment, setGroupByDepartment] = useState(true)

  useEffect(() => {
    fetchRecords()
  }, [page, departmentFilter, schemaFilter])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        status: 'approved'
      })
      if (departmentFilter) params.append('department', departmentFilter)
      if (schemaFilter) params.append('schema_type', schemaFilter)

      const res = await fetch(`/api/review?${params}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

  const getDisplayTitle = (record: RecordData): string => {
    const d = record.data_json
    return d?.title || d?.name || d?.question || record.primary_key.split('|')[0] || 'Unbenannt'
  }

  const getShortDescription = (record: RecordData): string => {
    const d = record.data_json
    const desc = d?.description || d?.content || ''
    if (typeof desc === 'string') {
      return desc.slice(0, 150) + (desc.length > 150 ? '...' : '')
    }
    return ''
  }

  // Filter by search query
  const filteredRecords = data?.records.filter(record => {
    if (!searchQuery) return true
    const title = getDisplayTitle(record).toLowerCase()
    const desc = getShortDescription(record).toLowerCase()
    const artnr = record.data_json?.artnr?.toLowerCase() || ''
    const query = searchQuery.toLowerCase()
    return title.includes(query) || desc.includes(query) || artnr.includes(query)
  }) || []

  // Group by department
  const groupedRecords = filteredRecords.reduce((acc, record) => {
    const dept = record.department
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(record)
    return acc
  }, {} as { [key: string]: RecordData[] })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-2">
          <BookOpen className="w-6 sm:w-8 h-6 sm:h-8 text-primary-600" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Wissensdatenbank</h1>
        </div>
        <p className="text-sm sm:text-base text-gray-500">
          Alle geprüften und genehmigten Wissenseinträge nach Abteilung und Kategorie
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
          {/* Search */}
          <div className="flex-1 sm:min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Suche nach Titel, Beschreibung..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap gap-2 sm:gap-4">
            {/* Department Filter */}
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value)
                setPage(1)
              }}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            >
              <option value="">Alle Abteilungen</option>
              {Object.entries(departmentLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Schema Filter */}
            <select
              value={schemaFilter}
              onChange={(e) => {
                setSchemaFilter(e.target.value)
                setPage(1)
              }}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            >
              <option value="">Alle Kategorien</option>
              {Object.entries(schemaLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Group Toggle */}
            <button
              onClick={() => setGroupByDepartment(!groupByDepartment)}
              className={`px-3 sm:px-4 py-2 rounded-lg border text-sm sm:text-base whitespace-nowrap ${
                groupByDepartment
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'border-gray-300 text-gray-600'
              }`}
            >
              <Filter className="w-4 h-4 inline mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Nach Abteilung</span>
              <span className="sm:hidden">Gruppieren</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
        {Object.entries(departmentLabels).map(([key, label]) => {
          const count = data?.records.filter(r => r.department === key).length || 0
          return (
            <button
              key={key}
              onClick={() => setDepartmentFilter(departmentFilter === key ? '' : key)}
              className={`p-3 sm:p-4 rounded-xl border transition-all ${
                departmentFilter === key
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-xl sm:text-2xl font-bold text-gray-900">{count}</div>
              <div className="text-xs sm:text-sm text-gray-500 truncate">{label}</div>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Keine genehmigten Einträge gefunden</p>
          <p className="text-sm text-gray-400">
            Genehmigen Sie Einträge in der Review-Warteschlange, um sie hier zu sehen.
          </p>
        </div>
      ) : groupByDepartment ? (
        // Grouped View
        <div className="space-y-8">
          {Object.entries(groupedRecords).map(([dept, records]) => (
            <div key={dept}>
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${departmentColors[dept] || 'bg-gray-100 text-gray-800'}`}>
                  {departmentLabels[dept] || dept}
                </span>
                <span className="text-sm text-gray-500">{records.length} Einträge</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {records.map((record) => (
                  <RecordCard key={record.id} record={record} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat View
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecords.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6 sm:mt-8">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 sm:px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 text-sm sm:text-base"
          >
            Zurück
          </button>
          <span className="px-2 sm:px-4 py-2 text-sm sm:text-base text-gray-600">
            {page} / {data.pages}
          </span>
          <button
            onClick={() => setPage(Math.min(data.pages, page + 1))}
            disabled={page === data.pages}
            className="px-3 sm:px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 text-sm sm:text-base"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  )
}

// Record Card Component
function RecordCard({ record }: { record: RecordData }) {
  const getDisplayTitle = (r: RecordData): string => {
    const d = r.data_json
    return d?.title || d?.name || d?.question || r.primary_key.split('|')[0] || 'Unbenannt'
  }

  const getShortDescription = (r: RecordData): string => {
    const d = r.data_json
    const desc = d?.description || d?.content || ''
    if (typeof desc === 'string') {
      return desc.slice(0, 100) + (desc.length > 100 ? '...' : '')
    }
    return ''
  }

  return (
    <Link
      href={`/wissen/${record.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-gray-400" />
          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
            {schemaLabels[record.schema_type] || record.schema_type}
          </span>
        </div>
        <CheckCircle className="w-4 h-4 text-green-500" />
      </div>

      {/* Title */}
      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
        {getDisplayTitle(record)}
      </h3>

      {/* Article Number */}
      {record.data_json?.artnr && (
        <div className="text-xs font-mono text-blue-600 mb-2">
          Art. {record.data_json.artnr}
        </div>
      )}

      {/* Description */}
      <p className="text-sm text-gray-600 line-clamp-3 mb-3">
        {getShortDescription(record)}
      </p>

      {/* Cable Types Preview */}
      {record.data_json?.kabeltypen && record.data_json.kabeltypen.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {record.data_json.kabeltypen.slice(0, 3).map((kabel, i) => (
            <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
              {kabel}
            </span>
          ))}
          {record.data_json.kabeltypen.length > 3 && (
            <span className="text-xs text-gray-500">
              +{record.data_json.kabeltypen.length - 3} mehr
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
        <span>{departmentLabels[record.department] || record.department}</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </Link>
  )
}
