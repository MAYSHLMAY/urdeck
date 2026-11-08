/*
 * A player's identity (id, nickname, avatar) is kept in three independent places in the browser: localStorage, IndexedDB and a
 * long-lived cookie. If one is cleared (or the site data is partly wiped) the others restore it. The browser is also asked to
 * keep the site's storage permanently. A recovery code lets the player move the identity to another device.
 */
export interface Identity { id: string; name: string; av: string; v: number }
const K = 'fr-player-v1', COOKIE = 'fr_player', IDB = 'fr-player-v1';

const uid = () => 'p_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
const enc = (i: Identity) => btoa(unescape(encodeURIComponent(JSON.stringify(i)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string): Identity | null => {
  try { const j = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); return j && typeof j.id === 'string' && j.id.length > 4 ? { id: j.id, name: String(j.name || '').slice(0, 24), av: String(j.av || ''), v: +j.v || 0 } : null; } catch { return null; }
};
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet(): Promise<Identity | null> { try { const d = await idb(); return await new Promise(res => { const q = d.transaction('k').objectStore('k').get('me'); q.onsuccess = () => { d.close(); res(q.result || null); }; q.onerror = () => { d.close(); res(null); }; }); } catch { return null; } }
async function idbSet(i: Identity) { try { const d = await idb(); await new Promise<void>(res => { const t = d.transaction('k', 'readwrite'); t.objectStore('k').put(i, 'me'); t.oncomplete = () => { d.close(); res(); }; t.onerror = () => { d.close(); res(); }; }); } catch { /* ignore */ } }
const lsGet = (): Identity | null => { try { const j = JSON.parse(localStorage.getItem(K) || 'null'); return j && j.id ? j : null; } catch { return null; } };
const ckGet = (): Identity | null => { const m = document.cookie.split('; ').find(x => x.startsWith(COOKIE + '=')); return m ? dec(m.slice(COOKIE.length + 1)) : null; };

function writeAll(i: Identity) {
  try { localStorage.setItem(K, JSON.stringify(i)); } catch { /* ignore */ }
  try { document.cookie = `${COOKIE}=${enc(i)}; max-age=${400 * 86400}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch { /* ignore */ }
  idbSet(i);
}
/** Load the identity from whichever store still has it (the newest wins) and repair the others. null = brand new player. */
export async function loadIdentity(): Promise<Identity | null> {
  try { (navigator as any).storage?.persist?.(); } catch { /* ignore */ }
  const all = [lsGet(), ckGet(), await idbGet()].filter(Boolean) as Identity[];
  if (!all.length) return null;
  const best = all.sort((a, b) => (b.v || 0) - (a.v || 0))[0];
  writeAll(best); return best;
}
export function saveIdentity(p: { id?: string; name: string; av: string }): Identity {
  const i: Identity = { id: p.id || lsGet()?.id || uid(), name: p.name.trim().slice(0, 24), av: p.av, v: Date.now() };
  writeAll(i); return i;
}
export const newId = uid;
export const recoveryCode = (i: Identity) => enc(i);
export function importCode(code: string): Identity | null { const i = dec(code.trim()); if (!i) return null; const j = { ...i, v: Date.now() }; writeAll(j); return j; }
