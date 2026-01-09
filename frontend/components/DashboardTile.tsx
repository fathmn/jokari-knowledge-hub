import { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface DashboardTileProps {
  title: string
  value: number
  icon: LucideIcon
  color: 'primary' | 'warning' | 'success' | 'danger'
  trend?: {
    value: number
    label: string
  }
}

const colorConfig = {
  primary: {
    icon: 'text-neutral-900',
    accent: 'bg-neutral-100',
  },
  warning: {
    icon: 'text-amber-600',
    accent: 'bg-amber-50',
  },
  success: {
    icon: 'text-emerald-600',
    accent: 'bg-emerald-50',
  },
  danger: {
    icon: 'text-red-600',
    accent: 'bg-red-50',
  },
}

export default function DashboardTile({ title, value, icon: Icon, color, trend }: DashboardTileProps) {
  const config = colorConfig[color]

  return (
    <div className="card p-3 sm:p-4 lg:p-6 hover:bg-neutral-50/50 transition-colors">
      <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
        <div className={clsx('p-1.5 sm:p-2 lg:p-2.5 rounded-lg sm:rounded-xl', config.accent)}>
          <Icon className={clsx('w-4 h-4 sm:w-5 sm:h-5', config.icon)} strokeWidth={1.5} />
        </div>
        <p className="text-xs sm:text-sm lg:text-[15px] font-medium text-neutral-600 truncate">{title}</p>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-xl sm:text-2xl lg:text-[32px] font-semibold text-neutral-900 tracking-tight leading-none">
          {value.toLocaleString('de-DE')}
        </p>
        {trend && (
          <span className={clsx(
            'text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg',
            trend.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
    </div>
  )
}
