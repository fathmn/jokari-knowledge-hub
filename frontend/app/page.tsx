'use client'

import { useEffect, useState } from 'react'
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import DashboardTile from '@/components/DashboardTile'
import CompletenessBar from '@/components/CompletenessBar'

interface DashboardStats {
  total_documents: number
  pending_reviews: number
  approved_records: number
  rejected_records: number
  completeness_by_department: Record<string, number>
  stale_records: Array<{
    record_id: string
    schema_type: string
    primary_key: string
    age_months: number
  }>
  top_missing_fields: Array<{
    field: string
    count: number
  }>
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats')
      if (!res.ok) throw new Error('Fehler beim Laden der Statistiken')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
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

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  const departmentLabels: Record<string, string> = {
    sales: 'Vertrieb',
    support: 'Support',
    marketing: 'Marketing',
    product: 'Produkt',
    legal: 'Recht'
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <DashboardTile
          title="Dokumente"
          value={stats?.total_documents || 0}
          icon={FileText}
          color="blue"
        />
        <DashboardTile
          title="Ausstehende Reviews"
          value={stats?.pending_reviews || 0}
          icon={Clock}
          color="yellow"
        />
        <DashboardTile
          title="Genehmigte Records"
          value={stats?.approved_records || 0}
          icon={CheckCircle}
          color="green"
        />
        <DashboardTile
          title="Abgelehnte Records"
          value={stats?.rejected_records || 0}
          icon={XCircle}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Completeness by Department */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Vollständigkeit nach Abteilung
          </h2>
          <div className="space-y-4">
            {stats?.completeness_by_department &&
              Object.entries(stats.completeness_by_department).map(([dept, score]) => (
                <div key={dept}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{departmentLabels[dept] || dept}</span>
                    <span className="font-medium">{Math.round(score * 100)}%</span>
                  </div>
                  <CompletenessBar score={score} />
                </div>
              ))
            }
          </div>
        </div>

        {/* Top Missing Fields */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Häufig fehlende Felder
          </h2>
          {stats?.top_missing_fields && stats.top_missing_fields.length > 0 ? (
            <ul className="space-y-3">
              {stats.top_missing_fields.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-mono">{item.field}</span>
                  <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded">
                    {item.count}x fehlt
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Keine fehlenden Felder</p>
          )}
        </div>

        {/* Stale Records */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
            Veraltete Records (älter als 6 Monate)
          </h2>
          {stats?.stale_records && stats.stale_records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-600">Schema</th>
                    <th className="text-left py-2 font-medium text-gray-600">Primary Key</th>
                    <th className="text-left py-2 font-medium text-gray-600">Alter</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.stale_records.map((record) => (
                    <tr key={record.record_id} className="border-b border-gray-100">
                      <td className="py-2 font-mono text-gray-900">{record.schema_type}</td>
                      <td className="py-2 text-gray-600">{record.primary_key}</td>
                      <td className="py-2">
                        <span className="text-yellow-700">{record.age_months} Monate</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Keine veralteten Records</p>
          )}
        </div>
      </div>
    </div>
  )
}
