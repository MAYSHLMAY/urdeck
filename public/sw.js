/* Offline support. App shell and static files are cached; Supabase data is cached by the app itself (IndexedDB). */
/* The cache name carries the build id (sw.js?v=<build>), so every new release starts clean and can never mix old pages with new code. */
const V = 'fr-shell-' + (new URL(self.location.href).searchParams.get('v') || 'x');

self.addEventListener('install', e => {
  // First install: nothing is running yet, so start at once. An update waits until the person taps "Reload" (see UpdatePrompt), so a page is never swapped under their hands.
  if (!self.registration.active) self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => Promise.all(['/', '/study', '/lab', '/read', '/articles', '/play', '/exam', '/duel', '/leeches', '/icon-192.png', '/manifest.webmanifest'].map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V && k !== 'fr-state') await caches.delete(k);   // fr-state holds the study reminder, keep it
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

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
  // page data that Next fetches while you tap around must always match the running code: network first, cache only when offline
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) {
    e.respondWith(fetch(req).then(r => { if (r.ok) caches.open(V).then(c => c.put(req, r.clone())); return r; }).catch(async () => (await caches.open(V).then(c => c.match(req))) || Response.error()));
    return;
  }
  // opening a page: the live page if the network answers within 3 s (so old pages never meet new code), otherwise the saved copy (offline first)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(V);
      try {
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
        if (r.ok) c.put(req, r.clone()); return r;
      } catch (err) { return (await c.match(req)) || (await c.match('/')) || fetch(req); }
    })());
    return;
  }
  // model files and other data: answer from the cache at once, refresh it in the background
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
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
