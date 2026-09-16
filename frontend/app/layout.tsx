import type { Metadata, Viewport } from 'next'
import 'maplibre-gl/dist/maplibre-gl.css'
import './globals.css'
import '../components/research-dashboard/sf-event-map.css'
import '../components/research-dashboard/research-experience.css'
import '../components/research-dashboard/clean-ui.css'

export const metadata: Metadata = {
  title: 'GrowthX — Sponsorship intelligence',
  description: 'Find the right communities, events, and sponsorship opportunities for developer growth.',
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
  },
}

export const viewport: Viewport = {
  // Sin cover, env(safe-area-inset-*) vale 0 y el sheet queda bajo el home indicator.
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light bg-background">
      {/* Sin Vercel Analytics: la demo corre local y su script daba un 404 de
          consola en todo build de producción fuera de Vercel. */}
      <body className="antialiased">{children}</body>
    </html>
  )
}
