import { Listen } from '@/components/Listen';
import type { Metadata, Viewport } from 'next';
// fonts are bundled with the app (works offline, no layout jump)
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-600.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
import './globals.css';
import './reference.css';
import './home.css';
import './browse.css';
import { OfflineBadge } from '@/components/OfflineBadge';
import { SyncBoot } from '@/components/SyncBoot';
import { NativeBoot } from '@/components/NativeBoot';
import { TabBar } from '@/components/SiteChrome';
import './theme.css';
import './app.css';
import { LOOK_BOOT } from '@/lib/look';

export const metadata: Metadata = {
  title: 'UrDeck',
  description: 'Study anything with smart flashcards, a 3D lab and live quizzes.',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'UrDeck', statusBarStyle: 'default' }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0E7A4F' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT }} />
      </head>
      <body><NativeBoot /><SyncBoot /><OfflineBadge />
        <Listen />{children}<TabBar /></body>
    </html>
  );
}
