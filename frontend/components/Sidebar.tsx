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
  Clock,
  Star,
  Tag,
  Folder
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

export default function Sidebar() {
  const pathname = usePathname()

  const NavItem = ({ item }: { item: { name: string; href: string; icon: any } }) => {
    const isActive = pathname === item.href ||
      (item.href !== '/' && pathname.startsWith(item.href))

    return (
      <Link
        href={item.href}
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
    <div className="flex flex-col w-60 bg-white/80 backdrop-blur-2xl rounded-2xl shadow-sm">
      {/* Logo Section */}
      <div className="flex items-center h-16 px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Jokari"
            width={100}
            height={32}
          />
        </Link>
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
  )
}
