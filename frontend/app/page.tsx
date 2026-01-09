'use client'

import { useEffect, useState } from 'react'
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react'
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
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Lade Dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-10">
        <div className="card p-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-xl">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-red-900">Fehler beim Laden</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
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
    <div className="p-4 sm:p-6 lg:p-10 min-h-full">
      {/* Header */}
      <div className="mb-6 sm:mb-8 lg:mb-10">
        <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 tracking-tight">Dashboard</h1>
        <p className="text-neutral-500 mt-1 text-sm sm:text-base">Übersicht über Ihre Wissensdatenbank</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 lg:mb-8">
        <DashboardTile
          title="Dokumente"
          value={stats?.total_documents || 0}
          icon={FileText}
          color="primary"
        />
        <DashboardTile
          title="Ausstehende Reviews"
          value={stats?.pending_reviews || 0}
          icon={Clock}
          color="warning"
        />
        <DashboardTile
          title="Genehmigte Records"
          value={stats?.approved_records || 0}
          icon={CheckCircle}
          color="success"
        />
        <DashboardTile
          title="Abgelehnte Records"
          value={stats?.rejected_records || 0}
          icon={XCircle}
          color="danger"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Completeness by Department */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-neutral-900">
              Vollständigkeit nach Abteilung
            </h2>
            <TrendingUp className="w-5 h-5 text-neutral-400" />
          </div>
          <div className="space-y-5">
            {stats?.completeness_by_department &&
              Object.entries(stats.completeness_by_department).map(([dept, score]) => (
                <div key={dept}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-neutral-700">
                      {departmentLabels[dept] || dept}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${
                      score >= 0.8 ? 'text-emerald-600' :
                      score >= 0.5 ? 'text-primary-600' :
                      'text-red-600'
                    }`}>
                      {Math.round(score * 100)}%
                    </span>
                  </div>
                  <CompletenessBar score={score} size="md" />
                </div>
              ))
            }
          </div>
        </div>

        {/* Top Missing Fields */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-neutral-900">
              Häufig fehlende Felder
            </h2>
            <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
              {stats?.top_missing_fields?.length || 0} Felder
            </span>
          </div>
          {stats?.top_missing_fields && stats.top_missing_fields.length > 0 ? (
            <ul className="space-y-3">
              {stats.top_missing_fields.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
                  <code className="text-sm text-neutral-700 font-mono bg-neutral-100 px-2 py-1 rounded">
                    {item.field}
                  </code>
                  <span className="text-sm font-semibold text-amber-600 tabular-nums">
                    {item.count}x
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
              <CheckCircle className="w-12 h-12 mb-3" />
              <p className="text-sm font-medium">Alle Felder ausgefüllt</p>
            </div>
          )}
        </div>

        {/* Stale Records */}
        <div className="card p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  Veraltete Records
                </h2>
                <p className="text-sm text-neutral-500">Älter als 6 Monate</p>
              </div>
            </div>
            {stats?.stale_records && stats.stale_records.length > 0 && (
              <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                {stats.stale_records.length} Records
              </span>
            )}
          </div>
          {stats?.stale_records && stats.stale_records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Schema</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Primary Key</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Alter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stats.stale_records.map((record) => (
                    <tr key={record.record_id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-3 px-4">
                        <code className="text-sm font-mono text-neutral-800 bg-neutral-100 px-2 py-1 rounded">
                          {record.schema_type}
                        </code>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-600">{record.primary_key}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          {record.age_months} Monate
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
              <CheckCircle className="w-12 h-12 mb-3" />
              <p className="text-sm font-medium">Alle Records sind aktuell</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
