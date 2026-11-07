import type { Metadata, Viewport } from 'next';
import './globals.css';
import './reference.css';
import './home.css';
import './browse.css';

export const metadata: Metadata = {
  title: 'Flight Recall',
  description: 'Spaced-repetition flashcards for aerodynamics, with a 3D lab.',
  manifest: '/manifest.webmanifest'
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#CF5F27' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
