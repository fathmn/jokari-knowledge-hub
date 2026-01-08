const API_BASE = '/api'

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unbekannter Fehler' }))
    throw new Error(error.detail || `HTTP ${res.status}`)
  }

  return res.json()
}

export const api = {
  // Dashboard
  getDashboardStats: () => fetchApi('/dashboard/stats'),

  // Documents
  getDocuments: (params?: URLSearchParams) =>
    fetchApi(`/documents${params ? `?${params}` : ''}`),
  getDocument: (id: string) => fetchApi(`/documents/${id}`),
  getDocumentChunks: (id: string) => fetchApi(`/documents/${id}/chunks`),
  getDocumentRecords: (id: string) => fetchApi(`/documents/${id}/records`),
  deleteDocument: (id: string) =>
    fetchApi(`/documents/${id}`, { method: 'DELETE' }),

  // Review
  getReviewQueue: (params?: URLSearchParams) =>
    fetchApi(`/review${params ? `?${params}` : ''}`),
  getRecord: (id: string) => fetchApi(`/review/${id}`),
  approveRecord: (id: string, actor: string) =>
    fetchApi(`/review/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ actor }),
    }),
  rejectRecord: (id: string, actor: string, reason?: string) =>
    fetchApi(`/review/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ actor, reason }),
    }),
  updateRecord: (id: string, data: any) =>
    fetchApi(`/review/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ data_json: data }),
    }),

  // Search
  searchKnowledge: (params: URLSearchParams) =>
    fetchApi(`/knowledge/search?${params}`),
}
