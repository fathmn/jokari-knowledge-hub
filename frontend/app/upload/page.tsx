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
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dokumente hochladen</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
            transition-colors
            ${isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }
          `}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          {isDragActive ? (
            <p className="text-primary-600 font-medium">Dateien hier ablegen...</p>
          ) : (
            <>
              <p className="text-gray-600 font-medium">
                Dateien hierher ziehen oder klicken zum Auswählen
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Unterstützt: DOCX, DOC, MD, CSV, XLSX, PDF
              </p>
            </>
          )}
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-4">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-gray-400 mr-3" />
                  <span className="text-sm text-gray-900">{file.name}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Metadata Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadaten</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Abteilung *
              </label>
              <select
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value)
                  setDocType('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dokumenttyp *
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Versionsdatum *
              </label>
              <input
                type="date"
                value={versionDate}
                onChange={(e) => setVersionDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verantwortlich *
              </label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Name oder E-Mail"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vertraulichkeit
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="internal"
                    checked={confidentiality === 'internal'}
                    onChange={(e) => setConfidentiality(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Intern</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="public"
                    checked={confidentiality === 'public'}
                    onChange={(e) => setConfidentiality(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Öffentlich</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={uploading || files.length === 0}
          className="w-full py-3 px-4 bg-primary-600 text-white font-medium rounded-lg
                     hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                     transition-colors"
        >
          {uploading ? 'Wird hochgeladen...' : 'Hochladen und Verarbeiten'}
        </button>
      </form>

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Ergebnisse</h2>
          {results.map((result, index) => (
            <div
              key={index}
              className={`flex items-center p-4 rounded-lg ${
                result.error
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-green-50 border border-green-200'
              }`}
            >
              {result.error ? (
                <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
              )}
              <div>
                <p className="font-medium text-gray-900">{result.filename}</p>
                {result.error ? (
                  <p className="text-sm text-red-600">{result.error}</p>
                ) : (
                  <p className="text-sm text-green-600">
                    Erfolgreich hochgeladen - Verarbeitung gestartet
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
