/* Offline support. App shell and static files are cached; Supabase data is cached by the app itself (IndexedDB). */
const V = 'fr-shell-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => Promise.all(['/', '/study', '/lab', '/play', '/icon-192.png', '/manifest.webmanifest'].map(u => c.add(u).catch(() => {})))));
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
  // pages and model files: network first, fall back to the cache when offline
  e.respondWith((async () => {
    const c = await caches.open(V);
    try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
    catch (err) { const hit = await c.match(req) || (req.mode === 'navigate' ? await c.match('/') : null); if (hit) return hit; throw err; }
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
