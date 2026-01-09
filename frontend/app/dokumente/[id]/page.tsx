'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Trash2,
  ChevronRight,
  Package,
  Tag,
  CheckCircle,
  Image as ImageIcon,
  Link as LinkIcon
} from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import CompletenessBar from '@/components/CompletenessBar'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

interface Document {
  id: string
  filename: string
  department: string
  doc_type: string
  version_date: string
  owner: string
  confidentiality: string
  status: string
  error_message?: string
  uploaded_at: string
}

interface Chunk {
  id: string
  section_path: string
  text: string
  confidence: number
  chunk_index: number
}

interface RecordData {
  id: string
  schema_type: string
  primary_key: string
  status: string
  completeness_score: number
  data_json: {
    title?: string
    name?: string
    description?: string
    artnr?: string
    question?: string
    answer?: string
    [key: string]: any
  }
}

const schemaLabels: { [key: string]: string } = {
  TrainingModule: 'Schulungsmodul',
  ProductSpec: 'Produktspezifikation',
  FAQ: 'FAQ',
  Objection: 'Einwand',
  TroubleshootingGuide: 'Fehlerbehebung'
}

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [document, setDocument] = useState<Document | null>(null)
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [records, setRecords] = useState<RecordData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'chunks' | 'records'>('records')

  useEffect(() => {
    if (params.id) {
      fetchDocument()
      fetchChunks()
      fetchRecords()
    }
  }, [params.id])

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${params.id}`)
      const data = await res.json()
      setDocument(data)
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchChunks = async () => {
    try {
      const res = await fetch(`/api/documents/${params.id}/chunks`)
      const data = await res.json()
      setChunks(data.chunks || [])
    } catch (err) {
      console.error('Fehler:', err)
    }
  }

  const fetchRecords = async () => {
    try {
      const res = await fetch(`/api/documents/${params.id}/records`)
      const data = await res.json()
      setRecords(data.records || [])
    } catch (err) {
      console.error('Fehler:', err)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Möchten Sie dieses Dokument wirklich löschen?')) return

    try {
      await fetch(`/api/documents/${params.id}`, { method: 'DELETE' })
      router.push('/dokumente')
    } catch (err) {
      console.error('Fehler:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Dokument nicht gefunden
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
        <div className="flex items-start sm:items-center min-w-0">
          <button
            onClick={() => router.back()}
            className="mr-3 sm:mr-4 p-2 hover:bg-gray-100 rounded-lg shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center">
              <FileText className="w-5 sm:w-6 h-5 sm:h-6 text-gray-400 mr-2 sm:mr-3 shrink-0" />
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{document.filename}</h1>
            </div>
            <div className="mt-1 ml-7 sm:ml-9">
              <StatusBadge status={document.status as any} />
            </div>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="flex items-center justify-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg w-full sm:w-auto"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Löschen
        </button>
      </div>

      {/* Error Message */}
      {document.error_message && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <strong>Fehler:</strong> {document.error_message}
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Metadaten</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <dt className="text-sm text-gray-500">Abteilung</dt>
            <dd className="text-sm font-medium text-gray-900">{document.department}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Dokumenttyp</dt>
            <dd className="text-sm font-medium text-gray-900">{document.doc_type}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Verantwortlich</dt>
            <dd className="text-sm font-medium text-gray-900">{document.owner}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Vertraulichkeit</dt>
            <dd className="text-sm font-medium text-gray-900">
              {document.confidentiality === 'internal' ? 'Intern' : 'Öffentlich'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Versionsdatum</dt>
            <dd className="text-sm font-medium text-gray-900">
              {format(new Date(document.version_date), 'dd.MM.yyyy', { locale: de })}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Hochgeladen</dt>
            <dd className="text-sm font-medium text-gray-900">
              {format(new Date(document.uploaded_at), 'dd.MM.yyyy HH:mm', { locale: de })}
            </dd>
          </div>
        </dl>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 sm:mb-6">
        <nav className="flex gap-4 sm:gap-8">
          <button
            onClick={() => setActiveTab('records')}
            className={`pb-3 sm:pb-4 text-sm font-medium border-b-2 ${
              activeTab === 'records'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Records ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            className={`pb-3 sm:pb-4 text-sm font-medium border-b-2 ${
              activeTab === 'chunks'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Chunks ({chunks.length})
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'records' ? (
        <div className="space-y-4">
          {records.length === 0 ? (
            <p className="text-gray-500">Keine Records extrahiert</p>
          ) : (
            records.map((record) => {
              const data = record.data_json
              const title = data?.title || data?.name || data?.question || record.primary_key.split('|')[0] || 'Unbenannt'
              const description = data?.description || data?.answer || data?.content

              return (
                <Link
                  key={record.id}
                  href={`/review/${record.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:border-primary-300 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        <Package className="w-4 sm:w-5 h-4 sm:h-5 text-gray-400 flex-shrink-0" />
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words">{title}</h3>
                        {data?.artnr && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-mono rounded">
                            <Tag className="w-3 h-3" />
                            {data.artnr}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {description.slice(0, 200)}{description.length > 200 ? '...' : ''}
                        </p>
                      )}

                      {/* Key Fields Preview */}
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
                        {data?.kabeltypen?.slice(0, 3).map((k: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded">
                            {k}
                          </span>
                        ))}
                        {data?.kabeltypen?.length > 3 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                            +{data.kabeltypen.length - 3} weitere
                          </span>
                        )}
                        {data?.features?.slice(0, 2).map((f: string, i: number) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 text-xs rounded">
                            <CheckCircle className="w-3 h-3" />
                            <span className="truncate max-w-[100px] sm:max-w-[150px]">{f.slice(0, 30)}{f.length > 30 ? '...' : ''}</span>
                          </span>
                        ))}
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-500">
                        <span className="px-2 py-1 bg-gray-100 rounded">
                          {schemaLabels[record.schema_type] || record.schema_type}
                        </span>
                        <div className="flex items-center gap-2">
                          <CompletenessBar score={record.completeness_score} size="sm" />
                          <span>{Math.round(record.completeness_score * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Side */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-gray-100">
                      <StatusBadge status={record.status as any} />
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {chunks.length === 0 ? (
            <p className="text-gray-500">Keine Chunks erstellt</p>
          ) : (
            chunks.map((chunk) => (
              <div
                key={chunk.id}
                className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <span className="text-sm font-semibold text-gray-700">
                    {chunk.section_path || `Textabschnitt ${chunk.chunk_index + 1}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      Konfidenz:
                    </span>
                    <span className={`text-xs font-medium ${
                      chunk.confidence >= 0.8 ? 'text-green-600' :
                      chunk.confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {Math.round(chunk.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {chunk.text}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
