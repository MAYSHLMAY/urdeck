'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { syncIcons } from '@/lib/look';

/** Remembers where you are (so the home-screen icon can bring you back) and keeps the app icon in your colour. */
export function AppBoot() {
  const path = usePathname();
  useEffect(() => { syncIcons(); }, []);
  useEffect(() => {
    const save = () => { try { localStorage.setItem('ud-last', JSON.stringify({ p: (location.pathname + location.search + location.hash).replace(/([?&])source=pwa&?/, '$1').replace(/[?&]$/, ''), t: Date.now() })); } catch { /* ignore */ } };
    save();
    const vis = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', vis); addEventListener('pagehide', save); addEventListener('hashchange', save);
    const tick = setInterval(() => { if (document.visibilityState === 'visible') save(); }, 20000);
    return () => { document.removeEventListener('visibilitychange', vis); removeEventListener('pagehide', save); removeEventListener('hashchange', save); clearInterval(tick); };
  }, [path]);
  return null;
}
