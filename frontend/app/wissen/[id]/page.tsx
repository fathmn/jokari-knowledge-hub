'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  CheckCircle,
  FileText,
  Wrench,
  AlertTriangle,
  Image as ImageIcon,
  List,
  Info,
  Tag,
  Building,
  Calendar
} from 'lucide-react'

interface Evidence {
  id: string
  field_path: string
  excerpt: string
}

interface RecordData {
  id: string
  department: string
  schema_type: string
  primary_key: string
  data_json: {
    title?: string
    name?: string
    description?: string
    content?: string
    artnr?: string
    kabeltypen?: string[]
    anwendung?: string[]
    features?: string[]
    medien?: string[]
    question?: string
    answer?: string
    steps?: string[] | { step_number?: number; instruction?: string; note?: string }[]
    warnings?: string[]
    _source_section?: string
    [key: string]: any
  }
  completeness_score: number
  status: string
  version: number
  created_at: string
  updated_at: string
  evidence_items: Evidence[]
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

// Field name translations
const fieldLabels: { [key: string]: string } = {
  title: 'Titel',
  name: 'Name',
  description: 'Beschreibung',
  content: 'Inhalt',
  artnr: 'Artikelnummer',
  kabeltypen: 'Kabeltypen',
  anwendung: 'Anwendung',
  features: 'Merkmale',
  medien: 'Medien',
  question: 'Frage',
  answer: 'Antwort',
  steps: 'Schritte',
  warnings: 'Warnhinweise',
  objectives: 'Lernziele',
  target_audience: 'Zielgruppe',
  version: 'Version',
  problem: 'Problem',
  solution: 'Lösung',
  category: 'Kategorie',
  objection_text: 'Einwand',
  response: 'Erwiderung',
  _source_section: 'Quellabschnitt'
}

export default function WissenDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [record, setRecord] = useState<RecordData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchRecord()
    }
  }, [params.id])

  const fetchRecord = async () => {
    try {
      const res = await fetch(`/api/review/${params.id}`)
      const data = await res.json()
      setRecord(data)
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Eintrag nicht gefunden
        </div>
      </div>
    )
  }

  const data = record.data_json
  const title = data?.title || data?.name || data?.question || 'Unbenannt'

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Back Navigation */}
      <button
        onClick={() => router.back()}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-4 sm:mb-6 text-sm sm:text-base"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Zurück zur Übersicht
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Category & Status */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
              <span className="px-2 sm:px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs sm:text-sm font-medium">
                {schemaLabels[record.schema_type] || record.schema_type}
              </span>
              <span className="px-2 sm:px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs sm:text-sm">
                {departmentLabels[record.department] || record.department}
              </span>
              <span className="flex items-center text-green-600 text-xs sm:text-sm">
                <CheckCircle className="w-4 h-4 mr-1" />
                Genehmigt
              </span>
            </div>

            {/* Title */}
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-3 break-words">{title}</h1>

            {/* Article Number */}
            {data?.artnr && (
              <div className="flex items-center text-blue-600 font-mono text-sm sm:text-lg mb-3 sm:mb-4">
                <Tag className="w-4 sm:w-5 h-4 sm:h-5 mr-2 shrink-0" />
                <span className="truncate">Artikelnummer: {data.artnr}</span>
              </div>
            )}

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-500">
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                Aktualisiert: {new Date(record.updated_at).toLocaleDateString('de-DE')}
              </span>
              <span>Version {record.version}</span>
            </div>
          </div>

          <Package className="hidden sm:block w-12 lg:w-16 h-12 lg:h-16 text-gray-200 shrink-0" />
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        {/* Description */}
        {data?.description && (
          <ContentSection
            icon={<FileText className="w-5 h-5" />}
            title="Beschreibung"
          >
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {data.description}
            </p>
          </ContentSection>
        )}

        {/* Content (if different from description) */}
        {data?.content && data.content !== data.description && (
          <ContentSection
            icon={<FileText className="w-5 h-5" />}
            title="Inhalt"
          >
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {typeof data.content === 'string' ? data.content.slice(0, 2000) : ''}
              {typeof data.content === 'string' && data.content.length > 2000 && '...'}
            </p>
          </ContentSection>
        )}

        {/* Cable Types */}
        {data?.kabeltypen && data.kabeltypen.length > 0 && (
          <ContentSection
            icon={<Wrench className="w-5 h-5" />}
            title="Kompatible Kabeltypen"
          >
            <div className="flex flex-wrap gap-2">
              {data.kabeltypen.map((kabel, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium"
                >
                  {kabel}
                </span>
              ))}
            </div>
          </ContentSection>
        )}

        {/* Application Steps */}
        {data?.anwendung && data.anwendung.length > 0 && (
          <ContentSection
            icon={<List className="w-5 h-5" />}
            title="Anwendungsschritte"
          >
            <ol className="space-y-3">
              {data.anwendung.map((step, i) => (
                <li key={i} className="flex items-start">
                  <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </ContentSection>
        )}

        {/* Features */}
        {data?.features && data.features.length > 0 && (
          <ContentSection
            icon={<CheckCircle className="w-5 h-5" />}
            title="Merkmale & Besonderheiten"
          >
            <ul className="space-y-2">
              {data.features.map((feature, i) => (
                <li key={i} className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </ContentSection>
        )}

        {/* Warnings */}
        {data?.warnings && data.warnings.length > 0 && (
          <ContentSection
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            title="Warnhinweise"
            variant="warning"
          >
            <ul className="space-y-2">
              {data.warnings.map((warning, i) => (
                <li key={i} className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-amber-800">{warning}</span>
                </li>
              ))}
            </ul>
          </ContentSection>
        )}

        {/* Media References */}
        {data?.medien && data.medien.length > 0 && (
          <ContentSection
            icon={<ImageIcon className="w-5 h-5" />}
            title="Medien & Dateien"
          >
            <div className="flex flex-wrap gap-2">
              {data.medien.map((media, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-mono"
                >
                  {media}
                </span>
              ))}
            </div>
          </ContentSection>
        )}

        {/* FAQ Answer */}
        {data?.question && data?.answer && (
          <>
            <ContentSection
              icon={<Info className="w-5 h-5" />}
              title="Frage"
            >
              <p className="text-gray-700 font-medium text-lg">{data.question}</p>
            </ContentSection>
            <ContentSection
              icon={<CheckCircle className="w-5 h-5" />}
              title="Antwort"
            >
              <p className="text-gray-700 leading-relaxed">{data.answer}</p>
            </ContentSection>
          </>
        )}

        {/* Generic Steps */}
        {data?.steps && data.steps.length > 0 && !data?.anwendung && (
          <ContentSection
            icon={<List className="w-5 h-5" />}
            title="Schritte"
          >
            <ol className="space-y-3">
              {data.steps.map((step, i) => (
                <li key={i} className="flex items-start">
                  <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    {typeof step === 'object' ? step.step_number || i + 1 : i + 1}
                  </span>
                  <div className="pt-0.5">
                    <span className="text-gray-700">
                      {typeof step === 'object' ? step.instruction : step}
                    </span>
                    {typeof step === 'object' && step.note && (
                      <p className="text-sm text-gray-500 mt-1">{step.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </ContentSection>
        )}

        {/* Other Fields - Display any remaining fields */}
        {Object.entries(data || {}).filter(([key]) =>
          !['title', 'name', 'description', 'content', 'artnr', 'kabeltypen',
            'anwendung', 'features', 'medien', 'question', 'answer', 'steps',
            'warnings', '_source_section'].includes(key)
        ).map(([key, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return null

          return (
            <ContentSection
              key={key}
              icon={<Info className="w-5 h-5" />}
              title={fieldLabels[key] || key}
            >
              {Array.isArray(value) ? (
                <ul className="space-y-1">
                  {value.map((item, i) => (
                    <li key={i} className="text-gray-700">• {String(item)}</li>
                  ))}
                </ul>
              ) : typeof value === 'object' ? (
                <pre className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto">
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                <p className="text-gray-700">{String(value)}</p>
              )}
            </ContentSection>
          )
        })}
      </div>

      {/* Evidence Section */}
      {record.evidence_items && record.evidence_items.length > 0 && (
        <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-gray-50 rounded-xl border border-gray-200">
          <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 sm:mb-4">
            Quellenbelege ({record.evidence_items.length})
          </h3>
          <div className="space-y-2 sm:space-y-3">
            {record.evidence_items.slice(0, 5).map((ev) => (
              <div key={ev.id} className="bg-white p-3 rounded-lg border border-gray-200">
                <span className="text-xs font-medium text-primary-600 uppercase">
                  {fieldLabels[ev.field_path] || ev.field_path}
                </span>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">
                  &ldquo;{ev.excerpt}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Link */}
      <div className="mt-6 sm:mt-8 flex justify-end">
        <Link
          href={`/review/${record.id}`}
          className="text-xs sm:text-sm text-gray-500 hover:text-primary-600"
        >
          Im Review-Modus bearbeiten →
        </Link>
      </div>
    </div>
  )
}

// Content Section Component
function ContentSection({
  icon,
  title,
  children,
  variant = 'default'
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  variant?: 'default' | 'warning'
}) {
  const bgColor = variant === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'

  return (
    <div className={`rounded-xl border p-4 sm:p-6 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <span className={variant === 'warning' ? 'text-amber-500' : 'text-gray-400'}>
          {icon}
        </span>
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}
