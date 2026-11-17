/* Offline support. App shell and static files are cached; Supabase data is cached by the app itself (IndexedDB). */
const V = 'fr-shell-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => Promise.all(['/', '/study', '/lab', '/play', '/exam', '/duel', '/icon-192.png', '/manifest.webmanifest'].map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // hashed build files never change: cache first
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r;
    }));
    return;
  }
  // pages, page data and model files: answer from the cache at once (offline first), refresh it in the background.
  // Only the very first visit to a page has to wait for the network.
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; }
    catch (err) { const home = req.mode === 'navigate' ? await c.match('/') : null; if (home) return home; throw err; }
  })());
});

/* Study reminder (see src/lib/remind.ts): periodic sync fires roughly when the browser allows; show it if it is past the set time and nothing was studied today. */
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'fr-remind') return;
  e.waitUntil((async () => {
    const r = await (await caches.open('fr-state')).match('/__remind'); if (!r) return;
    const st = await r.json(), now = new Date(), [h, m] = st.hhmm.split(':').map(Number);
    const t = new Date(); t.setHours(h, m, 0, 0);
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (now >= t && now - t < 5 * 3600 * 1000 && st.last !== today) await self.registration.showNotification('Time to study', { tag: 'fr-remind', body: st.body, icon: '/icon-192.png', data: { url: '/study' } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
