'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, ChevronRight, RefreshCw } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

interface Document {
  id: string
  filename: string
  department: string
  doc_type: string
  version_date: string
  owner: string
  status: string
  uploaded_at: string
}

interface DocumentListResponse {
  documents: Document[]
  total: number
  page: number
  pages: number
}

export default function DokumentePage() {
  const [data, setData] = useState<DocumentListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [departmentFilter, setDepartmentFilter] = useState('')

  useEffect(() => {
    fetchDocuments()
  }, [page, departmentFilter])

  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (departmentFilter) params.append('department', departmentFilter)

      const res = await fetch(`/api/documents?${params}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Fehler beim Laden:', err)
    } finally {
      setLoading(false)
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
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dokumente</h1>
        <button
          onClick={fetchDocuments}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Aktualisieren
        </button>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={departmentFilter}
          onChange={(e) => {
            setDepartmentFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Alle Abteilungen</option>
          {Object.entries(departmentLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Document List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : data?.documents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Keine Dokumente gefunden
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Dateiname</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Abteilung</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Typ</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Hochgeladen</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-gray-400 mr-3" />
                      <span className="text-sm font-medium text-gray-900">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {departmentLabels[doc.department] || doc.department}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {docTypeLabels[doc.doc_type] || doc.doc_type}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={doc.status as any} />
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {format(new Date(doc.uploaded_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/dokumente/${doc.id}`}
                      className="text-gray-400 hover:text-primary-600"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
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
          ))}
        </div>
      )}
    </div>
  )
}
