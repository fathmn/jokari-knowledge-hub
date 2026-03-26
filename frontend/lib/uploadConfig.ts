const parseExtensions = (value: string | undefined, fallback: string[]) => {
  if (!value) {
    return fallback
  }

  const extensions = value
    .split(',')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)

  return extensions.length > 0 ? extensions : fallback
}

const DEFAULT_ALLOWED_UPLOAD_EXTENSIONS = ['.docx', '.pdf', '.md', '.csv', '.xlsx', '.xls']

const EXTENSION_MIME_MAP: Record<string, string[]> = {
  '.csv': ['text/csv'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.markdown': ['text/markdown', 'text/plain'],
  '.md': ['text/markdown', 'text/plain'],
  '.pdf': ['application/pdf'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
}

export const ALLOWED_UPLOAD_EXTENSIONS = parseExtensions(
  process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_EXTENSIONS,
  DEFAULT_ALLOWED_UPLOAD_EXTENSIONS
)

export const UPLOAD_EXTENSION_LABELS = ALLOWED_UPLOAD_EXTENSIONS.map((extension) =>
  extension.replace(/^\./, '').toUpperCase()
)

export const DROPZONE_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.reduce<Record<string, string[]>>(
  (accept, extension) => {
    const mimeTypes = EXTENSION_MIME_MAP[extension] || []
    for (const mimeType of mimeTypes) {
      accept[mimeType] = Array.from(new Set([...(accept[mimeType] || []), extension]))
    }
    return accept
  },
  {}
)
