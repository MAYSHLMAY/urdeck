/* Articles the owner has published. Readers open them from the server; after the first read they open offline. */
import { apiUrl } from '../base';
import { api } from '../api';
import { timedFetch } from '../net';

export type PubMeta = { slug: string; title: string; summary: string; version: number; reading_minutes: number; published_at: string; updated_at: string };
const K_LIST = 'ud-art-list', CACHE = 'ud-art-pub';
const jget = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

/** Published articles. Offline or failing: the last list that worked. */
export async function pubList(): Promise<PubMeta[]> {
  try {
    const r = await timedFetch(apiUrl('/api/articles'), {}, 8000); if (!r.ok) throw new Error('x');
    const list = ((await r.json()).articles || []) as PubMeta[];
    try { localStorage.setItem(K_LIST, JSON.stringify(list)); } catch { /* ignore */ }
    return list;
  } catch { return (jget(K_LIST) as PubMeta[]) || []; }
}
export async function pubHtml(slug: string): Promise<{ html: string; meta: PubMeta } | null> {
  const url = apiUrl('/api/articles?slug=' + encodeURIComponent(slug));
  try {
    const r = await timedFetch(url, {}, 15_000);
    if (r.ok) { try { (await caches.open(CACHE)).put(url, r.clone()); } catch { /* no cache: fine */ } return await r.json(); }
    if (r.status === 404) return null;
  } catch { /* offline or slow: use the saved copy */ }
  try { const hit = await (await caches.open(CACHE)).match(url); if (hit) return await hit.json(); } catch { /* ignore */ }
  return null;
}
export const publish = (a: { slug: string; title: string; summary?: string; html: string }) => api<{ slug: string; version: number }>('/api/articles', { action: 'publish', ...a });
