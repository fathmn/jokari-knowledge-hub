import clsx from 'clsx'

interface CompletenessBarProps {
  score: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function CompletenessBar({ score, showLabel = false, size = 'md' }: CompletenessBarProps) {
  const percentage = Math.round(score * 100)

  const getColor = () => {
    if (percentage >= 80) return 'bg-green-500'
    if (percentage >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  }

  const labelClasses = {
    sm: 'text-xs w-10',
    md: 'text-sm w-12',
    lg: 'text-base w-14'
  }

  return (
    <div className="flex items-center gap-2">
      <div className={clsx('flex-1 bg-gray-200 rounded-full overflow-hidden', sizeClasses[size])}>
        <div
          className={clsx('h-full rounded-full transition-all', getColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className={clsx('font-medium text-gray-600 text-right', labelClasses[size])}>
          {percentage}%
        </span>
      )}
    </div>
  )
}
