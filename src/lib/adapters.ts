/*
 * Adapters: the plug socket of UrDeck.
 * A source (a paper database, an image library, an encyclopedia, or anything with a web API) is described by a small
 * JSON "manifest": where to ask, and where in the answer the title, authors, text, picture and link are. The app does the rest:
 * it shows the results in the Research pane, and every result can become a card, a citation, a question for the AI.
 * Manifests are plain data (never code), so a source someone shares cannot run anything on your device.
 * Keys a source needs stay on this device and are never synced.
 */
export type Cat = 'paper' | 'image' | 'article';
export const CATS: { k: Cat; l: string; one: string }[] = [
  { k: 'paper', l: 'Papers', one: 'paper' },
  { k: 'image', l: 'Images', one: 'image' },
  { k: 'article', l: 'Articles', one: 'article' }
];
type Field = 'title' | 'by' | 'year' | 'text' | 'link' | 'pdf' | 'thumb' | 'image' | 'license' | 'id';
export interface Manifest {
  v?: 1;
  id: string; name: string; about?: string; cat: Cat;
  /** Request address. {q} = what was typed, {n} = how many results, {key} = the user's key. Must be https and answer to browsers (CORS). */
  url: string;
  format?: 'json' | 'xml';
  /** JSON: path to the list of results. XML: selector of one result. */
  items: string;
  /** For each field: a path (a.b.0.c), optionally followed by |transforms, or a template such as https://site/{id}. XML: selector, optional @attribute. */
  map: Partial<Record<Field, string>>;
  /** If the source needs a key the student supplies. */
  key?: { where: 'query' | 'header'; param?: string; required?: boolean; help?: string };
  builtin?: boolean;
}
export interface Item { id: string; src: string; srcName: string; cat: Cat; title: string; by?: string; year?: string; text?: string; link?: string; pdf?: string; thumb?: string; image?: string; license?: string }

export const BUILTIN: Manifest[] = [
  { v: 1, id: 'openalex', name: 'OpenAlex', about: 'Research papers from every field, with abstracts and free PDFs when they exist.', cat: 'paper', builtin: true,
    url: 'https://api.openalex.org/works?search={q}&per-page={n}&select=id,display_name,publication_year,authorships,abstract_inverted_index,open_access,doi',
    items: 'results', map: { id: 'id', title: 'display_name', by: 'authorships|names', year: 'publication_year', text: 'abstract_inverted_index|invidx', link: 'doi', pdf: 'open_access.oa_url' } },
  { v: 1, id: 'arxiv', name: 'arXiv', about: 'Free preprints in physics, maths, computing, biology and more.', cat: 'paper', builtin: true, format: 'xml',
    url: 'https://export.arxiv.org/api/query?search_query=all:{q}&max_results={n}',
    items: 'entry', map: { id: 'id', title: 'title|strip', by: 'author name|all|names', year: 'published|year', text: 'summary|strip', link: 'id', pdf: 'link[title=pdf]@href' } },
  { v: 1, id: 'wikipedia', name: 'Wikipedia', about: 'Plain explanations and a lead picture for almost any topic.', cat: 'article', builtin: true,
    url: 'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={q}&gsrlimit={n}&prop=extracts|pageimages|info&exintro=1&explaintext=1&exlimit=max&exsentences=4&piprop=thumbnail&pithumbsize=360&inprop=url&format=json&origin=*',
    items: 'query.pages', map: { id: 'pageid', title: 'title', text: 'extract', thumb: 'thumbnail.source', link: 'fullurl' } },
  { v: 1, id: 'commons', name: 'Wikimedia Commons', about: 'Free diagrams, photos and illustrations with the author and licence named.', cat: 'image', builtin: true,
    url: 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch={q}&gsrlimit={n}&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=720&format=json&origin=*',
    items: 'query.pages', map: { id: 'pageid', title: 'title|file', by: 'imageinfo.0.extmetadata.Artist.value|strip', license: 'imageinfo.0.extmetadata.LicenseShortName.value', thumb: 'imageinfo.0.thumburl', image: 'imageinfo.0.thumburl', link: 'imageinfo.0.descriptionurl' } },
  { v: 1, id: 'openverse', name: 'Openverse', about: 'Openly licensed pictures from many collections.', cat: 'image', builtin: true,
    url: 'https://api.openverse.org/v1/images/?q={q}&page_size={n}',
    items: 'results', map: { id: 'id', title: 'title', by: 'creator', license: 'license', thumb: 'thumbnail', image: 'url', link: 'foreign_landing_url' } }
];

/* ---------- storage (this device only) ---------- */
const K = 'ud-adapters-v1';
interface Store { off: string[]; custom: Manifest[]; keys: Record<string, string> }
const blank = (): Store => ({ off: [], custom: [], keys: {} });
const load = (): Store => { try { const s = JSON.parse(localStorage.getItem(K) || 'null'); return s ? { ...blank(), ...s } : blank(); } catch { return blank(); } };
const put = (s: Store) => { try { localStorage.setItem(K, JSON.stringify(s)); } catch { /* ignore */ } try { dispatchEvent(new Event('ud-adapters')); } catch { /* ignore */ } };

export const adapters = {
  all(): Manifest[] { return [...BUILTIN, ...load().custom]; },
  isOn(id: string) { return !load().off.includes(id); },
  on(cat?: Cat): Manifest[] { const s = load(); return this.all().filter(m => !s.off.includes(m.id) && (!cat || m.cat === cat)); },
  toggle(id: string) { const s = load(); s.off = s.off.includes(id) ? s.off.filter(x => x !== id) : [...s.off, id]; put(s); },
  key(id: string) { return load().keys[id] || ''; },
  setKey(id: string, k: string) { const s = load(); if (k.trim()) s.keys[id] = k.trim(); else delete s.keys[id]; put(s); },
  add(m: Manifest) { const s = load(); s.custom = [...s.custom.filter(x => x.id !== m.id), { ...m, builtin: false }]; put(s); },
  remove(id: string) { const s = load(); s.custom = s.custom.filter(x => x.id !== id); delete s.keys[id]; put(s); }
};

/* ---------- manifest check ---------- */
export function checkManifest(x: any): { m?: Manifest; err?: string } {
  if (!x || typeof x !== 'object') return { err: 'That is not a source description.' };
  const id = String(x.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!id || id.length > 32) return { err: 'Give it a short id using letters, numbers and dashes.' };
  if (BUILTIN.some(b => b.id === id)) return { err: 'That id is already used by a built-in source.' };
  if (!String(x.name || '').trim()) return { err: 'Give it a name.' };
  if (!CATS.some(c => c.k === x.cat)) return { err: 'cat must be paper, image or article.' };
  const url = String(x.url || '');
  if (!/^https:\/\//i.test(url)) return { err: 'The address must start with https://' };
  if (!url.includes('{q}')) return { err: 'The address must contain {q} where the search words go.' };
  if (!String(x.items || '').trim()) return { err: 'Say where the list of results is (items).' };
  const map = x.map && typeof x.map === 'object' ? x.map : {};
  if (!map.title) return { err: 'map needs at least a title.' };
  const cleanMap: Manifest['map'] = {};
  (['title', 'by', 'year', 'text', 'link', 'pdf', 'thumb', 'image', 'license', 'id'] as Field[]).forEach(f => { if (typeof map[f] === 'string' && map[f]) cleanMap[f] = String(map[f]).slice(0, 300); });
  if (x.cat === 'image' && !cleanMap.thumb && !cleanMap.image) return { err: 'An image source needs thumb or image in map.' };
  const key = x.key && typeof x.key === 'object' ? { where: x.key.where === 'header' ? 'header' as const : 'query' as const, param: String(x.key.param || '').slice(0, 40) || undefined, required: !!x.key.required, help: String(x.key.help || '').slice(0, 160) || undefined } : undefined;
  return { m: { v: 1, id, name: String(x.name).trim().slice(0, 40), about: String(x.about || '').slice(0, 200), cat: x.cat, url: url.slice(0, 900), format: x.format === 'xml' ? 'xml' : 'json', items: String(x.items).slice(0, 200), map: cleanMap, key } };
}
export const EXAMPLE = JSON.stringify({
  id: 'crossref', name: 'Crossref', about: 'Journal articles by title or topic.', cat: 'paper',
  url: 'https://api.crossref.org/works?query={q}&rows={n}&select=DOI,title,author,issued,abstract,URL',
  items: 'message.items', map: { id: 'DOI', title: 'title.0', by: 'author|names', year: 'issued.date-parts.0.0', text: 'abstract|strip', link: 'URL' }
}, null, 2);

/* ---------- reading an answer ---------- */
const T: Record<string, (v: any) => any> = {
  invidx: v => { if (!v || typeof v !== 'object') return ''; const w: string[] = []; for (const [k, ps] of Object.entries(v)) (ps as number[]).forEach(p => { w[p] = k; }); return w.filter(Boolean).join(' '); },
  strip: v => (Array.isArray(v) ? v.join(' ') : String(v ?? '')).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(),
  names: v => Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : x?.author?.display_name || x?.display_name || x?.name || [x?.given, x?.family].filter(Boolean).join(' ') || '').filter(Boolean).slice(0, 6).join(', ') + (v.length > 6 ? ' et al.' : '') : String(v ?? ''),
  year: v => (String(v ?? '').match(/\d{4}/) || [''])[0],
  file: v => String(v ?? '').replace(/^File:/, '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ')
};
const jget = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function xget(n: Element, path: string, all: boolean): any {
  const [sel, attr] = path.split('@');
  const pick = (e: Element | null) => e ? (attr ? e.getAttribute(attr) : (e.textContent || '').trim()) : '';
  try { return all ? [...n.querySelectorAll(sel)].map(pick) : pick(n.querySelector(sel)); } catch { return ''; }
}
function one(node: any, spec: string, xml: boolean): any {
  const [path, ...ts] = spec.split('|');
  let v: any = xml ? xget(node, path, ts.includes('all')) : jget(node, path);
  for (const t of ts) if (T[t]) v = T[t](v);
  return v;
}
function evalSpec(node: any, spec: string, xml: boolean): string {
  const out = spec.includes('{') ? spec.replace(/\{([^}]+)\}/g, (_m, s) => { const v = one(node, s, xml); return Array.isArray(v) ? v.join(', ') : String(v ?? ''); }) : one(node, spec, xml);
  return Array.isArray(out) ? out.join(', ') : String(out ?? '').trim();
}
const web = (u?: string) => { const s = String(u || '').replace(/^http:\/\//i, 'https://'); return /^https:\/\//i.test(s) ? s : ''; };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function parseAnswer(m: Manifest, raw: string): Item[] {
  const xml = m.format === 'xml'; let list: any[] = [];
  if (xml) { const d = new DOMParser().parseFromString(raw, 'text/xml'); try { list = [...d.querySelectorAll(m.items)]; } catch { list = []; } }
  else {
    let j: any; try { j = JSON.parse(raw); } catch { throw new Error(m.name + ' did not answer in a readable way.'); }
    const l = jget(j, m.items);
    list = Array.isArray(l) ? l : l && typeof l === 'object' ? Object.values(l).sort((a: any, b: any) => (a?.index || 0) - (b?.index || 0)) : [];
  }
  const out: Item[] = [];
  for (const n of list) {
    const g = (f: Field) => (m.map[f] ? evalSpec(n, m.map[f]!, xml) : '');
    const title = clip(g('title'), 220); if (!title) continue;
    const it: Item = { id: m.id + ':' + (g('id') || title), src: m.id, srcName: m.name, cat: m.cat, title, by: clip(g('by'), 160) || undefined, year: g('year').match(/\d{4}/)?.[0], text: clip(g('text'), 1400) || undefined, link: web(g('link')) || undefined, pdf: web(g('pdf')) || undefined, thumb: web(g('thumb')) || undefined, image: web(g('image')) || undefined, license: clip(T.strip(g('license')), 40) || undefined };
    if (m.cat === 'image' && !it.thumb && !it.image) continue;
    out.push(it);
  }
  return out;
}

const memo = new Map<string, Item[]>();
/** Ask every switched-on source of one kind at once. One slow or broken source never hides the others. */
export async function search(cat: Cat, q: string, n = 8): Promise<{ items: Item[]; errs: string[] }> {
  const ms = adapters.on(cat), errs: string[] = [];
  if (!ms.length) return { items: [], errs: ['No source is switched on for this. Open Sources to turn one on.'] };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { items: [], errs: ['You are offline. Results need the internet.'] };
  const res = await Promise.all(ms.map(async m => {
    const key = adapters.key(m.id), ck = m.id + '|' + n + '|' + q.toLowerCase() + '|' + (key ? 1 : 0);
    if (memo.has(ck)) return memo.get(ck)!;
    if (m.key?.required && !key) { errs.push(m.name + ' needs your key. Add it in Sources.'); return [] as Item[]; }
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
    try {
      const url = m.url.replace(/\{q\}/g, encodeURIComponent(q)).replace(/\{n\}/g, String(n)).replace(/\{key\}/g, encodeURIComponent(key));
      const headers: Record<string, string> = {}; if (m.key?.where === 'header' && key) headers[m.key.param || 'Authorization'] = key;
      const r = await fetch(url, { headers, signal: ac.signal });
      if (!r.ok) throw new Error(m.name + ' answered ' + r.status + '.');
      const items = parseAnswer(m, await r.text()); memo.set(ck, items); return items;
    } catch (x: any) { errs.push(x?.name === 'AbortError' ? m.name + ' took too long.' : /answered|readable/.test(x?.message || '') ? x.message : m.name + ' could not be reached (it may not allow apps, or you are offline).'); return [] as Item[]; }
    finally { clearTimeout(t); }
  }));
  const seen = new Set<string>(), items: Item[] = [], max = Math.max(0, ...res.map(r => r.length));
  for (let i = 0; i < max; i++) for (const r of res) { const it = r[i]; if (!it) continue; const k = it.title.toLowerCase(); if (seen.has(k)) continue; seen.add(k); items.push(it); }
  return { items, errs };
}

export const cite = (i: Item) => [i.by, i.year ? '(' + i.year + ')' : '', i.title + '.', i.srcName + '.', i.link || i.pdf || ''].filter(Boolean).join(' ').replace(/\s+\./g, '.');
