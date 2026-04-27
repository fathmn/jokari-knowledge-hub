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
  Calendar,
  Edit2,
  Save,
  X,
  Code,
  Plus,
  Trash2
} from 'lucide-react'
import { useToast } from '@/components/Toast'
import {
  displayExcerpt,
  displayText,
  getSourceMetadata,
  isTechnicalSourceField,
  isUsefulDisplayValue,
  sourceBadgeClass,
  trustLabel,
  type SourceMetadata,
} from '@/lib/recordSource'

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
  evidence?: Evidence[]
  source_metadata?: SourceMetadata | null
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
  version: 'Dokumentstand',
  problem: 'Problem',
  solution: 'Lösung',
  category: 'Kategorie',
  objection_text: 'Einwand',
  response: 'Erwiderung',
  product_code: 'Produktcode',
  product_category: 'Produktkategorie',
  related_products: 'Verwandte Produkte',
  key_points: 'Kernaussagen',
  links: 'Links & Verweise',
  _source: 'Herkunft',
  _source_section: 'Quellabschnitt'
}

export default function WissenDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [record, setRecord] = useState<RecordData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [editData, setEditData] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [newArrayItem, setNewArrayItem] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    if (params.id) {
      fetchRecord()
    }
  }, [params.id])

  const fetchRecord = async () => {
    try {
      // Try knowledge endpoint first (only returns approved records)
      const res = await fetch(`/api/knowledge/${params.id}`)
      if (!res.ok) throw new Error('Nicht gefunden')
      const data = await res.json()
      data.evidence_items = data.evidence_items || data.evidence || []
      setRecord(data)
      setEditData(JSON.stringify(data.data_json, null, 2))
    } catch (err) {
      // Fallback to review endpoint
      try {
        const res = await fetch(`/api/review/${params.id}`)
        if (!res.ok) throw new Error('Nicht gefunden')
        const data = await res.json()
        data.evidence_items = data.evidence_items || data.evidence || []
        setRecord(data)
        setEditData(JSON.stringify(data.data_json, null, 2))
      } catch {
        // Record truly not found
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    try {
      const parsed = JSON.parse(editData)
      setActionLoading(true)

      const res = await fetch(`/api/review/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_json: parsed })
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.detail || 'Speichern fehlgeschlagen', 'error')
        return
      }

      showToast('Änderungen gespeichert', 'success')
      setEditing(false)
      await fetchRecord()
    } catch {
      showToast('Ungültiges JSON', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const updateField = async (fieldName: string, value: any) => {
    if (!record) return

    const newData = { ...record.data_json, [fieldName]: value }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/review/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_json: newData })
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.detail || 'Speichern fehlgeschlagen', 'error')
        return
      }

      showToast('Änderung gespeichert', 'success')
      await fetchRecord()
    } catch {
      showToast('Fehler beim Speichern', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const saveFieldEdit = async () => {
    if (!editingField) return
    await updateField(editingField, editingValue)
    setEditingField(null)
    setEditingValue('')
  }

  const addArrayItem = async (fieldName: string, item: string) => {
    if (!record || !item.trim()) return
    const currentArray = (record.data_json[fieldName] as string[]) || []
    await updateField(fieldName, [...currentArray, item.trim()])
    setNewArrayItem('')
  }

  const removeArrayItem = async (fieldName: string, index: number) => {
    if (!record) return
    const currentArray = (record.data_json[fieldName] as string[]) || []
    await updateField(
      fieldName,
      currentArray.filter((_, currentIndex) => currentIndex !== index)
    )
  }

  const formatEditableValue = (value: any) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join('\n')
    }
    if (value && typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return value === undefined || value === null ? '' : String(value)
  }

  const parseEditedValue = (originalValue: any, rawValue: string) => {
    if (Array.isArray(originalValue)) {
      return rawValue
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    }
    if (typeof originalValue === 'number') {
      const parsed = Number(rawValue)
      return Number.isNaN(parsed) ? originalValue : parsed
    }
    if (typeof originalValue === 'boolean') {
      return rawValue.trim().toLowerCase() === 'true'
    }
    if (originalValue && typeof originalValue === 'object') {
      return JSON.parse(rawValue)
    }
    return rawValue
  }

  const saveGenericFieldEdit = async (fieldName: string, originalValue: any) => {
    const parsedValue = parseEditedValue(originalValue, editingValue)
    await updateField(fieldName, parsedValue)
    setEditingField(null)
    setEditingValue('')
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
  const isTrainingModule = record.schema_type === 'TrainingModule'
  const isFAQ = record.schema_type === 'FAQ'
  const primaryTextField = isTrainingModule ? 'content' : (data?.description !== undefined ? 'description' : 'content')
  const primaryTextTitle = isTrainingModule ? 'Inhalt' : 'Beschreibung'
  const rawPrimaryTextValue = (isTrainingModule ? (data?.content || data?.description) : (data?.description || data?.content)) || ''
  const source = getSourceMetadata(record)
  const primaryTextValue = displayText(rawPrimaryTextValue, source)
  const productRelatedItems = Array.isArray(data?.compatibility) ? data.compatibility : data?.kabeltypen
  const relatedItems: string[] = Array.isArray(isTrainingModule ? data?.related_products : productRelatedItems)
    ? ((isTrainingModule ? data?.related_products : productRelatedItems) as string[])
    : []
  const relatedItemsField = isTrainingModule ? 'related_products' : (Array.isArray(data?.compatibility) ? 'compatibility' : 'kabeltypen')
  const relatedItemsTitle = isTrainingModule ? 'Verwandte Produkte' : 'Kompatible Kabeltypen'
  const stepItems: string[] = Array.isArray(isTrainingModule ? data?.objectives : data?.anwendung)
    ? ((isTrainingModule ? data?.objectives : data?.anwendung) as string[])
    : []
  const stepItemsField = isTrainingModule ? 'objectives' : 'anwendung'
  const stepItemsTitle = isTrainingModule ? 'Lernziele' : 'Anwendungsschritte'
  const productFeatureItems = Array.isArray(data?.features) ? data.features : data?.specs?.Merkmale
  const featureItems: string[] = Array.isArray(isTrainingModule ? data?.key_points : productFeatureItems)
    ? ((isTrainingModule ? data?.key_points : productFeatureItems) as string[])
    : []
  const featureItemsField = isTrainingModule ? 'key_points' : 'features'
  const canEditFeatureItems = editing && (isTrainingModule || Array.isArray(data?.features))
  const featureItemsTitle = isTrainingModule ? 'Kernaussagen' : 'Merkmale & Besonderheiten'
  const handledFields = [
    'title', 'name', 'description', 'content', 'artnr', 'product_code', 'version',
    'product_category', 'target_audience', 'kabeltypen', 'compatibility', 'related_products',
    'anwendung', 'objectives', 'features', 'key_points', 'medien', 'question',
    'answer', 'steps', 'warnings', 'links', '_source_section', '_source', 'source'
  ]

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
              <span className={`px-2 sm:px-3 py-1 border rounded-full text-xs sm:text-sm font-medium ${sourceBadgeClass(source.source_kind)}`}>
                {source.label}
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

          <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
            <Package className="hidden sm:block w-12 lg:w-16 h-12 lg:h-16 text-gray-200 shrink-0" />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (editing) {
                    setEditing(false)
                    setEditingField(null)
                    setEditingValue('')
                    setNewArrayItem('')
                    setEditData(JSON.stringify(record.data_json, null, 2))
                  } else {
                    setEditing(true)
                  }
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                {editing ? 'Bearbeitung beenden' : 'Eintrag bearbeiten'}
              </button>
              <Link
                href={`/review/${record.id}`}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
              >
                Review-Ansicht
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        {(primaryTextValue || !isFAQ || editingField === primaryTextField) && (
          <ContentSection
            icon={<FileText className="w-5 h-5" />}
            title={primaryTextTitle}
            canEdit={editing}
            onEdit={() => {
              setEditingField(primaryTextField)
              setEditingValue(rawPrimaryTextValue)
            }}
          >
            {editingField === primaryTextField ? (
              <div>
                <textarea
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-700"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => {
                      setEditingField(null)
                      setEditingValue('')
                    }}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={saveFieldEdit}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            ) : primaryTextValue ? (
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{primaryTextValue}</p>
            ) : (
              <p className="text-gray-400 italic">Kein Inhalt vorhanden.</p>
            )}
          </ContentSection>
        )}

        {(relatedItems.length > 0 || editing) && (
          <ContentSection
            icon={isTrainingModule ? <Package className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            title={relatedItemsTitle}
          >
            <div className="flex flex-wrap gap-2">
              {relatedItems.map((item, i) => (
                <span key={i} className="group px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium flex items-center gap-2">
                  {item}
                  {editing && (
                    <button
                      onClick={() => removeArrayItem(relatedItemsField, i)}
                      className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {editing && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={isTrainingModule ? 'Verwandtes Produkt...' : 'Neuer Kabeltyp...'}
                    value={editingField === relatedItemsField ? newArrayItem : ''}
                    onFocus={() => setEditingField(relatedItemsField)}
                    onChange={(e) => setNewArrayItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newArrayItem.trim()) {
                        addArrayItem(relatedItemsField, newArrayItem)
                      }
                    }}
                    className="px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm w-52 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                  {newArrayItem.trim() && editingField === relatedItemsField && (
                    <button
                      onClick={() => addArrayItem(relatedItemsField, newArrayItem)}
                      className="p-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </ContentSection>
        )}

        {(stepItems.length > 0 || editing) && (
          <ContentSection
            icon={<List className="w-5 h-5" />}
            title={stepItemsTitle}
          >
            <ol className="space-y-3">
              {stepItems.map((step, i) => (
                <li key={i} className="flex items-start group">
                  <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5 flex-1">{step}</span>
                  {editing && (
                    <button
                      onClick={() => removeArrayItem(stepItemsField, i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {editing && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                <span className="flex-shrink-0 w-7 h-7 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center text-sm">
                  {stepItems.length + 1}
                </span>
                <input
                  type="text"
                  placeholder={isTrainingModule ? 'Neues Lernziel hinzufügen...' : 'Neuen Schritt hinzufügen...'}
                  value={editingField === stepItemsField ? newArrayItem : ''}
                  onFocus={() => setEditingField(stepItemsField)}
                  onChange={(e) => setNewArrayItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newArrayItem.trim()) {
                      addArrayItem(stepItemsField, newArrayItem)
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {newArrayItem.trim() && editingField === stepItemsField && (
                  <button
                    onClick={() => addArrayItem(stepItemsField, newArrayItem)}
                    className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </ContentSection>
        )}

        {(featureItems.length > 0 || editing) && (
          <ContentSection
            icon={<CheckCircle className="w-5 h-5" />}
            title={featureItemsTitle}
          >
            <ul className="space-y-2">
              {featureItems.map((feature, i) => (
                <li key={i} className="flex items-start group">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 flex-1">{feature}</span>
                  {canEditFeatureItems && (
                    <button
                      onClick={() => removeArrayItem(featureItemsField, i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEditFeatureItems && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                <CheckCircle className="w-5 h-5 text-gray-300 flex-shrink-0" />
                <input
                  type="text"
                  placeholder={isTrainingModule ? 'Neue Kernaussage hinzufügen...' : 'Neues Merkmal hinzufügen...'}
                  value={editingField === featureItemsField ? newArrayItem : ''}
                  onFocus={() => setEditingField(featureItemsField)}
                  onChange={(e) => setNewArrayItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newArrayItem.trim()) {
                      addArrayItem(featureItemsField, newArrayItem)
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {newArrayItem.trim() && editingField === featureItemsField && (
                  <button
                    onClick={() => addArrayItem(featureItemsField, newArrayItem)}
                    className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </ContentSection>
        )}

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
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{displayText(data.answer, source)}</p>
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
        {Object.entries(data || {}).filter(([key]) => !handledFields.includes(key) && !isTechnicalSourceField(key)).map(([key, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return null
          const displayValue = key === 'specs' ? sanitizeProductSpecs(value) : sanitizeTechnicalSourceFields(value)
          if (!displayValue || (typeof displayValue === 'object' && !Array.isArray(displayValue) && Object.keys(displayValue).length === 0)) return null

          return (
            <ContentSection
              key={key}
              icon={<Info className="w-5 h-5" />}
              title={fieldLabels[key] || key}
              canEdit={editing}
              onEdit={() => {
                setEditingField(key)
                setEditingValue(formatEditableValue(value))
              }}
            >
              {editingField === key ? (
                <div>
                  <textarea
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="w-full h-36 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-700 font-mono text-sm"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    {Array.isArray(value)
                      ? 'Mehrere Werte zeilenweise eingeben.'
                      : value && typeof value === 'object'
                        ? 'Objekte als gültiges JSON speichern.'
                        : 'Wert direkt bearbeiten und speichern.'}
                  </p>
                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      onClick={() => {
                        setEditingField(null)
                        setEditingValue('')
                      }}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => saveGenericFieldEdit(key, value)}
                      className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              ) : Array.isArray(displayValue) ? (
                <ul className="space-y-1">
                  {displayValue.filter((item) => isUsefulDisplayValue(item, source)).map((item, i) => (
                    <li key={i} className="min-w-0 whitespace-pre-line text-gray-700 break-words [overflow-wrap:anywhere]">• {displayText(String(item), source)}</li>
                  ))}
                </ul>
              ) : typeof displayValue === 'object' ? (
                <pre className="max-w-full whitespace-pre-wrap break-words text-sm text-gray-600 bg-gray-50 p-3 rounded-lg overflow-auto [overflow-wrap:anywhere]">
                  {JSON.stringify(displayValue, null, 2)}
                </pre>
              ) : (
                <p className="min-w-0 whitespace-pre-line text-gray-700 break-words [overflow-wrap:anywhere]">{displayText(String(displayValue), source)}</p>
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
                  &ldquo;{displayExcerpt(ev.excerpt, 180, source)}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Area */}
      <div className="mt-6 sm:mt-8 bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Code className="w-5 h-5 text-gray-400" />
              Technischer JSON-Editor
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Fallback für Sonderfälle. Für normale Korrekturen die sichtbaren Blöcke oben im Bearbeitungsmodus anpassen.
            </p>
          </div>
          <Link
            href={`/review/${record.id}`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
          >
            Zur Review-Ansicht
          </Link>
        </div>

        {showJsonEditor ? (
          <div>
            <textarea
              value={editData}
              onChange={(e) => setEditData(e.target.value)}
              className="w-full h-96 font-mono text-sm p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowJsonEditor(false)
                  setEditData(JSON.stringify(record.data_json, null, 2))
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Abbrechen
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Speichern
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditData(JSON.stringify(record.data_json, null, 2))
                setShowJsonEditor(true)
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              JSON bearbeiten
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 sm:mt-8">
        <SourceOverview source={source} />
      </div>
    </div>
  )
}

function sanitizeTechnicalSourceFields(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTechnicalSourceFields(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isTechnicalSourceField(key))
        .map(([key, nestedValue]) => [key, sanitizeTechnicalSourceFields(nestedValue)])
    )
  }

  return value
}

function sanitizeProductSpecs(value: any): any {
  const specs = sanitizeTechnicalSourceFields(value)
  if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
    const { Merkmale, ...rest } = specs
    return rest
  }
  return specs
}

function SourceOverview({ source }: { source: SourceMetadata }) {
  const importedAt = source.imported_at || source.document_uploaded_at
  const sourceTarget = source.source_url || source.api_endpoint
  const sourceTargetIsLink = isHttpUrl(sourceTarget)

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Herkunft</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex px-3 py-1 border rounded-full text-sm font-semibold ${sourceBadgeClass(source.source_kind)}`}>
                {source.label}
              </span>
              <span className="min-w-0 text-sm text-gray-500 break-words [overflow-wrap:anywhere]">{trustLabel(source.trust_type, source.authenticated_source)}</span>
            </div>
          </div>
          {source.status && (
            <span className="max-w-full rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 break-words [overflow-wrap:anywhere]">
              Importstatus: {source.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
	          {sourceTarget && (
	            <div className="sm:col-span-2">
	              <dt className="text-gray-500">Quelle</dt>
	              <dd className="mt-1 min-w-0 break-all font-medium text-primary-700 [overflow-wrap:anywhere]">
	                {sourceTargetIsLink ? (
	                  <a href={sourceTarget} target="_blank" rel="noopener noreferrer" className="hover:underline break-all [overflow-wrap:anywhere]">
	                    {sourceTarget}
	                  </a>
	                ) : (
	                  <span className="break-all text-gray-700 [overflow-wrap:anywhere]">{sourceTarget}</span>
	                )}
	              </dd>
	            </div>
	          )}
          {source.document_filename && (
            <div>
              <dt className="text-gray-500">Upload-Datei</dt>
              <dd className="min-w-0 font-medium text-gray-900 break-words [overflow-wrap:anywhere]">{source.document_filename}</dd>
            </div>
          )}
          {source.document_owner && (
            <div>
              <dt className="text-gray-500">Owner</dt>
              <dd className="min-w-0 font-medium text-gray-900 break-words [overflow-wrap:anywhere]">{source.document_owner}</dd>
            </div>
          )}
          {source.source_type && (
            <div>
              <dt className="text-gray-500">Importweg</dt>
              <dd className="min-w-0 font-medium text-gray-900 break-words [overflow-wrap:anywhere]">{source.source_type.replace(/_/g, ' ')}</dd>
            </div>
          )}
          {source.source_id && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Source ID</dt>
              <dd className="mt-1 min-w-0 break-all font-mono text-xs text-gray-600 [overflow-wrap:anywhere]">{source.source_id}</dd>
            </div>
          )}
          {importedAt && (
            <div>
              <dt className="text-gray-500">Importiert</dt>
              <dd className="font-medium text-gray-900">{new Date(importedAt).toLocaleString('de-DE')}</dd>
            </div>
          )}
          {source.content_hash && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Content Hash</dt>
              <dd className="mt-1 min-w-0 break-all font-mono text-xs text-gray-600 [overflow-wrap:anywhere]">{source.content_hash}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
	  )
	}

function isHttpUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Content Section Component
function ContentSection({
  icon,
  title,
  children,
  variant = 'default',
  canEdit = false,
  onEdit
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  variant?: 'default' | 'warning'
  canEdit?: boolean
  onEdit?: () => void
}) {
  const bgColor = variant === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'

  return (
    <div className={`rounded-xl border p-4 sm:p-6 ${bgColor}`}>
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <span className={variant === 'warning' ? 'text-amber-500' : 'text-gray-400'}>
            {icon}
          </span>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        {canEdit && onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
            title="Bearbeiten"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
