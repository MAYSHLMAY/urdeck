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
import { StreakHost } from '@/components/Streak';
import { SplashBoot } from '@/components/SplashBoot';
import { NativeBoot } from '@/components/NativeBoot';
import { AppBoot } from '@/components/AppBoot';
import { Welcome } from '@/components/Welcome';
import './theme.css';
import './app.css';
import './welcome.css';
import './look.css';
import './buddy.css';
import { LOOK_BOOT } from '@/lib/look';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://urdeck.vercel.app').replace(/\/$/, '');
const DESC = 'UrDeck is a free study app: spaced-repetition flashcards, a 3D lab, a PDF reader that tracks what you really read, live quizzes and Anki import. Works offline.';
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'UrDeck: flashcards, 3D lab and PDF reader for students', template: '%s · UrDeck' },
  description: DESC,
  applicationName: 'UrDeck',
  keywords: ['UrDeck', 'flashcards app', 'spaced repetition', 'Anki alternative', 'import Anki apkg', 'study app', 'PDF reader for students', '3D anatomy lab', 'live quiz', 'offline study app'],
  alternates: { canonical: '/' },
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'UrDeck', statusBarStyle: 'default' },
  openGraph: { type: 'website', siteName: 'UrDeck', url: '/', title: 'UrDeck: flashcards, 3D lab and PDF reader', description: DESC, images: [{ url: '/og.png', width: 1200, height: 630, alt: 'UrDeck study app' }] },
  twitter: { card: 'summary_large_image', title: 'UrDeck: flashcards, 3D lab and PDF reader', description: DESC, images: ['/og.png'] },
  robots: { index: true, follow: true },
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {})
};
const LD = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'UrDeck', url: SITE, applicationCategory: 'EducationalApplication', operatingSystem: 'Android, Web', description: DESC, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, image: SITE + '/og.png' });
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F3F5FB' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT + SPLASH_BOOT }} />
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} />
      </head>
      <body><div id="ud-splash" role="dialog" aria-modal="true" aria-label="UrDeck is starting" dangerouslySetInnerHTML={{ __html: SPLASH_HTML }} /><SplashBoot />
        <FieldHost /><StreakHost /><NativeBoot /><AppBoot /><SyncBoot />
        <Welcome />
        <OfflineBadge />
        <Listen />{children}</body>
    </html>
  );
}
