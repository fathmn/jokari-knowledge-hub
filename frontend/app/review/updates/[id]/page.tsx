'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, XCircle, Plus, Minus, RefreshCw } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'

interface ProposedUpdate {
  id: string
  record_id: string
  new_data_json: any
  diff_json: {
    added: Record<string, any>
    removed: Record<string, any>
    changed: Record<string, { old: any; new: any }>
    unchanged: Record<string, any>
  }
  status: string
  created_at: string
}

export default function UpdateDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [update, setUpdate] = useState<ProposedUpdate | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchUpdate()
    }
  }, [params.id])

  const fetchUpdate = async () => {
    try {
      const res = await fetch(`/api/review/updates/${params.id}`)
      const data = await res.json()
      setUpdate(data)
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setActionLoading(true)
    try {
      await fetch(`/api/review/updates/${params.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'user' })
      })
      router.push('/review')
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
      await fetch(`/api/review/updates/${params.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'user', reason })
      })
      router.push('/review')
    } catch (err) {
      console.error('Fehler:', err)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!update) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Update nicht gefunden
        </div>
      </div>
    )
  }

  const { diff_json } = update

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
        <div className="flex items-center">
          <button
            onClick={() => router.back()}
            className="mr-3 sm:mr-4 p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Update-Vorschlag</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={update.status as any} />
            </div>
          </div>
        </div>

        {/* Actions */}
        {update.status === 'pending' && (
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
              <span className="hidden sm:inline">Update anwenden</span>
              <span className="sm:hidden">Anwenden</span>
            </button>
          </div>
        )}
      </div>

      {/* Diff View */}
      <div className="space-y-6">
        {/* Added fields */}
        {Object.keys(diff_json.added).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-green-700 mb-3 sm:mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2" />
              Neue Felder
            </h2>
            <div className="space-y-2">
              {Object.entries(diff_json.added).map(([field, value]) => (
                <div key={field} className="bg-green-50 rounded-lg p-3">
                  <span className="font-mono text-sm text-green-800">{field}:</span>
                  <span className="ml-2 text-sm text-green-700">
                    {JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Removed fields */}
        {Object.keys(diff_json.removed).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-red-700 mb-3 sm:mb-4 flex items-center">
              <Minus className="w-5 h-5 mr-2" />
              Entfernte Felder
            </h2>
            <div className="space-y-2">
              {Object.entries(diff_json.removed).map(([field, value]) => (
                <div key={field} className="bg-red-50 rounded-lg p-3">
                  <span className="font-mono text-sm text-red-800">{field}:</span>
                  <span className="ml-2 text-sm text-red-700 line-through">
                    {JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Changed fields */}
        {Object.keys(diff_json.changed).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-yellow-700 mb-3 sm:mb-4 flex items-center">
              <RefreshCw className="w-5 h-5 mr-2" />
              Geänderte Felder
            </h2>
            <div className="space-y-4">
              {Object.entries(diff_json.changed).map(([field, change]) => (
                <div key={field} className="bg-yellow-50 rounded-lg p-3">
                  <div className="font-mono text-sm text-yellow-800 mb-2">{field}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <span className="text-xs text-gray-500">Alt:</span>
                      <div className="text-sm text-red-600 line-through bg-red-50 p-2 rounded mt-1 break-words">
                        {JSON.stringify(change.old)}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Neu:</span>
                      <div className="text-sm text-green-600 bg-green-50 p-2 rounded mt-1 break-words">
                        {JSON.stringify(change.new)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unchanged fields */}
        {Object.keys(diff_json.unchanged).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">
              Unveränderte Felder
            </h2>
            <div className="space-y-2">
              {Object.entries(diff_json.unchanged).map(([field, value]) => (
                <div key={field} className="bg-gray-50 rounded-lg p-3">
                  <span className="font-mono text-sm text-gray-600">{field}:</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
