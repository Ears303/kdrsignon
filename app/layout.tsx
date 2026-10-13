import type { Metadata, Viewport } from 'next'
import { AppProvider } from '@/components/AppProvider'
import './globals.css'

export const metadata: Metadata = { title: 'Event Check-In', description: 'Briefing, start/finish scanning and outstanding reports for car and bike events' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  )
}
