import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Jokari Knowledge Hub',
  description: 'Interne Wissensmanagement-Plattform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className={`${inter.className} bg-neutral-100`}>
        <div className="flex h-screen p-2 gap-2">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
