'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Upload,
  FileText,
  CheckSquare,
  Search,
  BookOpen,
  X
} from 'lucide-react'
import clsx from 'clsx'

const favoriten = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Dokumente', href: '/dokumente', icon: FileText },
]

const wissensbereiche = [
  { name: 'Review', href: '/review', icon: CheckSquare },
  { name: 'Wissensdatenbank', href: '/wissen', icon: BookOpen },
  { name: 'Suche', href: '/suche', icon: Search },
]

const tags = [
  { name: 'Vertrieb', color: 'bg-blue-500' },
  { name: 'Support', color: 'bg-green-500' },
  { name: 'Produkt', color: 'bg-purple-500' },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()

  const NavItem = ({ item }: { item: { name: string; href: string; icon: any } }) => {
    const isActive = pathname === item.href ||
      (item.href !== '/' && pathname.startsWith(item.href))

    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={clsx(
          'flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all',
          isActive
            ? 'bg-neutral-900 text-white shadow-sm'
            : 'text-neutral-600 hover:bg-neutral-100'
        )}
      >
        <item.icon className={clsx(
          'w-[18px] h-[18px]',
          isActive ? 'text-white' : 'text-neutral-400'
        )} />
        <span className="font-medium">{item.name}</span>
      </Link>
    )
  }

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="px-3 pt-5 pb-2">
      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
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
        'flex flex-col bg-white/80 backdrop-blur-2xl shadow-sm',
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
              className="lg:hidden p-2 -mr-2 text-neutral-400 hover:text-neutral-600
                         hover:bg-neutral-100 rounded-lg transition-colors"
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

          {/* Tags */}
          <SectionHeader>Tags</SectionHeader>
          <div className="space-y-0.5">
            {tags.map((tag) => (
              <Link
                key={tag.name}
                href={`/dokumente?department=${tag.name.toLowerCase()}`}
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-neutral-600
                           hover:bg-neutral-100 rounded-lg w-full text-left transition-colors"
              >
                <span className={clsx('w-2.5 h-2.5 rounded-full', tag.color)} />
                <span>{tag.name}</span>
              </Link>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
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
