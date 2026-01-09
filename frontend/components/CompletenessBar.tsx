import clsx from 'clsx'

interface CompletenessBarProps {
  score: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function CompletenessBar({ score, showLabel = false, size = 'md' }: CompletenessBarProps) {
  const percentage = Math.round(score * 100)

  const getColor = () => {
    if (percentage >= 80) return 'bg-emerald-500'
    if (percentage >= 50) return 'bg-primary-500'
    if (percentage >= 25) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-1.5',
    lg: 'h-2'
  }

  const labelClasses = {
    sm: 'text-xs w-10',
    md: 'text-sm w-12',
    lg: 'text-base w-14'
  }

  return (
    <div className="flex items-center gap-3">
      <div className={clsx(
        'flex-1 bg-neutral-200 rounded-full overflow-hidden',
        sizeClasses[size]
      )}>
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500 ease-out',
            getColor()
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className={clsx(
          'font-semibold text-neutral-700 text-right tabular-nums',
          labelClasses[size]
        )}>
          {percentage}%
        </span>
      )}
    </div>
  )
}
