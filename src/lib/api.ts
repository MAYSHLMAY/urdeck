/* Browser side of the owner login + API calls. */
const K_TOKEN = 'fr-owner-token-v2';

type Tok = { token: string; exp: number };
const read = (): Tok | null => {
  try { const t = JSON.parse(localStorage.getItem(K_TOKEN) || 'null'); return t && t.exp > Date.now() ? t : null; } catch { return null; }
};

export const isOwner = () => typeof window !== 'undefined' && !!read();
export const lock = () => { try { localStorage.removeItem(K_TOKEN); } catch { /* ignore */ } };

export async function unlock(password: string): Promise<string | null> {
  try {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error || 'Could not unlock.';
    localStorage.setItem(K_TOKEN, JSON.stringify(j));
    return null;
  } catch { return 'Could not reach the server.'; }
}

export class ApiError extends Error { constructor(m: string, public status: number) { super(m); } }

export async function api<T = any>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const t = read();
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t.token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) lock();
  if (!r.ok) throw new ApiError(j.error || 'Request failed (' + r.status + ')', r.status);
  return j as T;
}
