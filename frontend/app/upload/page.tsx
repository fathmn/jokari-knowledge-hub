'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react'

interface DocTypes {
  [department: string]: string[]
}

interface UploadResult {
  document_id?: string
  filename: string
  job_id?: string
  status?: string
  error?: string
}

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [docTypes, setDocTypes] = useState<DocTypes>({})
  const [department, setDepartment] = useState('')
  const [docType, setDocType] = useState('')
  const [versionDate, setVersionDate] = useState('')
  const [owner, setOwner] = useState('')
  const [confidentiality, setConfidentiality] = useState('internal')
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])

  useEffect(() => {
    fetchDocTypes()
  }, [])

  const fetchDocTypes = async () => {
    try {
      const res = await fetch('/api/upload/doc-types')
      const data = await res.json()
      setDocTypes(data)
    } catch (err) {
      console.error('Fehler beim Laden der Dokumenttypen:', err)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/markdown': ['.md'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf'],
    }
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (files.length === 0 || !department || !docType || !versionDate || !owner) {
      return
    }

    setUploading(true)
    setResults([])

    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('department', department)
    formData.append('doc_type', docType)
    formData.append('version_date', new Date(versionDate).toISOString())
    formData.append('owner', owner)
    formData.append('confidentiality', confidentiality)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      setResults(data.results || [])
      if (data.uploaded > 0) {
        setFiles([])
      }
    } catch (err) {
      console.error('Upload-Fehler:', err)
    } finally {
      setUploading(false)
    }
  }

  const departmentLabels: Record<string, string> = {
    sales: 'Vertrieb',
    support: 'Support',
    marketing: 'Marketing',
    product: 'Produkt',
    legal: 'Recht'
  }

  const docTypeLabels: Record<string, string> = {
    training_module: 'Trainingsmodul',
    objection: 'Einwandbehandlung',
    persona: 'Persona',
    pitch_script: 'Pitch-Skript',
    email_template: 'E-Mail-Vorlage',
    faq: 'FAQ',
    troubleshooting_guide: 'Fehlerbehebung',
    how_to_steps: 'Anleitung',
    product_spec: 'Produktspezifikation',
    compatibility_matrix: 'Kompatibilitätsmatrix',
    safety_notes: 'Sicherheitshinweise',
    messaging_pillars: 'Messaging-Pfeiler',
    content_guidelines: 'Content-Richtlinien',
    compliance_notes: 'Compliance-Hinweise',
    claims_do_dont: 'Werbeaussagen Do/Dont',
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 min-h-full">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 lg:mb-10">
          <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 tracking-tight">Dokumente hochladen</h1>
          <p className="text-neutral-500 mt-1 text-sm sm:text-base">Laden Sie Dokumente zur Wissensextraktion hoch</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              card p-6 sm:p-10 text-center cursor-pointer border-2 border-dashed
              transition-all duration-200
              ${isDragActive
                ? 'border-primary-500 bg-primary-50 scale-[1.02]'
                : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-xl sm:rounded-2xl flex items-center justify-center ${
              isDragActive ? 'bg-primary-500' : 'bg-neutral-100'
            }`}>
              <Upload className={`w-6 h-6 sm:w-8 sm:h-8 ${isDragActive ? 'text-neutral-900' : 'text-neutral-400'}`} />
            </div>
            {isDragActive ? (
              <p className="text-neutral-900 font-semibold text-base sm:text-lg">Dateien hier ablegen...</p>
            ) : (
              <>
                <p className="text-neutral-700 font-semibold text-base sm:text-lg">
                  Dateien hierher ziehen
                </p>
                <p className="text-neutral-500 mt-1 text-sm">
                  oder <span className="text-neutral-900 underline">durchsuchen</span>
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
                  {['DOCX', 'PDF', 'MD', 'CSV', 'XLSX'].map((ext) => (
                    <span key={ext} className="px-2 py-0.5 sm:py-1 bg-neutral-100 text-neutral-600 text-xs font-medium rounded">
                      {ext}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="card divide-y divide-neutral-100">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 sm:p-4">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className="p-1.5 sm:p-2 bg-neutral-100 rounded-lg mr-2 sm:mr-3 shrink-0">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-neutral-900 truncate block">{file.name}</span>
                      <span className="text-xs text-neutral-500">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="p-1.5 sm:p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-2"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Metadata Form */}
          <div className="card p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900 mb-4 sm:mb-6">Metadaten</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5 sm:mb-2">
                  Abteilung <span className="text-red-500">*</span>
                </label>
                <select
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value)
                    setDocType('')
                  }}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl
                             focus:ring-2 focus:ring-primary-500 focus:border-transparent
                             text-neutral-900 text-sm"
                  required
                >
                  <option value="">Auswählen...</option>
                  {Object.keys(docTypes).map(dept => (
                    <option key={dept} value={dept}>
                      {departmentLabels[dept] || dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5 sm:mb-2">
                  Dokumenttyp <span className="text-red-500">*</span>
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl
                             focus:ring-2 focus:ring-primary-500 focus:border-transparent
                             text-neutral-900 text-sm disabled:opacity-50"
                  required
                  disabled={!department}
                >
                  <option value="">Auswählen...</option>
                  {department && docTypes[department]?.map(type => (
                    <option key={type} value={type}>
                      {docTypeLabels[type] || type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5 sm:mb-2">
                  Versionsdatum <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={versionDate}
                  onChange={(e) => setVersionDate(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl
                             focus:ring-2 focus:ring-primary-500 focus:border-transparent
                             text-neutral-900 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5 sm:mb-2">
                  Verantwortlich <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Name oder E-Mail"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl
                             focus:ring-2 focus:ring-primary-500 focus:border-transparent
                             text-neutral-900 text-sm placeholder:text-neutral-400"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-neutral-700 mb-2 sm:mb-3">
                  Vertraulichkeit
                </label>
                <div className="flex gap-4 sm:gap-6">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="radio"
                      value="internal"
                      checked={confidentiality === 'internal'}
                      onChange={(e) => setConfidentiality(e.target.value)}
                      className="w-4 h-4 text-neutral-900 border-neutral-300 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-neutral-700 group-hover:text-neutral-900">Intern</span>
                  </label>
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="radio"
                      value="public"
                      checked={confidentiality === 'public'}
                      onChange={(e) => setConfidentiality(e.target.value)}
                      className="w-4 h-4 text-neutral-900 border-neutral-300 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-neutral-700 group-hover:text-neutral-900">Öffentlich</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={uploading || files.length === 0}
            className="w-full py-3 sm:py-3.5 px-4 bg-neutral-900 text-white font-semibold rounded-xl
                       hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400
                       disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Wird hochgeladen...
              </span>
            ) : (
              'Hochladen und Verarbeiten'
            )}
          </button>
        </form>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-6 sm:mt-8 space-y-3">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900">Ergebnisse</h2>
            {results.map((result, index) => (
              <div
                key={index}
                className={`card flex items-start sm:items-center p-3 sm:p-4 ${
                  result.error
                    ? 'bg-red-50 border-red-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div className={`p-1.5 sm:p-2 rounded-lg mr-3 sm:mr-4 shrink-0 ${
                  result.error ? 'bg-red-100' : 'bg-emerald-100'
                }`}>
                  {result.error ? (
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900 text-sm sm:text-base truncate">{result.filename}</p>
                  {result.error ? (
                    <p className="text-xs sm:text-sm text-red-600">{result.error}</p>
                  ) : (
                    <p className="text-xs sm:text-sm text-emerald-600">
                      Erfolgreich hochgeladen - Verarbeitung gestartet
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
