/* Daily study reminder. Without a push server the best a web app can do is layered:
 *  1) a scheduled notification (Notification Triggers, Chrome/Android),
 *  2) the service worker's periodic sync for installed apps, 3) a timer while the app is open.
 * State is mirrored into the Cache API so the service worker can read it. */
import type { Engine } from './engine';

const CK = 'fr-state', KEY = '/__remind';
export const supportsReminders = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export async function askPermission(): Promise<string | null> {
  if (!supportsReminders()) return 'This browser cannot show notifications. Install the app (Add to Home Screen) and try again.';
  if (Notification.permission === 'granted') return null;
  if (Notification.permission === 'denied') return 'Notifications are blocked for this site. Allow them in the browser settings.';
  const r = await Notification.requestPermission();
  return r === 'granted' ? null : 'Permission was not granted.';
}
const nextAt = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() <= Date.now() + 30_000) d.setDate(d.getDate() + 1); return d.getTime(); };
let timer: any = null;

let lastKey = '';
export async function scheduleReminder(e: Engine) {
  const hhmm = e.O.remind as string;
  const c0 = e.ready ? e.counts() : null, key = hhmm + '|' + (c0 ? c0.dToday + c0.nToday : '') + '|' + e.S.streak + '|' + e.S.last + '|' + (typeof Notification !== 'undefined' ? Notification.permission : '');
  if (key === lastKey) return; lastKey = key;
  try {
    const reg = await navigator.serviceWorker?.getRegistration(); if (!reg) return;
    const cache = await caches.open(CK);
    if (!hhmm || !supportsReminders() || Notification.permission !== 'granted') { await cache.delete(KEY); clearTimeout(timer); (await reg.getNotifications({ tag: 'fr-remind', includeTriggered: false } as any)).forEach(n => n.close()); return; }
    const c = e.counts(), due = c.dToday + c.nToday, at = nextAt(hhmm);
    const body = due > 0 ? `${due} card${due === 1 ? '' : 's'} waiting${e.S.streak > 1 ? ` · keep your ${e.S.streak}-day streak` : ''}.` : 'A quick review keeps your streak alive.';
    await cache.put(KEY, new Response(JSON.stringify({ hhmm, body, at, last: e.S.last })));
    const TT = (window as any).TimestampTrigger;
    if (TT) await reg.showNotification('Time to study', { tag: 'fr-remind', body, icon: '/icon-192.png', badge: '/icon-192.png', showTrigger: new TT(at), data: { url: '/study' } } as any);
    try { await (reg as any).periodicSync?.register('fr-remind', { minInterval: 6 * 3600 * 1000 }); } catch { /* not allowed */ }
    clearTimeout(timer); const ms = at - Date.now();
    if (ms < 2 ** 31 - 1) timer = setTimeout(() => { if (document.visibilityState !== 'visible' || true) reg.showNotification('Time to study', { tag: 'fr-remind', body, icon: '/icon-192.png', data: { url: '/study' } }); }, ms);
  } catch { /* best effort */ }
}
