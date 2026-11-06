import type { Metadata, Viewport } from 'next';
import './globals.css';
import './reference.css';
import './home.css';

export const metadata: Metadata = {
  title: 'Flight Recall',
  description: 'Spaced-repetition flashcards for aerodynamics, with a 3D lab.',
  manifest: '/manifest.webmanifest'
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#CF5F27' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
