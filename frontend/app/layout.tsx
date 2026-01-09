import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'

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
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}
