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
    <div className="p-10 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-[28px] font-semibold text-neutral-900 tracking-tight">Dokumente</h1>
          <p className="text-neutral-500 mt-1">
            {data?.total || 0} Dokumente insgesamt
          </p>
        </div>
        <button
          onClick={fetchDocuments}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700
                     bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50
                     hover:border-neutral-300 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
          className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm
                     text-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">Alle Abteilungen</option>
          {Object.entries(departmentLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Document List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-4 border-neutral-200 border-t-primary-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-neutral-500 mt-4">Lade Dokumente...</p>
          </div>
        ) : data?.documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-500 font-medium">Keine Dokumente gefunden</p>
            <p className="text-sm text-neutral-400 mt-1">Laden Sie ein Dokument hoch, um zu beginnen</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-left py-4 px-5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Dateiname</th>
                <th className="text-left py-4 px-5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Abteilung</th>
                <th className="text-left py-4 px-5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Typ</th>
                <th className="text-left py-4 px-5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-4 px-5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Hochgeladen</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data?.documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-4 px-5">
                    <div className="flex items-center">
                      <div className="p-2 bg-neutral-100 rounded-lg mr-3">
                        <FileText className="w-4 h-4 text-neutral-600" />
                      </div>
                      <span className="text-sm font-medium text-neutral-900">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="py-4 px-5">
                    <span className="text-sm text-neutral-600">
                      {departmentLabels[doc.department] || doc.department}
                    </span>
                  </td>
                  <td className="py-4 px-5">
                    <span className="text-sm text-neutral-600">
                      {docTypeLabels[doc.doc_type] || doc.doc_type}
                    </span>
                  </td>
                  <td className="py-4 px-5">
                    <StatusBadge status={doc.status as any} size="sm" />
                  </td>
                  <td className="py-4 px-5 text-sm text-neutral-500">
                    {format(new Date(doc.uploaded_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  <td className="py-4 px-5">
                    <Link
                      href={`/dokumente/${doc.id}`}
                      className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100
                                 rounded-lg transition-colors inline-flex"
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
        <div className="flex justify-center gap-1 mt-6">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                p === page
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
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
