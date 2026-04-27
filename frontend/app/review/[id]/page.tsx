'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Edit2,
  Save,
  X,
  Package,
  FileText,
  Wrench,
  List,
  AlertTriangle,
  Image as ImageIcon,
  Tag,
  Info,
  Code,
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
  Pencil
} from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import CompletenessBar from '@/components/CompletenessBar'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/Toast'
import {
  SCHEMA_COVERAGE_EXPLANATION,
  SCHEMA_COVERAGE_LABEL,
  formatSchemaCoverage,
  formatSchemaCoverageSummary,
} from '@/lib/schemaCoverage'
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

interface Attachment {
  id: string
  filename: string
  file_type: string
  url: string
  created_at: string
}

interface RecordType {
  id: string
  department: string
  schema_type: string
  primary_key: string
  data_json: {
    title?: string
    name?: string
    description?: string
    content?: string
    version?: string
    artnr?: string
    product_code?: string
    product_category?: string
    kabeltypen?: string[]
    anwendung?: string[]
    features?: string[]
    medien?: string[]
    objectives?: string[]
    target_audience?: string
    key_points?: string[]
    related_products?: string[]
    question?: string
    answer?: string
    warnings?: string[]
    links?: string[]
    [key: string]: any
  }
  completeness_score: number
  status: string
  version: number
  evidence_items: Evidence[]
  attachments?: Attachment[]
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

const fieldLabels: { [key: string]: string } = {
  title: 'Titel',
  name: 'Name',
  description: 'Beschreibung',
  content: 'Inhalt',
  version: 'Dokumentstand',
  artnr: 'Artikelnummer',
  product_code: 'Produktcode',
  product_category: 'Produktkategorie',
  kabeltypen: 'Kabeltypen',
  anwendung: 'Anwendungsschritte',
  features: 'Merkmale',
  medien: 'Medien',
  question: 'Frage',
  answer: 'Antwort',
  warnings: 'Warnhinweise',
  objectives: 'Lernziele',
  target_audience: 'Zielgruppe',
  key_points: 'Kernaussagen',
  related_products: 'Verwandte Produkte',
  _source: 'Herkunft',
  _source_section: 'Quellabschnitt',
  // Additional Jokari product fields
  anwendungsbild: 'Anwendungsbild',
  produktbild: 'Produktbild',
  hauptbild: 'Hauptbild',
  weitere_bilder: 'Weitere Bilder',
  technische_daten: 'Technische Daten',
  lieferumfang: 'Lieferumfang',
  zubehoer: 'Zubehör',
  ersatzteile: 'Ersatzteile',
  video: 'Video',
  video_url: 'Video URL',
  downloads: 'Downloads',
  pdf: 'PDF-Dokumente',
  kategorie: 'Kategorie',
  unterkategorie: 'Unterkategorie',
  hersteller: 'Hersteller',
  ean: 'EAN-Code',
  gewicht: 'Gewicht',
  abmessungen: 'Abmessungen',
  material: 'Material',
  farbe: 'Farbe',
  garantie: 'Garantie',
  zertifizierungen: 'Zertifizierungen',
  sicherheitshinweise: 'Sicherheitshinweise',
  anwendungsbereich: 'Anwendungsbereich',
  vorteile: 'Vorteile',
  besonderheiten: 'Besonderheiten',
  kompatibilitaet: 'Kompatibilität',
  spezifikationen: 'Spezifikationen'
}

const getFieldLabel = (fieldPath: string) => {
  const normalized = fieldPath.replace(/\[\d+\]/g, '')
  return fieldLabels[normalized] || fieldLabels[fieldPath] || normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function RecordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [record, setRecord] = useState<RecordType | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

  const { showToast } = useToast()
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null)

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [newArrayItem, setNewArrayItem] = useState<string>('')
  const [showAddLink, setShowAddLink] = useState(false)
  const [newLink, setNewLink] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setEditData(JSON.stringify(data.data_json, null, 2))
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setActionLoading(true)
    try {
      await fetch(`/api/review/${params.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      showToast('Record erfolgreich genehmigt', 'success')
      fetchRecord()
    } catch (err) {
      showToast('Fehler beim Genehmigen', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    setRejectModalOpen(true)
  }

  const confirmReject = async () => {
    setRejectModalOpen(false)
    setActionLoading(true)
    try {
      await fetch(`/api/review/${params.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined })
      })
      showToast('Record abgelehnt', 'warning')
      setRejectReason('')
      fetchRecord()
    } catch (err) {
      showToast('Fehler beim Ablehnen', 'error')
    } finally {
      setActionLoading(false)
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
      } else {
        showToast('Änderungen gespeichert', 'success')
        setEditing(false)
        fetchRecord()
      }
    } catch (err) {
      showToast('Ungültiges JSON', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Update a single field
  const updateField = async (fieldName: string, value: any) => {
    if (!record) return
    const newData = { ...record.data_json, [fieldName]: value }
    try {
      await fetch(`/api/review/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_json: newData })
      })
      fetchRecord()
    } catch (err) {
      console.error('Fehler beim Speichern:', err)
    }
  }

  // Save inline edit for a text field
  const saveFieldEdit = async () => {
    if (!editingField) return
    await updateField(editingField, editingValue)
    setEditingField(null)
    setEditingValue('')
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

  // Add item to array field
  const addArrayItem = async (fieldName: string, item: string) => {
    if (!record || !item.trim()) return
    const currentArray = (record.data_json[fieldName] as string[]) || []
    await updateField(fieldName, [...currentArray, item.trim()])
    setNewArrayItem('')
  }

  // Remove item from array field
  const removeArrayItem = async (fieldName: string, index: number) => {
    if (!record) return
    const currentArray = (record.data_json[fieldName] as string[]) || []
    const newArray = currentArray.filter((_, i) => i !== index)
    await updateField(fieldName, newArray)
  }

  // Add link
  const addLink = async () => {
    if (!record || !newLink.trim()) return
    const currentLinks = record.data_json.links || []
    await updateField('links', [...currentLinks, newLink.trim()])
    setNewLink('')
    setShowAddLink(false)
  }

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      const res = await fetch(`/api/review/${params.id}/attachments`, {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        showToast('Dateien hochgeladen', 'success')
        fetchRecord()
      } else {
        showToast('Fehler beim Hochladen', 'error')
      }
    } catch (err) {
      showToast('Fehler beim Hochladen', 'error')
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Delete attachment
  const deleteAttachment = async (attachmentId: string) => {
    setDeleteAttachmentId(attachmentId)
    setDeleteModalOpen(true)
  }

  const confirmDeleteAttachment = async () => {
    if (!deleteAttachmentId) return
    setDeleteModalOpen(false)
    try {
      await fetch(`/api/review/${params.id}/attachments/${deleteAttachmentId}`, {
        method: 'DELETE'
      })
      showToast('Anhang gelöscht', 'success')
      fetchRecord()
    } catch (err) {
      showToast('Fehler beim Löschen', 'error')
    }
    setDeleteAttachmentId(null)
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
          Record nicht gefunden
        </div>
      </div>
    )
  }

  const data = record.data_json
  const title = data?.title || data?.name || data?.question || record.primary_key.split('|')[0] || 'Unbenannt'
  const isTrainingModule = record.schema_type === 'TrainingModule'
  const isFAQ = record.schema_type === 'FAQ'
  const canEditRecord = true
  const productCode = data?.artnr || data?.product_code
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
  const featureItemsField = isTrainingModule ? 'key_points' : (Array.isArray(data?.features) ? 'features' : 'features')
  const featureItemsAreDerived = !Array.isArray(data?.features) && Array.isArray(data?.specs?.Merkmale)
  const canEditFeatureItems = canEditRecord && (isTrainingModule || Array.isArray(data?.features) || (!isFAQ && !featureItemsAreDerived))
  const featureItemsTitle = isTrainingModule ? 'Kernaussagen & Verkaufsargumente' : 'Merkmale & Besonderheiten'

  // Fields to skip in "other fields" section
  const handledFields = ['title', 'name', 'description', 'content', 'version', 'artnr', 'product_code',
    'product_category', 'kabeltypen', 'compatibility', 'related_products', 'anwendung', 'objectives', 'features',
    'key_points', 'medien', 'question', 'answer', 'warnings', '_source_section', '_source', 'source', 'links']

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
        <div className="flex items-start sm:items-center">
          <button
            onClick={() => router.back()}
            className="mr-3 sm:mr-4 p-2 hover:bg-gray-100 rounded-lg shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                {schemaLabels[record.schema_type] || record.schema_type}
              </span>
              <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                {departmentLabels[record.department] || record.department}
              </span>
              <StatusBadge status={record.status as any} />
              <span className={`px-2 py-1 border rounded text-xs font-medium ${sourceBadgeClass(source.source_kind)}`}>
                {source.label}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{title}</h1>
            {productCode && (
              <div className="flex items-center text-blue-600 font-mono mt-1 text-sm">
                <Tag className="w-4 h-4 mr-1 shrink-0" />
                <span className="truncate">Produktcode: {productCode}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {record.status !== 'approved' && record.status !== 'rejected' && (
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="flex-1 sm:flex-none flex items-center justify-center px-3 sm:px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 text-sm sm:text-base"
            >
              <XCircle className="w-4 h-4 mr-1.5 sm:mr-2" />
              Ablehnen
            </button>
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="flex-1 sm:flex-none flex items-center justify-center px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm sm:text-base"
            >
              <CheckCircle className="w-4 h-4 mr-1.5 sm:mr-2" />
              Genehmigen
            </button>
          </div>
        )}
      </div>

      {/* Mobile Quick Info */}
      <div className="lg:hidden flex items-center gap-4 mb-4 p-4 bg-white rounded-xl border border-gray-200">
        <div className="flex-1">
          <p className="text-xs text-gray-500 mb-1">{SCHEMA_COVERAGE_LABEL}</p>
          <div className="flex items-center gap-2">
            <CompletenessBar score={record.completeness_score} size="sm" />
            <span className="text-sm font-semibold">{formatSchemaCoverage(record.completeness_score)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Belege</p>
          <span className="text-sm font-semibold">{record.evidence_items?.length || 0}</span>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Dokumentstand</p>
          <span className="text-sm font-semibold">{data?.version || '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {(primaryTextValue || !isFAQ || editingField === primaryTextField) && (
            <ContentCard
              title={primaryTextTitle}
              icon={<FileText className="w-5 h-5" />}
              onEdit={() => {
                setEditingField(primaryTextField)
                setEditingValue(rawPrimaryTextValue)
              }}
              canEdit={canEditRecord}
            >
              {editingField === primaryTextField ? (
                <div>
                  <textarea
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-700"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setEditingField(null)}
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
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {primaryTextValue}
                </p>
              ) : (
                <p className="text-gray-400 italic">Kein Inhalt vorhanden. Klicken Sie zum Hinzufügen.</p>
              )}
            </ContentCard>
          )}

          {/* Related items */}
          {(relatedItems.length > 0 || (!isFAQ && canEditRecord)) && (
            <ContentCard
            title={relatedItemsTitle}
            icon={isTrainingModule ? <Package className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            canEdit={canEditRecord}
            >
            <div className="flex flex-wrap gap-2">
              {relatedItems.map((item, i) => (
                <span key={i} className="group px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium flex items-center gap-2">
                  {item}
                  {canEditRecord && (
                    <button
                      onClick={() => removeArrayItem(relatedItemsField, i)}
                      className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {canEditRecord && (
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
                    className="px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm w-40 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
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
            </ContentCard>
          )}

          {/* Application Steps */}
          {stepItems.length > 0 && (
            <ContentCard
            title={stepItemsTitle}
            icon={<List className="w-5 h-5" />}
            canEdit={canEditRecord}
            >
            <ol className="space-y-3">
              {stepItems.map((step, i) => (
                <li key={i} className="flex items-start group">
                  <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5 flex-1">{step}</span>
                  {canEditRecord && (
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
            {canEditRecord && (
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
            </ContentCard>
          )}

          {/* Features */}
          {(featureItems.length > 0 || (!isFAQ && canEditFeatureItems)) && (
            <ContentCard
            title={featureItemsTitle}
            icon={<CheckCircle className="w-5 h-5" />}
            canEdit={canEditFeatureItems}
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
            </ContentCard>
          )}

          {/* Warnings */}
          {data?.warnings && data.warnings.length > 0 && (
            <ContentCard title="Warnhinweise" icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} variant="warning">
              <ul className="space-y-2">
                {data.warnings.map((warning, i) => (
                  <li key={i} className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-amber-800">{warning}</span>
                  </li>
                ))}
              </ul>
            </ContentCard>
          )}

          {/* Media */}
          {data?.medien && data.medien.length > 0 && (
            <ContentCard title="Medien & Dateien" icon={<ImageIcon className="w-5 h-5" />}>
              <div className="flex flex-wrap gap-2">
                {data.medien.map((media, i) => (
                  <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-mono">
                    {media}
                  </span>
                ))}
              </div>
            </ContentCard>
          )}

          {/* FAQ */}
          {data?.question && data?.answer && (
            <ContentCard title="FAQ" icon={<Info className="w-5 h-5" />}>
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase text-gray-500 mb-1">Frage</p>
                  <p className="text-gray-900 font-medium">{data.question}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500 mb-1">Antwort</p>
                  <p className="text-gray-700 whitespace-pre-line">{displayText(data.answer, source)}</p>
                </div>
              </div>
            </ContentCard>
          )}

          {/* Links */}
          <ContentCard
            title="Links & Verweise"
            icon={<LinkIcon className="w-5 h-5" />}
            canEdit={canEditRecord}
          >
            <div className="space-y-2">
              {(data?.links || []).map((link, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 hover:underline flex items-center gap-2 text-sm truncate flex-1"
                  >
                    <LinkIcon className="w-4 h-4 flex-shrink-0" />
                    {link}
                  </a>
                  {canEditRecord && (
                    <button
                      onClick={() => removeArrayItem('links', i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {(!data?.links || data.links.length === 0) && !showAddLink && (
                <p className="text-gray-400 text-sm italic">Keine Links vorhanden</p>
              )}
              {canEditRecord && (
                showAddLink ? (
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newLink.trim()) {
                          addLink()
                        } else if (e.key === 'Escape') {
                          setShowAddLink(false)
                          setNewLink('')
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      autoFocus
                    />
                    <button
                      onClick={addLink}
                      disabled={!newLink.trim()}
                      className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setShowAddLink(false)
                        setNewLink('')
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddLink(true)}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 pt-2"
                  >
                    <Plus className="w-4 h-4" />
                    Link hinzufügen
                  </button>
                )
              )}
            </div>
          </ContentCard>

          {/* File Attachments */}
          <ContentCard
            title="Anhänge & Dateien"
            icon={<Upload className="w-5 h-5" />}
            canEdit={canEditRecord}
          >
            <div className="space-y-3">
              {(record.attachments || []).map((att) => (
                <div key={att.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group">
                  {att.file_type.startsWith('image/') ? (
                    <img
                      src={att.url}
                      alt={att.filename}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{att.filename}</p>
                    <p className="text-xs text-gray-500">{att.file_type}</p>
                  </div>
                  {canEditRecord && (
                    <button
                      onClick={() => deleteAttachment(att.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {(!record.attachments || record.attachments.length === 0) && (
                <p className="text-gray-400 text-sm italic">Keine Anhänge vorhanden</p>
              )}
              {canEditRecord && (
                <div className="pt-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-500 hover:text-primary-600 w-full justify-center"
                  >
                    <Upload className="w-4 h-4" />
                    Dateien hochladen (Bilder, PDFs, Dokumente)
                  </button>
                </div>
              )}
            </div>
          </ContentCard>

          {/* Other fields - Display ALL remaining fields in user-friendly format */}
        {Object.entries(data || {}).filter(([key]) => !handledFields.includes(key) && !isTechnicalSourceField(key)).map(([key, value]) => {
            // Skip empty values but keep "false" and "0"
            if (value === null || value === undefined || value === '' ||
                (Array.isArray(value) && value.length === 0)) return null

            // Format the label nicely
            const label = getFieldLabel(key)

            return (
              <ContentCard
                key={key}
                title={label}
                icon={<Info className="w-5 h-5" />}
                canEdit={canEditRecord}
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
                ) : (
                  <FieldValue fieldKey={key} value={value} source={source} />
                )}
              </ContentCard>
            )
          })}

          {/* Raw JSON Toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center text-sm text-gray-500 hover:text-gray-700"
            >
              <Code className="w-4 h-4 mr-2" />
              {showRawJson ? 'Raw JSON ausblenden' : 'Raw JSON anzeigen / bearbeiten'}
            </button>

            {showRawJson && (
              <div className="mt-4">
                {editing ? (
                  <div>
                    <textarea
                      value={editData}
                      onChange={(e) => setEditData(e.target.value)}
                      className="w-full h-96 font-mono text-sm p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => {
                          setEditing(false)
                          setEditData(JSON.stringify(record.data_json, null, 2))
                        }}
                        className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Abbrechen
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={actionLoading}
                        className="flex items-center px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Speichern
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-auto max-h-96">
                      {JSON.stringify(record.data_json, null, 2)}
                    </pre>
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center text-sm text-primary-600 hover:text-primary-700 mt-3"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Bearbeiten
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <SourceOverview source={source} />
        </div>

        {/* Sidebar - 1/3 */}
        <div className="space-y-6">
          {/* Completeness */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {SCHEMA_COVERAGE_LABEL}
            </h3>
            <CompletenessBar score={record.completeness_score} showLabel size="lg" />
            <p className="text-sm text-gray-500 mt-2">
              {formatSchemaCoverageSummary(record.completeness_score)}
            </p>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              {SCHEMA_COVERAGE_EXPLANATION}
            </p>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Metadaten
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Abteilung</dt>
                <dd className="font-medium text-gray-900">
                  {departmentLabels[record.department] || record.department}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Schema-Typ</dt>
                <dd className="font-medium text-gray-900 font-mono text-xs">
                  {record.schema_type}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Dokumentstand</dt>
                <dd className="font-medium text-gray-900">{data?.version || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Datensatz-Version</dt>
                <dd className="font-medium text-gray-900">{record.version}</dd>
              </div>
            </dl>
          </div>

          {/* Evidence */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Quellenbelege ({record.evidence_items?.length || 0})
            </h3>
            {!record.evidence_items || record.evidence_items.length === 0 ? (
              <p className="text-gray-500 text-sm">Keine Quellenbelege</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-auto">
                {record.evidence_items.map((ev) => (
                  <div key={ev.id} className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-xs font-medium text-primary-600 uppercase">
                      {getFieldLabel(ev.field_path)}
                    </span>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-3">
                    &ldquo;{displayExcerpt(ev.excerpt, 180, source)}&rdquo;
                  </p>
                </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      <ConfirmModal
        open={rejectModalOpen}
        title="Record ablehnen"
        message="Möchten Sie diesen Record wirklich ablehnen?"
        confirmLabel="Ablehnen"
        variant="danger"
        onConfirm={confirmReject}
        onCancel={() => { setRejectModalOpen(false); setRejectReason('') }}
        showReason
        reason={rejectReason}
        onReasonChange={setRejectReason}
        reasonPlaceholder="Grund für Ablehnung (optional)"
      />

      {/* Delete Attachment Modal */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Anhang löschen"
        message="Möchten Sie diesen Anhang wirklich löschen?"
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={confirmDeleteAttachment}
        onCancel={() => { setDeleteModalOpen(false); setDeleteAttachmentId(null) }}
      />
    </div>
  )
}

function SourceOverview({ source }: { source: SourceMetadata }) {
  const importedAt = source.imported_at || source.document_uploaded_at
  const sourceTarget = source.source_url || source.api_endpoint
  const sourceTargetIsLink = isHttpUrl(sourceTarget)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
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
    </div>
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

// Content Card Component
function ContentCard({
  title,
  icon,
  children,
  variant = 'default',
  onEdit,
  canEdit = false
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  variant?: 'default' | 'warning'
  onEdit?: () => void
  canEdit?: boolean
}) {
  const bgColor = variant === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'

  return (
    <div className={`overflow-hidden rounded-xl border p-4 sm:p-5 ${bgColor}`}>
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className={variant === 'warning' ? 'text-amber-500' : 'text-gray-400'}>
            {icon}
          </span>
          <h2 className="min-w-0 font-semibold text-gray-900 text-sm sm:text-base break-words [overflow-wrap:anywhere]">{title}</h2>
        </div>
        {canEdit && onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
            title="Bearbeiten"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// FieldValue Component - Renders any field value in user-friendly format
function FieldValue({ fieldKey, value, source }: { fieldKey: string; value: any; source?: SourceMetadata | null }) {
  // Check if it's an image filename
  const isImageFile = (str: string) =>
    /\.(jpg|jpeg|png|gif|webp|svg|tif|tiff|bmp)$/i.test(str)

  // Check if it's a URL
  const isUrl = (str: string) =>
    /^https?:\/\//i.test(str) || str.startsWith('www.')

  // Check if it's a PDF or document
  const isDocument = (str: string) =>
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i.test(str)

  // Render a single value
  const renderValue = (val: any, index?: number): React.ReactNode => {
    if (val === null || val === undefined) return null

    const strVal = String(val)

    // Image file
    if (typeof val === 'string' && isImageFile(val)) {
      return (
        <div key={index} className="flex min-w-0 items-center gap-2 p-2 bg-blue-50 rounded-lg">
          <ImageIcon className="w-5 h-5 text-blue-500" />
          <span className="min-w-0 text-blue-700 font-mono text-sm break-all [overflow-wrap:anywhere]">{val}</span>
        </div>
      )
    }

    // URL
    if (typeof val === 'string' && isUrl(val)) {
      return (
        <a
          key={index}
          href={val.startsWith('http') ? val : `https://${val}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 max-w-full items-center gap-2 text-primary-600 hover:text-primary-700 hover:underline break-all [overflow-wrap:anywhere]"
        >
          <LinkIcon className="w-4 h-4 shrink-0" />
          {val}
        </a>
      )
    }

    // Document file
    if (typeof val === 'string' && isDocument(val)) {
      return (
        <div key={index} className="flex min-w-0 items-center gap-2 p-2 bg-gray-100 rounded-lg">
          <FileText className="w-5 h-5 text-gray-500" />
          <span className="min-w-0 text-gray-700 font-mono text-sm break-all [overflow-wrap:anywhere]">{val}</span>
        </div>
      )
    }

    // Boolean
    if (typeof val === 'boolean') {
      return (
        <span key={index} className={`flex min-w-0 items-center gap-2 ${val ? 'text-green-600' : 'text-gray-500'}`}>
          {val ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {val ? 'Ja' : 'Nein'}
        </span>
      )
    }

    // Number
    if (typeof val === 'number') {
      return <span key={index} className="font-medium text-gray-900">{val}</span>
    }

    // Object (nested)
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return (
        <div key={index} className="min-w-0 max-w-full overflow-hidden bg-gray-50 rounded-lg p-4 space-y-3">
          {Object.entries(val).filter(([k]) => !isTechnicalSourceField(k) && !(fieldKey === 'specs' && k === 'Merkmale')).map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
              <span className="text-sm font-medium text-gray-500 sm:min-w-[120px] sm:max-w-[180px] break-words">
                {getFieldLabel(k)}:
              </span>
              <span className="min-w-0 max-w-full text-gray-700 flex-1 break-words [overflow-wrap:anywhere]">{renderValue(v)}</span>
            </div>
          ))}
        </div>
      )
    }

    // Default: String
    return <span key={index} className="min-w-0 max-w-full whitespace-pre-line text-gray-700 break-words [overflow-wrap:anywhere]">{displayText(strVal, source)}</span>
  }

  // Array of values
  if (Array.isArray(value)) {
    // Check if it's an array of objects
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      return (
        <div className="space-y-3">
          {value.map((item, i) => (
            <div key={i} className="min-w-0 max-w-full overflow-hidden bg-gray-50 rounded-lg p-4">
              {typeof item === 'object' ? (
                Object.entries(item).filter(([k]) => !isTechnicalSourceField(k) && !(fieldKey === 'specs' && k === 'Merkmale')).map(([k, v]) => (
                  <div key={k} className="flex min-w-0 flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 mb-2 last:mb-0">
                    <span className="text-sm font-medium text-gray-500 sm:min-w-[120px] sm:max-w-[180px] break-words">
                      {getFieldLabel(k)}:
                    </span>
                    <span className="min-w-0 max-w-full text-gray-700 flex-1 break-words [overflow-wrap:anywhere]">{renderValue(v)}</span>
                  </div>
                ))
              ) : (
                renderValue(item, i)
              )}
            </div>
          ))}
        </div>
      )
    }

    // Array of image files
    if (value.some(v => typeof v === 'string' && isImageFile(v))) {
      return (
        <div className="flex flex-wrap gap-2">
          {value.map((item, i) => (
            <div key={i} className="flex min-w-0 items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <ImageIcon className="w-5 h-5 text-blue-500" />
              <span className="min-w-0 text-blue-700 font-mono text-sm break-all [overflow-wrap:anywhere]">{item}</span>
            </div>
          ))}
        </div>
      )
    }

    // Array of simple strings/values
    const displayItems = value.filter((item) => isUsefulDisplayValue(item, source))
    if (displayItems.length === 0) {
      return <p className="text-gray-400 italic">Keine verwertbaren Werte vorhanden.</p>
    }
    return (
      <ul className="space-y-2">
        {displayItems.map((item, i) => (
          <li key={i} className="flex min-w-0 items-start gap-2">
            <span className="text-primary-500 mt-1">•</span>
            <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">{renderValue(item)}</span>
          </li>
        ))}
      </ul>
    )
  }

  // Single value
  return <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">{renderValue(value)}</div>
}
