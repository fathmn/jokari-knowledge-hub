'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen lg:p-2 lg:gap-2">
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-30 lg:hidden">
        <div className="flex items-center justify-between h-14 px-4 bg-white/80 backdrop-blur-xl border-b border-neutral-200/60">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900
                       hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Image
            src="/logo.svg"
            alt="Jokari"
            width={80}
            height={26}
            className="h-6 w-auto"
          />
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-white lg:rounded-2xl lg:shadow-sm pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
