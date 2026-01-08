import { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface DashboardTileProps {
  title: string
  value: number
  icon: LucideIcon
  color: 'blue' | 'yellow' | 'green' | 'red'
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-50 text-red-600',
}

export default function DashboardTile({ title, value, icon: Icon, color }: DashboardTileProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center">
        <div className={clsx('p-3 rounded-lg', colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
