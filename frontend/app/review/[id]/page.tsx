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
    artnr?: string
    kabeltypen?: string[]
    anwendung?: string[]
    features?: string[]
    medien?: string[]
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

const fieldLabels: { [key: string]: string } = {
  title: 'Titel',
  name: 'Name',
  description: 'Beschreibung',
  content: 'Inhalt',
  artnr: 'Artikelnummer',
  kabeltypen: 'Kabeltypen',
  anwendung: 'Anwendungsschritte',
  features: 'Merkmale',
  medien: 'Medien',
  question: 'Frage',
  answer: 'Antwort',
  warnings: 'Warnhinweise',
  objectives: 'Lernziele',
  target_audience: 'Zielgruppe',
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

export default function RecordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [record, setRecord] = useState<RecordType | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

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
        body: JSON.stringify({ actor: 'user' })
      })
      fetchRecord()
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt('Grund für Ablehnung (optional):')
    setActionLoading(true)
    try {
      await fetch(`/api/review/${params.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'user', reason })
      })
      fetchRecord()
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    try {
      const parsed = JSON.parse(editData)
      setActionLoading(true)
      await fetch(`/api/review/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_json: parsed })
      })
      setEditing(false)
      fetchRecord()
    } catch (err) {
      alert('Ungültiges JSON')
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
        fetchRecord()
      } else {
        alert('Fehler beim Hochladen')
      }
    } catch (err) {
      console.error('Upload-Fehler:', err)
      alert('Fehler beim Hochladen')
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Delete attachment
  const deleteAttachment = async (attachmentId: string) => {
    if (!confirm('Datei wirklich löschen?')) return
    try {
      await fetch(`/api/review/${params.id}/attachments/${attachmentId}`, {
        method: 'DELETE'
      })
      fetchRecord()
    } catch (err) {
      console.error('Lösch-Fehler:', err)
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
          Record nicht gefunden
        </div>
      </div>
    )
  }

  const data = record.data_json
  const title = data?.title || data?.name || data?.question || record.primary_key.split('|')[0] || 'Unbenannt'

  // Fields to skip in "other fields" section
  const handledFields = ['title', 'name', 'description', 'content', 'artnr', 'kabeltypen',
    'anwendung', 'features', 'medien', 'question', 'answer', 'warnings', '_source_section', 'links']

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <button
            onClick={() => router.back()}
            className="mr-4 p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                {schemaLabels[record.schema_type] || record.schema_type}
              </span>
              <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                {departmentLabels[record.department] || record.department}
              </span>
              <StatusBadge status={record.status as any} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {data?.artnr && (
              <div className="flex items-center text-blue-600 font-mono mt-1">
                <Tag className="w-4 h-4 mr-1" />
                Artikelnummer: {data.artnr}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {record.status !== 'approved' && record.status !== 'rejected' && (
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Ablehnen
            </button>
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Genehmigen
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <ContentCard
            title="Beschreibung"
            icon={<FileText className="w-5 h-5" />}
            onEdit={() => {
              setEditingField('description')
              setEditingValue(data?.description || '')
            }}
            canEdit={record.status !== 'approved'}
          >
            {editingField === 'description' ? (
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
            ) : data?.description ? (
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                {data.description}
              </p>
            ) : (
              <p className="text-gray-400 italic">Keine Beschreibung vorhanden. Klicken Sie zum Hinzufügen.</p>
            )}
          </ContentCard>

          {/* Cable Types */}
          <ContentCard
            title="Kompatible Kabeltypen"
            icon={<Wrench className="w-5 h-5" />}
            canEdit={record.status !== 'approved'}
          >
            <div className="flex flex-wrap gap-2">
              {(data?.kabeltypen || []).map((kabel, i) => (
                <span key={i} className="group px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium flex items-center gap-2">
                  {kabel}
                  {record.status !== 'approved' && (
                    <button
                      onClick={() => removeArrayItem('kabeltypen', i)}
                      className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {record.status !== 'approved' && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Neuer Kabeltyp..."
                    value={editingField === 'kabeltypen' ? newArrayItem : ''}
                    onFocus={() => setEditingField('kabeltypen')}
                    onChange={(e) => setNewArrayItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newArrayItem.trim()) {
                        addArrayItem('kabeltypen', newArrayItem)
                      }
                    }}
                    className="px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-sm w-40 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                  {newArrayItem.trim() && editingField === 'kabeltypen' && (
                    <button
                      onClick={() => addArrayItem('kabeltypen', newArrayItem)}
                      className="p-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </ContentCard>

          {/* Application Steps */}
          <ContentCard
            title="Anwendungsschritte"
            icon={<List className="w-5 h-5" />}
            canEdit={record.status !== 'approved'}
          >
            <ol className="space-y-3">
              {(data?.anwendung || []).map((step, i) => (
                <li key={i} className="flex items-start group">
                  <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5 flex-1">{step}</span>
                  {record.status !== 'approved' && (
                    <button
                      onClick={() => removeArrayItem('anwendung', i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {record.status !== 'approved' && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                <span className="flex-shrink-0 w-7 h-7 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center text-sm">
                  {(data?.anwendung?.length || 0) + 1}
                </span>
                <input
                  type="text"
                  placeholder="Neuen Schritt hinzufügen..."
                  value={editingField === 'anwendung' ? newArrayItem : ''}
                  onFocus={() => setEditingField('anwendung')}
                  onChange={(e) => setNewArrayItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newArrayItem.trim()) {
                      addArrayItem('anwendung', newArrayItem)
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {newArrayItem.trim() && editingField === 'anwendung' && (
                  <button
                    onClick={() => addArrayItem('anwendung', newArrayItem)}
                    className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </ContentCard>

          {/* Features */}
          <ContentCard
            title="Merkmale & Besonderheiten"
            icon={<CheckCircle className="w-5 h-5" />}
            canEdit={record.status !== 'approved'}
          >
            <ul className="space-y-2">
              {(data?.features || []).map((feature, i) => (
                <li key={i} className="flex items-start group">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 flex-1">{feature}</span>
                  {record.status !== 'approved' && (
                    <button
                      onClick={() => removeArrayItem('features', i)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {record.status !== 'approved' && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                <CheckCircle className="w-5 h-5 text-gray-300 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Neues Merkmal hinzufügen..."
                  value={editingField === 'features' ? newArrayItem : ''}
                  onFocus={() => setEditingField('features')}
                  onChange={(e) => setNewArrayItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newArrayItem.trim()) {
                      addArrayItem('features', newArrayItem)
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
                {newArrayItem.trim() && editingField === 'features' && (
                  <button
                    onClick={() => addArrayItem('features', newArrayItem)}
                    className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </ContentCard>

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
                  <p className="text-gray-700">{data.answer}</p>
                </div>
              </div>
            </ContentCard>
          )}

          {/* Links */}
          <ContentCard
            title="Links & Verweise"
            icon={<LinkIcon className="w-5 h-5" />}
            canEdit={record.status !== 'approved'}
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
                  {record.status !== 'approved' && (
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
              {record.status !== 'approved' && (
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
            canEdit={record.status !== 'approved'}
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
                  {record.status !== 'approved' && (
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
              {record.status !== 'approved' && (
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
          {Object.entries(data || {}).filter(([key]) => !handledFields.includes(key)).map(([key, value]) => {
            // Skip empty values but keep "false" and "0"
            if (value === null || value === undefined || value === '' ||
                (Array.isArray(value) && value.length === 0)) return null

            // Format the label nicely
            const label = fieldLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

            return (
              <ContentCard key={key} title={label} icon={<Info className="w-5 h-5" />}>
                <FieldValue fieldKey={key} value={value} />
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
        </div>

        {/* Sidebar - 1/3 */}
        <div className="space-y-6">
          {/* Completeness */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Vollständigkeit
            </h3>
            <CompletenessBar score={record.completeness_score} showLabel size="lg" />
            <p className="text-sm text-gray-500 mt-2">
              {Math.round(record.completeness_score * 100)}% der Pflichtfelder ausgefüllt
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
                <dt className="text-gray-500">Version</dt>
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
                      {fieldLabels[ev.field_path] || ev.field_path}
                    </span>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-3">
                      &ldquo;{ev.excerpt}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
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
    <div className={`rounded-xl border p-5 ${bgColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={variant === 'warning' ? 'text-amber-500' : 'text-gray-400'}>
            {icon}
          </span>
          <h2 className="font-semibold text-gray-900">{title}</h2>
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
function FieldValue({ fieldKey, value }: { fieldKey: string; value: any }) {
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
        <div key={index} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
          <ImageIcon className="w-5 h-5 text-blue-500" />
          <span className="text-blue-700 font-mono text-sm">{val}</span>
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
          className="flex items-center gap-2 text-primary-600 hover:text-primary-700 hover:underline"
        >
          <LinkIcon className="w-4 h-4" />
          {val}
        </a>
      )
    }

    // Document file
    if (typeof val === 'string' && isDocument(val)) {
      return (
        <div key={index} className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
          <FileText className="w-5 h-5 text-gray-500" />
          <span className="text-gray-700 font-mono text-sm">{val}</span>
        </div>
      )
    }

    // Boolean
    if (typeof val === 'boolean') {
      return (
        <span key={index} className={`flex items-center gap-2 ${val ? 'text-green-600' : 'text-gray-500'}`}>
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
        <div key={index} className="bg-gray-50 rounded-lg p-4 space-y-3">
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
              <span className="text-sm font-medium text-gray-500 min-w-[120px]">
                {fieldLabels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
              </span>
              <span className="text-gray-700 flex-1">{renderValue(v)}</span>
            </div>
          ))}
        </div>
      )
    }

    // Default: String
    return <span key={index} className="text-gray-700">{strVal}</span>
  }

  // Array of values
  if (Array.isArray(value)) {
    // Check if it's an array of objects
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      return (
        <div className="space-y-3">
          {value.map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4">
              {typeof item === 'object' ? (
                Object.entries(item).map(([k, v]) => (
                  <div key={k} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 mb-2 last:mb-0">
                    <span className="text-sm font-medium text-gray-500 min-w-[120px]">
                      {fieldLabels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                    </span>
                    <span className="text-gray-700 flex-1">{renderValue(v)}</span>
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
            <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <ImageIcon className="w-5 h-5 text-blue-500" />
              <span className="text-blue-700 font-mono text-sm">{item}</span>
            </div>
          ))}
        </div>
      )
    }

    // Array of simple strings/values
    return (
      <ul className="space-y-2">
        {value.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-primary-500 mt-1">•</span>
            {renderValue(item)}
          </li>
        ))}
      </ul>
    )
  }

  // Single value
  return <div>{renderValue(value)}</div>
}
