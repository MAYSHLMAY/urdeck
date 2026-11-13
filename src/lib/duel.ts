/* Challenge a friend: everything needed travels inside the link (card ids, a shuffle seed, the sender's score). No server, no account. */
export interface Challenge { v: 1; ids: string[]; seed: number; by: string; sc?: number; ms?: number }
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const encodeChallenge = (c: Challenge) => b64(JSON.stringify(c));
export function decodeChallenge(h: string): Challenge | null {
  try { const c = JSON.parse(unb64(h.replace(/^#/, ''))); return c && c.v === 1 && Array.isArray(c.ids) && c.ids.length ? c : null; } catch { return null; }
}
/** Deterministic shuffle so both players see the same option order. */
export function seeded<T>(a: T[], seed: number): T[] {
  const r = [...a]; let s = (seed >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
export const getName = () => { try { return localStorage.getItem('fr-name') || ''; } catch { return ''; } };
export const setName = (n: string) => { try { localStorage.setItem('fr-name', n.trim().slice(0, 24)); } catch { /* ignore */ } };
