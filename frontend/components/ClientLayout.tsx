'use client'

import { useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { ToastProvider } from './Toast'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  if (pathname === '/login') {
    return (
      <ToastProvider>
        <main className="min-h-screen">{children}</main>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <div className="flex h-screen lg:p-2 lg:gap-2">
        {/* Mobile Header */}
        <div className="fixed top-0 left-0 right-0 z-30 lg:hidden">
          <div className="flex items-center justify-between h-14 px-4 bg-white/88 backdrop-blur-xl border-b border-accent-100/70 shadow-[0_10px_30px_-24px_rgba(36,56,141,0.35)]">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-accent-500 hover:text-accent-700
                         hover:bg-primary-100 rounded-lg transition-colors"
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
        <main className="flex-1 overflow-auto bg-white/94 lg:rounded-2xl lg:border lg:border-accent-100/70 lg:shadow-soft pt-14 lg:pt-0 backdrop-blur-sm">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
