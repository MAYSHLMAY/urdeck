import { NextResponse } from 'next/server';

/* Two small protections for routes that anyone can call: a cap on how much one request may send, and a cap on how often one visitor may call.
   The counters live in the server's memory. On Vercel each server instance counts separately, so this stops runaway scripts and mistakes
   rather than a determined attacker; Vercel's firewall rate limit (Settings > Firewall) is the stronger second layer. */

export const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local').split(',')[0].trim().slice(0, 64);

const HITS = new Map<string, number[]>();
/** true when this visitor has made more than `max` calls to `name` in the last `ms` milliseconds (and counts this call). */
export function tooMany(req: Request, name: string, max: number, ms = 60_000, now = Date.now()): boolean {
  const k = name + '|' + ipOf(req), a = (HITS.get(k) || []).filter(t => now - t < ms);
  a.push(now); HITS.set(k, a);
  if (HITS.size > 5000) for (const [kk, v] of HITS) if (!v.length || now - v[v.length - 1] > ms) HITS.delete(kk);
  return a.length > max;
}
export const slow = () => NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': '30' } });

/** Distinct values (for example sync spaces) one visitor may touch within a window. Returns true when over the limit. */
const SEEN = new Map<string, Map<string, number>>();
export function tooManyKinds(req: Request, name: string, value: string, max: number, ms = 3_600_000, now = Date.now()): boolean {
  const k = name + '|' + ipOf(req); let m = SEEN.get(k); if (!m) SEEN.set(k, m = new Map());
  for (const [v, t] of m) if (now - t > ms) m.delete(v);
  if (!m.has(value) && m.size >= max) return true;
  m.set(value, now);
  if (SEEN.size > 5000) SEEN.clear();
  return false;
}

/** Read a JSON body but refuse anything bigger than `max` bytes (the header is not trusted: the text itself is measured). */
export async function readJson(req: Request, max: number): Promise<any> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw Object.assign(new Error('Too much at once.'), { status: 413 });
  const raw = await req.text();
  if (raw.length > max) throw Object.assign(new Error('Too much at once.'), { status: 413 });
  return JSON.parse(raw);
}
export const statusOf = (e: any, d = 500) => (typeof e?.status === 'number' ? e.status : d);
