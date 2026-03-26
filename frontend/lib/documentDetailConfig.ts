const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const DOCUMENT_STATUS_POLL_INTERVAL_MS = parseNumber(
  process.env.NEXT_PUBLIC_DOCUMENT_STATUS_POLL_INTERVAL_MS,
  5000
)

export const CHUNK_SIGNAL_THRESHOLDS = {
  high: parseNumber(process.env.NEXT_PUBLIC_CHUNK_SIGNAL_HIGH_THRESHOLD, 0.8),
  medium: parseNumber(process.env.NEXT_PUBLIC_CHUNK_SIGNAL_MEDIUM_THRESHOLD, 0.5),
}

export const DOCUMENT_PROCESSING_STATUSES = new Set([
  'uploading',
  'parsing',
  'extracting',
])
