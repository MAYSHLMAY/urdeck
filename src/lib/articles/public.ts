/* Articles the owner has published. Readers open them from the server; after the first read they open offline. */
import { apiUrl } from '../base';
import { api } from '../api';
import { timedFetch } from '../net';
import { pubSavedGet, pubSavedPut } from './local';

export type PubMeta = { slug: string; title: string; summary: string; version: number; reading_minutes: number; published_at: string; updated_at: string };
const K_LIST = 'ud-art-list';
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
/** An article's page. The copy saved on this device comes first (instant, works offline); otherwise it is downloaded and saved. */
export async function pubHtml(slug: string): Promise<{ html: string; meta: PubMeta } | null> {
  try { const s = await pubSavedGet(slug); if (s) return { html: s.html, meta: { slug, title: s.title, summary: s.summary, version: s.version, reading_minutes: 1, published_at: '', updated_at: '' } }; } catch { /* storage unavailable: use the network */ }
  const url = apiUrl('/api/articles?slug=' + encodeURIComponent(slug));
  try {
    const r = await timedFetch(url, {}, 20_000);
    if (!r.ok) return null;
    const j = await r.json() as { html: string; meta: PubMeta };
    try { await pubSavedPut({ slug, version: j.meta.version, title: j.meta.title, summary: j.meta.summary, html: j.html, saved: Date.now() }); } catch { /* ignore */ }
    return j;
  } catch { return null; }
}
/** Keep every published article on this device, and refresh the ones that have a newer version. Runs quietly in the background. */
export async function pubSync(list: PubMeta[]) {
  for (const m of list) {
    try {
      const s = await pubSavedGet(m.slug); if (s && s.version >= m.version) continue;
      const r = await timedFetch(apiUrl('/api/articles?slug=' + encodeURIComponent(m.slug)), {}, 30_000); if (!r.ok) continue;
      const j = await r.json() as { html: string; meta: PubMeta };
      await pubSavedPut({ slug: m.slug, version: j.meta.version, title: j.meta.title, summary: j.meta.summary, html: j.html, saved: Date.now() });
    } catch { /* offline or slow: try again next time */ }
  }
}
export const publish = (a: { slug: string; title: string; summary?: string; html: string }) => api<{ slug: string; version: number }>('/api/articles', { action: 'publish', ...a });
