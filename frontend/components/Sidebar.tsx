'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Upload,
  FileText,
  CheckSquare,
  Search,
  BookOpen,
  X,
  GitPullRequest,
  LogOut
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from './AuthProvider'

const favoriten = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Dokumente', href: '/dokumente', icon: FileText },
]

const wissensbereiche = [
  { name: 'Review', href: '/review', icon: CheckSquare },
  { name: 'Updates', href: '/review/updates', icon: GitPullRequest },
  { name: 'Wissensdatenbank', href: '/wissen', icon: BookOpen },
  { name: 'Suche', href: '/suche', icon: Search },
]

const departments = [
  { name: 'Vertrieb', value: 'sales', color: 'bg-accent-500' },
  { name: 'Support', value: 'support', color: 'bg-primary-500' },
  { name: 'Produkt', value: 'product', color: 'bg-accent-300' },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, signOut } = useAuth()
  const activeDepartment = searchParams.get('department') || ''

  const NavItem = ({ item }: { item: { name: string; href: string; icon: any } }) => {
    const isReviewUpdatesPath = pathname.startsWith('/review/updates')
    const isActive = pathname === item.href || (
      item.href !== '/' &&
      pathname.startsWith(`${item.href}/`) &&
      !(item.href === '/review' && isReviewUpdatesPath)
    )

    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={clsx(
          'flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all',
          isActive
            ? 'bg-accent-500 text-white shadow-sm'
            : 'text-accent-500 hover:bg-primary-50 hover:text-accent-700'
        )}
      >
        <item.icon className={clsx(
          'w-[18px] h-[18px]',
          isActive ? 'text-white' : 'text-accent-300'
        )} />
        <span className="font-medium">{item.name}</span>
      </Link>
    )
  }

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="px-3 pt-5 pb-2">
      <span className="text-[11px] font-semibold text-accent-300 uppercase tracking-[0.18em]">
        {children}
      </span>
    </div>
  )

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={clsx(
        'flex flex-col bg-white/88 backdrop-blur-2xl shadow-soft border-r border-accent-100/70 lg:border lg:border-accent-100/70',
        // Desktop: always visible, static
        'lg:relative lg:w-60 lg:rounded-2xl lg:translate-x-0',
        // Mobile: fixed, slide in/out
        'fixed inset-y-0 left-0 z-50 w-72 rounded-r-2xl',
        'transform transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo Section */}
        <div className="flex items-center justify-between h-16 px-5">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <Image
              src="/logo.svg"
              alt="Jokari"
              width={100}
              height={32}
            />
          </Link>
          {/* Mobile close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 -mr-2 text-accent-300 hover:text-accent-600
                         hover:bg-primary-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {/* Favoriten */}
          <SectionHeader>Favoriten</SectionHeader>
          <div className="space-y-0.5">
            {favoriten.map((item) => (
              <NavItem key={item.name} item={item} />
            ))}
          </div>

          {/* Wissensbereiche */}
          <SectionHeader>Wissensbereiche</SectionHeader>
          <div className="space-y-0.5">
            {wissensbereiche.map((item) => (
              <NavItem key={item.name} item={item} />
            ))}
          </div>

          {/* Abteilungen */}
          <SectionHeader>Abteilungen</SectionHeader>
          <div className="space-y-0.5">
            {departments.map((department) => {
              const isActive = pathname === '/wissen' && activeDepartment === department.value

              return (
                <Link
                  key={department.name}
                  href={`/wissen?department=${department.value}`}
                  onClick={onClose}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-lg w-full text-left transition-colors',
                    isActive
                      ? 'bg-primary-50 text-accent-700'
                      : 'text-accent-500 hover:bg-primary-50'
                  )}
                >
                  <span className={clsx('w-2.5 h-2.5 rounded-full', department.color)} />
                  <span>{department.name}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 space-y-3">
          {user && (
            <div className="rounded-xl border border-accent-100 bg-primary-50/50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-300">
                Angemeldet
              </div>
              <div className="mt-1 text-[13px] font-medium text-accent-700 break-all">
                {user.email}
              </div>
              <button
                onClick={() => {
                  void signOut()
                  onClose?.()
                }}
                className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-accent-500 hover:text-accent-700 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Abmelden</span>
              </button>
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-accent-300">
            <span>v1.0</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span>Online</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
