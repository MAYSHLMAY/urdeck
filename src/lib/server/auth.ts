import { createHmac, timingSafeEqual } from 'crypto';

const DAYS = 30;

function secret() {
  const s = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('AUTH_SECRET is not set.');
  return s;
}
const sig = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function passwordOk(input: string) {
  const want = process.env.OWNER_PASSWORD;
  if (!want) throw new Error('OWNER_PASSWORD is not set.');
  const a = Buffer.from(String(input).trim()), b = Buffer.from(want.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken() {
  const exp = Date.now() + DAYS * 86400000;
  const body = Buffer.from(JSON.stringify({ o: 1, exp })).toString('base64url');
  return { token: body + '.' + sig(body), exp };
}

export function tokenOk(token: string | null | undefined) {
  if (!token) return false;
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;
  const want = sig(body);
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

export function requireOwner(req: Request) {
  const h = req.headers.get('authorization') || '';
  return tokenOk(h.startsWith('Bearer ') ? h.slice(7) : null);
}

/* very small in-memory brute-force brake (per server instance) */
const tries = new Map<string, { n: number; t: number }>();
export function throttle(ip: string) {
  const now = Date.now(), r = tries.get(ip);
  if (!r || now - r.t > 15 * 60000) { tries.set(ip, { n: 1, t: now }); return false; }
  r.n++;
  return r.n > 8;
}
export const clearThrottle = (ip: string) => tries.delete(ip);

/**
 * Extra lock for destructive actions: the caller must be the owner AND re-type the password.
 * Wrong passwords are counted per IP (8 failures in 15 minutes blocks further tries).
 * Returns an error message, or null when the delete may go ahead.
 */
const delFails = new Map<string, { n: number; t: number }>();
export function guardDelete(req: Request, password: unknown): string | null {
  if (!requireOwner(req)) return 'Locked. Unlock with the owner password.';
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const now = Date.now(), r = delFails.get(ip);
  if (r && now - r.t <= 15 * 60000 && r.n >= 8) return 'Too many wrong passwords. Try again in a few minutes.';
  if (typeof password === 'string' && password && passwordOk(password)) { delFails.delete(ip); return null; }
  if (!r || now - r.t > 15 * 60000) delFails.set(ip, { n: 1, t: now }); else r.n++;
  return password ? 'Wrong password. Nothing was deleted.' : 'Enter the owner password to delete.';
}
