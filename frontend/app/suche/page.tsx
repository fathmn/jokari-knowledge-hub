'use client'

import { useState } from 'react'
import { Search, Database } from 'lucide-react'
import EvidenceViewer from '@/components/EvidenceViewer'

interface SearchResult {
  record_id: string
  department: string
  schema_type: string
  primary_key: string
  data_json: any
  evidence: Array<{ id: string; field_path: string; excerpt: string }>
  relevance_score: number
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  query: string
}

export default function SuchePage() {
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [schemaType, setSchemaType] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSelectedResult(null)

    try {
      const params = new URLSearchParams({ q: query })
      if (department) params.append('department', department)
      if (schemaType) params.append('schema', schemaType)

      const res = await fetch(`/api/knowledge/search?${params}`)
      const data = await res.json()
      setResults(data)
    } catch (err) {
      console.error('Fehler:', err)
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Wissenssuche</h1>
      <p className="text-gray-600 mb-8">
        Durchsuche genehmigte Knowledge-Records (Agent-Ready API)
      </p>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchbegriff eingeben..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg"
          >
            <option value="">Alle Abteilungen</option>
            {Object.entries(departmentLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            value={schemaType}
            onChange={(e) => setSchemaType(e.target.value)}
            placeholder="Schema (optional)"
            className="w-40 px-4 py-3 border border-gray-300 rounded-lg"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Suche...' : 'Suchen'}
          </button>
        </div>
      </form>

      {/* Results */}
      {results && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Result List */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {results.total} Ergebnis{results.total !== 1 ? 'se' : ''} für "{results.query}"
            </h2>

            {results.results.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-8 text-center">
                <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Keine Ergebnisse gefunden</p>
                <p className="text-sm text-gray-400 mt-1">
                  Nur genehmigte Records werden durchsucht
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.results.map((result) => (
                  <button
                    key={result.record_id}
                    onClick={() => setSelectedResult(result)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      selectedResult?.record_id === result.record_id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-gray-500">
                        {result.schema_type}
                      </span>
                      <span className="text-xs text-primary-600">
                        Relevanz: {result.relevance_score.toFixed(2)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">{result.primary_key}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {departmentLabels[result.department] || result.department}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail View */}
          <div>
            {selectedResult ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-8">
                <div className="mb-4">
                  <span className="font-mono text-sm text-gray-500">
                    {selectedResult.schema_type}
                  </span>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedResult.primary_key}
                  </h2>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Daten</h3>
                  <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-auto max-h-64">
                    {JSON.stringify(selectedResult.data_json, null, 2)}
                  </pre>
                </div>

                {selectedResult.evidence.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Quellenbelege
                    </h3>
                    <EvidenceViewer evidence={selectedResult.evidence} />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-8 text-center sticky top-8">
                <p className="text-gray-500">
                  Wähle ein Ergebnis für Details
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API Info */}
      <div className="mt-12 bg-gray-50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API-Endpoint</h2>
        <div className="font-mono text-sm bg-gray-800 text-green-400 p-4 rounded-lg">
          GET /api/knowledge/search?department=sales&schema=Objection&q=preis
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Dieser Endpoint gibt nur genehmigte Records zurück und kann von AI-Agenten
          verwendet werden, um strukturiertes Wissen mit Quellenbelegen abzurufen.
        </p>
      </div>
    </div>
  )
}
