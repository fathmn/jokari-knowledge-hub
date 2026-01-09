import clsx from 'clsx'

type Status = 'pending' | 'approved' | 'rejected' | 'needs_review' |
              'uploading' | 'parsing' | 'extracting' | 'pending_review' |
              'completed' | 'parse_failed' | 'extraction_failed'

interface StatusBadgeProps {
  status: Status
  size?: 'sm' | 'md'
}

const statusConfig: Record<Status, { label: string; className: string; dot: string }> = {
  pending: {
    label: 'Ausstehend',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500'
  },
  approved: {
    label: 'Genehmigt',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500'
  },
  rejected: {
    label: 'Abgelehnt',
    className: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500'
  },
  needs_review: {
    label: 'Prüfung nötig',
    className: 'bg-accent-50 text-accent-700 border-accent-200',
    dot: 'bg-accent-500'
  },
  uploading: {
    label: 'Hochladen...',
    className: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    dot: 'bg-neutral-400 animate-pulse'
  },
  parsing: {
    label: 'Parsen...',
    className: 'bg-accent-50 text-accent-700 border-accent-200',
    dot: 'bg-accent-500 animate-pulse'
  },
  extracting: {
    label: 'Extrahieren...',
    className: 'bg-accent-50 text-accent-700 border-accent-200',
    dot: 'bg-accent-500 animate-pulse'
  },
  pending_review: {
    label: 'Bereit zur Prüfung',
    className: 'bg-primary-50 text-primary-800 border-primary-200',
    dot: 'bg-primary-500'
  },
  completed: {
    label: 'Abgeschlossen',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500'
  },
  parse_failed: {
    label: 'Parse-Fehler',
    className: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500'
  },
  extraction_failed: {
    label: 'Extraktions-Fehler',
    className: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500'
  },
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    dot: 'bg-neutral-400'
  }

  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs',
      config.className
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}
