import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GrowXth — Developer Growth Intelligence',
  description: 'We map where your next developers are emerging.',
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
