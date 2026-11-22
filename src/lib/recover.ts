/** If a screen breaks because the app was updated while it was open (old pages meeting new code), clear the saved copies and reload once. */
export function recover(): boolean {
  try {
    const t = +(sessionStorage.getItem('ud-rec') || 0);
    if (Date.now() - t < 20000) return false;
    sessionStorage.setItem('ud-rec', String(Date.now()));
  } catch { /* ignore */ }
  const go = () => location.reload();
  (async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignore */ }
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* ignore */ }
    go();
  })();
  return true;
}
export const looksStale = (m: string) => /ChunkLoadError|Loading chunk|dynamically imported module|Unexpected token '<'|Failed to fetch RSC/i.test(m);
