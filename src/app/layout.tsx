import type { Metadata, Viewport } from 'next';
import './globals.css';
import './reference.css';
import './home.css';
import './browse.css';
import { SyncBoot } from '@/components/SyncBoot';
import { TabBar } from '@/components/SiteChrome';
import './theme.css';

export const metadata: Metadata = {
  title: 'Flight Recall',
  description: 'Spaced-repetition flashcards for aerodynamics, with a 3D lab.',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Flight Recall', statusBarStyle: 'default' }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#CF5F27' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Noto+Sans+Ethiopic:wght@400;600;700&family=Noto+Serif+Ethiopic:wght@500;700&display=swap" />
      </head>
      <body><SyncBoot />{children}<TabBar /></body>
    </html>
  );
}
