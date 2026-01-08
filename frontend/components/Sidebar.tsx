'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Upload,
  FileText,
  CheckSquare,
  Search,
  Database,
  BookOpen
} from 'lucide-react'
import clsx from 'clsx'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Dokumente', href: '/dokumente', icon: FileText },
  { name: 'Review', href: '/review', icon: CheckSquare },
  { name: 'Wissensdatenbank', href: '/wissen', icon: BookOpen },
  { name: 'Suche', href: '/suche', icon: Search },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-gray-200">
        <Database className="w-8 h-8 text-primary-600" />
        <span className="ml-3 text-xl font-semibold text-gray-900">
          Knowledge Hub
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <item.icon className={clsx(
                'w-5 h-5 mr-3',
                isActive ? 'text-primary-600' : 'text-gray-400'
              )} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Jokari Knowledge Hub v1.0
        </p>
      </div>
    </div>
  )
}
