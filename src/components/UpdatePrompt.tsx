'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/* Tells the person a newer version is ready and lets them choose when to switch. It never reloads by itself. */
const BUILD = process.env.NEXT_PUBLIC_BUILD || '';
const QUIET = /^\/(play|host|duel)(\/|$)/;   // never cover a live game

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), path = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') return;
    if ((window as any).Capacitor?.isNativePlatform?.()) return;   // the phone app updates through the store, not the web
    let alive = true;
    const flag = () => { if (alive) setReady(true); };
    // 1. a service worker has finished installing and is waiting. If it belongs to THIS page's own build, switch to it at once
    //    (page and worker then match). If it belongs to a newer build than the page, ask first.
    const own = (w: ServiceWorker) => { try { return new URL(w.scriptURL).searchParams.get('v') === BUILD; } catch { return false; } };
    const decide = (w: ServiceWorker) => { if (own(w)) w.postMessage({ type: 'SKIP_WAITING' }); else if (navigator.serviceWorker.controller) flag(); };
    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) decide(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed') decide(w); });
      });
    };
    navigator.serviceWorker?.getRegistration().then(r => r && watch(r)).catch(() => {});
    // 2. the server reports a different build than the one running
    const check = async () => {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' }); const j = await r.json();
        if (j?.build && BUILD && j.build !== BUILD) { flag(); navigator.serviceWorker?.getRegistration().then(g => g?.update()).catch(() => {}); }
      } catch { /* offline: nothing to say */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const first = setTimeout(check, 20_000), every = setInterval(check, 15 * 60_000);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); clearTimeout(first); clearInterval(every); };
  }, []);

  const go = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => location.reload(), 2500);   // safety: reload anyway if the switch is slow
        return;
      }
    } catch { /* fall through */ }
    location.reload();
  };

  if (!ready || QUIET.test(path || '')) return null;
  return (
    <div className="upd" role="status" aria-live="polite">
      <span><b>A new version is ready.</b> <small>Your progress is safe.</small></span>
      <button type="button" onClick={go} disabled={busy}>{busy ? 'Updating…' : 'Reload'}</button>
      <button type="button" className="upd-x" aria-label="Not now" onClick={() => setReady(false)}>Later</button>
    </div>
  );
}
