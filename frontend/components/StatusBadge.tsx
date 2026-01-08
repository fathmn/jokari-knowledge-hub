import clsx from 'clsx'

type Status = 'pending' | 'approved' | 'rejected' | 'needs_review' |
              'uploading' | 'parsing' | 'extracting' | 'pending_review' |
              'completed' | 'parse_failed' | 'extraction_failed'

interface StatusBadgeProps {
  status: Status
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending: { label: 'Ausstehend', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Genehmigt', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Abgelehnt', className: 'bg-red-100 text-red-800' },
  needs_review: { label: 'Prüfung nötig', className: 'bg-blue-100 text-blue-800' },
  uploading: { label: 'Hochladen...', className: 'bg-gray-100 text-gray-800' },
  parsing: { label: 'Parsen...', className: 'bg-blue-100 text-blue-800' },
  extracting: { label: 'Extrahieren...', className: 'bg-blue-100 text-blue-800' },
  pending_review: { label: 'Bereit zur Prüfung', className: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Abgeschlossen', className: 'bg-green-100 text-green-800' },
  parse_failed: { label: 'Parse-Fehler', className: 'bg-red-100 text-red-800' },
  extraction_failed: { label: 'Extraktions-Fehler', className: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' }

  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      config.className
    )}>
      {config.label}
    </span>
  )
}
