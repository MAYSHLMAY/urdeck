import { Listen } from '@/components/Listen';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import './reference.css';
import './home.css';
import './browse.css';
import { OfflineBadge } from '@/components/OfflineBadge';
import { SyncBoot } from '@/components/SyncBoot';
import { TabBar } from '@/components/SiteChrome';
import './theme.css';
import './app.css';
import { LOOK_BOOT } from '@/lib/look';

export const metadata: Metadata = {
  title: 'Flight Recall',
  description: 'Spaced-repetition flashcards for aerodynamics, with a 3D lab.',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Flight Recall', statusBarStyle: 'default' }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#5B5BD6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Atkinson+Hyperlegible:wght@400;700&family=Noto+Sans+Ethiopic:wght@400;600;700&display=swap" />
      </head>
      <body><SyncBoot /><OfflineBadge />
        <Listen />{children}<TabBar /></body>
    </html>
  );
}
