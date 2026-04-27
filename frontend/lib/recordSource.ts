export interface SourceMetadata {
  source_kind?: string
  label?: string
  source_type?: string | null
  source_id?: string | null
  source_url?: string | null
  api_endpoint?: string | null
  trust_type?: string | null
  authenticated_source?: boolean | null
  status?: string | null
  content_hash?: string | null
  imported_at?: string | null
  document_filename?: string | null
  document_owner?: string | null
  document_uploaded_at?: string | null
  details_json?: Record<string, unknown> | null
}

export interface RecordWithSource {
  document_id?: string | null
  data_json?: Record<string, any>
  source_metadata?: SourceMetadata | null
}

export function getSourceMetadata(record: RecordWithSource): SourceMetadata {
  if (record.source_metadata) return record.source_metadata

  const embedded = record.data_json?._source
  if (embedded) {
    const sourceUrl = embedded.source_url || null
    return {
      source_kind: sourceKindFromUrl(sourceUrl, embedded.source_type),
      label: sourceLabel(sourceUrl, embedded.source_type),
      source_type: embedded.source_type || null,
      source_id: embedded.source_id || null,
      source_url: sourceUrl,
      api_endpoint: embedded.api_endpoint || null,
      trust_type: embedded.trust_type || null,
      authenticated_source: embedded.authenticated_source ?? null,
      status: embedded.status || embedded.import_status || null,
      content_hash: embedded.content_hash || null,
      imported_at: embedded.imported_at || embedded.import_timestamp || null,
    }
  }

  if (record.document_id) {
    return {
      source_kind: 'manual_upload',
      label: 'Manueller Upload',
      source_type: 'manual_upload',
      trust_type: 'manual_upload',
      authenticated_source: true,
    }
  }

  return { source_kind: 'unknown', label: 'Unbekannte Quelle' }
}

export function sourceKindFromUrl(sourceUrl?: string | null, sourceType?: string | null): string {
  if (sourceType === 'direct_pim_api') return 'pim_api'
  if (sourceType === 'manual_upload') return 'manual_upload'
  const hostname = hostnameFromUrl(sourceUrl)
  if (hostname === 'jostudy.de' || hostname.endsWith('.jostudy.de')) return 'jostudy'
  if (hostname === 'jokari.de' || hostname.endsWith('.jokari.de')) return 'jokari_website'
  return sourceType ? 'external' : 'unknown'
}

export function sourceLabel(sourceUrl?: string | null, sourceType?: string | null): string {
  const kind = sourceKindFromUrl(sourceUrl, sourceType)
  if (kind === 'jostudy') return 'JO!Study / JOWiki'
  if (kind === 'jokari_website') return 'JOKARI Website'
  if (kind === 'pim_api') return 'PIM/API'
  if (kind === 'manual_upload') return 'Manueller Upload'
  if (sourceType) return sourceType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return 'Unbekannte Quelle'
}

export function sourceBadgeClass(kind?: string): string {
  switch (kind) {
    case 'jostudy':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    case 'jokari_website':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200'
    case 'pim_api':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'manual_upload':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    default:
      return 'bg-neutral-50 text-neutral-700 border-neutral-200'
  }
}

export function trustLabel(trustType?: string | null, authenticated?: boolean | null): string {
  if (trustType === 'authenticated_pim') return 'Authentifizierte PIM-Quelle'
  if (trustType === 'authenticated_cloudflare') return 'Authentifizierte Cloudflare-Quelle'
  if (trustType === 'manual_upload' || trustType === 'manual_review') return 'Manueller Upload, Review-Status siehe Record'
  if (trustType === 'unauthenticated_public') return 'Öffentlich gecrawlt, Review nötig'
  return authenticated ? 'Authentifizierte Quelle' : 'Quelle ungeprüft'
}

export function shouldCleanWebsiteText(source?: SourceMetadata | null): boolean {
  if (!source) return true
  const kind = source.source_kind || sourceKindFromUrl(source.source_url, source.source_type)
  if (kind === 'jokari_website' || kind === 'jostudy') return true
  return ['sitemap', 'cloudflare_api', 'cloudflare_mcp', 'firecrawl', 'crawlee', 'browser_mcp'].includes(source.source_type || '')
}

export function cleanWebsiteText(value?: string | null): string {
  if (!value || typeof value !== 'string') return ''

  let text = decodeHtml(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.:;!?])/g, '$1')
    .trim()

  const jostudyContentMarkers = [
    'Geschichte der Kabelentwicklung:',
    'Kabelbearbeitung:',
    'Isolierstoffe:',
    'Werkzeugkunde:',
  ]
  for (const marker of jostudyContentMarkers) {
    const index = text.indexOf(marker)
    if (index > 0) {
      text = text.slice(index).trim()
      break
    }
  }

  const cutPatterns = [
    /\s*\|\s*JOKARI\b/i,
    /\bDirekt zum Inhalt\b/i,
    /\bGerman English Login\b/i,
    /\bLogin\s*-->/i,
    /\bSuchen\s*-->/i,
    /\bAnmelden oder Registrieren\b/i,
    /\bJOKARI GmbH\b/i,
    /\bImpressum\b/i,
    /\bZum Inhalt springen\b/i,
    /\bZum Seitenende springen\b/i,
    /\bZur Navigation am Seitenende springen\b/i,
    /\bJOKARI homepage\b/i,
    /\bHauptnavigation\b/i,
    /\bLink kopieren\b/i,
    /\bLink kopiert\b/i,
    /\bAdd to watchlist\b/i,
    /\bDialog schließen\b/i,
    /\bVerfügbare Händler\b/i,
    /\bKundengruppen\b/i,
    /\bZahlungsarten\b/i,
    /\bLieferart\b/i,
    /\bHändlertyp\b/i,
    /\bZu vorherigem Slide wechseln\b/i,
    /\bZu nächstem Slide wechseln\b/i,
    /\bJO!STORY\b/i,
  ]

  for (const pattern of cutPatterns) {
    const match = pattern.exec(text)
    if (match && match.index > 10) {
      text = text.slice(0, match.index).trim()
      break
    }
  }

  text = text
    .replace(/\s*Jetzt bestellen!?$/i, '')
    .replace(/\s*Jetzt kaufen!?$/i, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

export function displayText(value?: string | null, source?: SourceMetadata | null): string {
  if (!value || typeof value !== 'string') return ''
  if (!shouldCleanWebsiteText(source)) {
    return decodeHtml(value)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+([,.:;!?])/g, '$1')
      .trim()
  }
  const cleaned = cleanWebsiteText(value)
  return cleaned || value || ''
}

export function displayExcerpt(value?: string | null, maxLength = 280, source?: SourceMetadata | null): string {
  const cleaned = displayText(value, source).replace(/\s+/g, ' ')
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength).trim()}...`
}

export function isUsefulDisplayValue(value: unknown, source?: SourceMetadata | null): boolean {
  if (typeof value !== 'string') return value !== null && value !== undefined
  if (shouldCleanWebsiteText(source)) {
    const normalized = value.toLowerCase()
    const blocked = [
      'zum inhalt',
      'seitenende',
      'homepage',
      'hauptnavigation',
      'nach werkzeugart',
      'mikro-präzisions',
      'jahre kabelmesser',
      'unserem jokari',
      'dialog schließen',
      'link kopieren',
      'facebook',
      'folgen',
      'währung',
      'seitensprache',
    ]
    if (blocked.some((marker) => normalized.includes(marker))) return false
  }
  const cleaned = displayText(value, source)
  return cleaned.length >= 4
}

export function isTechnicalSourceField(key: string): boolean {
  return [
    '_source',
    '_source_section',
    'source',
    'source_id',
    'source_type',
    'source_url',
    'source_kind',
    'source_version',
    'api_endpoint',
    'trust_type',
    'authenticated_source',
    'content_hash',
    'imported_at',
    'import_timestamp',
    'import_status',
  ].includes(key)
}

function decodeHtml(value: string): string {
  return value
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function hostnameFromUrl(sourceUrl?: string | null): string {
  if (!sourceUrl) return ''
  try {
    return new URL(sourceUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}
