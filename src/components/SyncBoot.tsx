'use client';
import { useEffect } from 'react';
import { applyLook } from '@/lib/look';
import { sync, cleanCode } from '@/lib/sync';
import { engine } from '@/lib/engine';
import { notes } from '@/lib/notes';

/** Starts device sync on every page, and handles a pairing link (/?sync=CODE) opened on a new device. */
export function SyncBoot() {
  useEffect(() => {
    applyLook();
    const s = sync(); s.start();
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    try { if (localStorage.getItem('fr-debug') === '1') (window as any).__fr = { e: engine(), s, n: notes() }; } catch { /* ignore */ }
    try {
      const u = new URL(location.href), c = u.searchParams.get('sync');
      if (c) {
        u.searchParams.delete('sync'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
        if (!s.cfg || s.cfg.code !== cleanCode(c)) {
          if (confirm('Link this device to your synced Flight Recall data?\n\nProgress, notes, mistakes and your own cards will merge between your devices.')) s.enable(c).catch(e => alert(e.message));
        }
      }
    } catch { /* ignore */ }
  }, []);
  return null;
}
