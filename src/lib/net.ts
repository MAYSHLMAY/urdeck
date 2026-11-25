/* One place for every network call the app makes, so a bad connection never freezes anything.
   - Every call has a time limit (a half-dead connection used to hang forever and block later syncs).
   - A failed call is reported as "no connection", not as a scary error.
   - The app keeps a simple idea of "am I really online?" that is based on what actually happens, not only on what the phone claims. */

export class NetError extends Error { constructor(m: string, public kind: 'timeout' | 'offline') { super(m); this.name = 'NetError'; } }
export const isNetErr = (e: unknown) => e instanceof NetError || (e as any)?.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed|network/i.test(String((e as any)?.message || e));

/* ---------- is the connection really there? ---------- */
type L = () => void;
const ls = new Set<L>();
let fails = 0, lastOk = 0, lastFail = 0, wentOffline = 0;
const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
export function offline(now = Date.now()): boolean {
  if (!browserOnline()) return true;
  return fails >= 2 && lastFail > lastOk && now - lastFail < 45_000;   // two failures in a row, nothing good since, and recent
}
const tell = () => { const o = offline(); if (o && !wentOffline) wentOffline = Date.now(); if (!o) wentOffline = 0; ls.forEach(f => f()); };
export const netOk = (now = Date.now()) => { const was = offline(now); fails = 0; lastOk = now; if (was) tell(); };
export const netFail = (now = Date.now()) => { fails++; lastFail = now; tell(); };
export const sinceOffline = () => (wentOffline ? Date.now() - wentOffline : 0);
export const onNet = (f: L) => { ls.add(f); return () => { ls.delete(f); }; };
/** For tests. */
export const _resetNet = () => { fails = 0; lastOk = 0; lastFail = 0; wentOffline = 0; ls.clear(); };
if (typeof window !== 'undefined') { addEventListener('online', () => { fails = 0; tell(); }); addEventListener('offline', tell); }

/* ---------- calls ---------- */
/** fetch with a time limit. Throws NetError('timeout' | 'offline') on network trouble; answers from the server (even 4xx/5xx) count as "connected". */
export async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ac = new AbortController(), outer = init.signal;
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; ac.abort(); }, ms);
  const fwd = () => ac.abort();
  if (outer) { if (outer.aborted) ac.abort(); else outer.addEventListener('abort', fwd, { once: true }); }
  try {
    const r = await fetch(input, { ...init, signal: ac.signal });
    netOk(); return r;
  } catch (e: any) {
    if (timedOut) { netFail(); throw new NetError('The connection is too slow right now.', 'timeout'); }
    if (outer?.aborted) throw e;                      // the caller cancelled on purpose: not a network problem
    netFail(); throw new NetError('No connection right now.', 'offline');
  } finally { clearTimeout(t); outer?.removeEventListener('abort', fwd); }
}
/** For reads that are safe to repeat: try again a couple of times with a short wait. */
export async function fetchRetry(input: RequestInfo | URL, init: RequestInit = {}, o: { tries?: number; ms?: number; wait?: number } = {}): Promise<Response> {
  const tries = o.tries ?? 3; let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { const r = await timedFetch(input, init, o.ms); if (r.status < 500 || i === tries - 1) return r; last = new Error('server ' + r.status); }
    catch (e) { last = e; if (init.signal?.aborted) throw e; }
    if (i < tries - 1) await new Promise(res => setTimeout(res, (o.wait ?? 600) * (i + 1)));
  }
  throw last;
}
