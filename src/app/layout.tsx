import { Listen } from '@/components/Listen';
import type { Metadata, Viewport } from 'next';
// fonts are bundled with the app (works offline, no layout jump)
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-600.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
import './globals.css';
import './reference.css';
import './home.css';
import './browse.css';
import { OfflineBadge } from '@/components/OfflineBadge';
import { SyncBoot } from '@/components/SyncBoot';
import { SPLASH_BOOT, SPLASH_CSS, SPLASH_HTML } from '@/lib/splash';
import { FieldHost } from '@/components/Fields';
import { SplashBoot } from '@/components/SplashBoot';
import { NativeBoot } from '@/components/NativeBoot';
import { Welcome } from '@/components/Welcome';
import './theme.css';
import './app.css';
import './welcome.css';
import './look.css';
import './buddy.css';
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
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT + SPLASH_BOOT }} />
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      </head>
      <body><div id="ud-splash" role="dialog" aria-modal="true" aria-label="UrDeck is starting" dangerouslySetInnerHTML={{ __html: SPLASH_HTML }} /><SplashBoot />
        <FieldHost /><NativeBoot /><SyncBoot />
        <Welcome />
        <OfflineBadge />
        <Listen />{children}</body>
    </html>
  );
}
