/*
 * Online dictionary with context-aware sense picking (no AI). Definitions come from the free dictionaryapi.dev service
 * (Wiktionary data). The meanings are ranked locally, a simplified Lesk method: a meaning scores higher when its words
 * overlap with the words around the lookup, and when its part of speech fits the neighbouring words (after "the" a noun
 * is likelier, after "to" a verb...). Only the looked-up word is sent; the surrounding text never leaves the device.
 */
export interface Sense { pos: string; def: string; example?: string; score: number }
export interface DefResult { asked: string; word: string; phonetic?: string; audio?: string; senses: Sense[] }
export class DictError extends Error { constructor(public kind: 'offline' | 'none', m: string) { super(m); } }

const STOP = new Set('the and for with that this from are was were has have had its not but you your can will which what when where who whom how why into onto over under than then them they their there these those been being also such any all each more most other some only own same too very just about above after again against because before below between both down during few further here once out off through until while would could should may might must shall one two use used using often usually'.split(' '));
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s|ly)$/, '') : w);
const toks = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !STOP.has(w)).map(stem);
const DET = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'its', 'their', 'his', 'her', 'our', 'your', 'my', 'of', 'any', 'each', 'every', 'some']);
const AUX = new Set(['to', 'will', 'would', 'can', 'could', 'must', 'should', 'may', 'might', 'shall', 'not', 'does', 'did', 'do']);
const ADV = new Set(['very', 'more', 'most', 'too', 'so', 'quite', 'less', 'highly', 'rather']);

const K_C = 'fr-dict-cache-v1';
const mem = new Map<string, any>();
const lsCache = (): Record<string, any> => { try { return JSON.parse(localStorage.getItem(K_C) || '{}'); } catch { return {}; } };
const remember = (w: string, v: any) => {
  mem.set(w, v);
  try { const c = lsCache(); c[w] = v; const k = Object.keys(c); if (k.length > 400) k.slice(0, k.length - 400).forEach(x => delete c[x]); localStorage.setItem(K_C, JSON.stringify(c)); } catch { /* ignore */ }
};
async function getJson(url: string, ms = 20000): Promise<any | null> {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const plain = (h: string) => { try { return (new DOMParser().parseFromString(h, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); } catch { return h.replace(/<[^>]+>/g, ''); } };
/* source 1: Wiktionary's own REST API (small, cached on Wikimedia's CDN, fast on poor networks) */
async function fromWiktionary(w: string): Promise<any[] | null> {
  const j = await getJson('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(w)); if (!j) return null;
  const en: any[] = j.en || []; if (!en.length) return null;
  return [{ word: w, phonetic: '', phonetics: [], meanings: en.map(m => ({
    partOfSpeech: (m.partOfSpeech || '').toLowerCase(),
    definitions: (m.definitions || []).slice(0, 8).map((d: any) => ({ definition: plain(d.definition || ''), example: d.parsedExamples?.[0]?.example ? plain(d.parsedExamples[0].example) : d.examples?.[0] ? plain(d.examples[0]) : undefined })).filter((d: any) => d.definition)
  })).filter((m: any) => m.definitions.length) }];
}
/* source 2: dictionaryapi.dev (has pronunciation text and audio) */
const fromApi = (w: string) => getJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w)).then(j => (Array.isArray(j) ? j : null));
/** First source that has the word wins. "Not found" only counts when every source says so; all failing means offline. */
function firstAnswer(ps: Promise<any[] | null>[]): Promise<any[] | null> {
  return new Promise((res, rej) => {
    let left = ps.length, none = 0, done = false;
    const end = () => { if (--left === 0 && !done) { done = true; none ? res(null) : rej(new DictError('offline', 'The dictionary could not be reached. Check the connection and try again.')); } };
    ps.forEach(p => p.then(v => { if (v && v.length && !done) { done = true; res(v); } else { if (!v) none++; end(); } }, () => end()));
  });
}
async function fetchWord(w: string): Promise<any[] | null> {
  if (mem.has(w)) return mem.get(w);
  const c = lsCache()[w]; if (c) { mem.set(w, c); return c; }
  let v: any[] | null;
  try { v = await firstAnswer([fromWiktionary(w), fromApi(w)]); }
  catch (e) { throw e instanceof DictError ? e : new DictError('offline', 'The dictionary could not be reached.'); }
  if (v) remember(w, v); else mem.set(w, null);
  return v;
}
const forms = (w: string) => {
  const a = [w];
  if (/ies$/.test(w)) a.push(w.replace(/ies$/, 'y'));
  if (/(es|s)$/.test(w)) a.push(w.replace(/es$/, ''), w.replace(/s$/, ''));
  if (/ed$/.test(w)) a.push(w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/(.)\1ed$/, '$1'));
  if (/ing$/.test(w)) a.push(w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/(.)\1ing$/, '$1'));
  if (/ly$/.test(w)) a.push(w.replace(/ly$/, ''));
  if (/er$|est$/.test(w)) a.push(w.replace(/(er|est)$/, ''));
  return [...new Set(a)].filter(x => x.length > 1);
};
const lastWord = (s: string) => ((s.toLowerCase().match(/[a-z']+/g) || []).pop() || '');
const firstWord = (s: string) => ((s.toLowerCase().match(/[a-z']+/g) || [])[0] || '');

export async function define(raw: string, before: string, after: string, hint = ''): Promise<DefResult> {
  const w = raw.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!w) throw new DictError('none', 'Select a word to look up.');
  let data: any[] | null = null, found = w;
  for (const f of forms(w)) { data = await fetchWord(f); if (data) { found = f; break; } }
  if (!data) throw new DictError('none', `No definition found for “${w}”.`);
  const ctx = new Set(toks(before.slice(-350) + ' ' + after.slice(0, 350)));
  toks(hint).forEach(t => ctx.add(t)); ctx.delete(stem(found)); ctx.delete(stem(w));
  const pw = lastWord(before), nw = firstWord(after);
  const guess = (pos: string) => {
    let s = 0;
    if (DET.has(pw)) s += /noun|adjective/.test(pos) ? 3 : /verb/.test(pos) ? -1 : 0;
    if (AUX.has(pw)) s += /verb/.test(pos) ? 3 : 0;
    if (ADV.has(pw)) s += /adjective|adverb/.test(pos) ? 2 : 0;
    if (/ly$/.test(w)) s += /adverb/.test(pos) ? 2 : 0;
    if (/ing$|ed$/.test(w)) s += /verb|adjective/.test(pos) ? 1 : 0;
    if (!DET.has(pw) && /^(the|a|an)$/.test(nw)) s += /verb/.test(pos) ? 2 : 0;
    return s;
  };
  const senses: Sense[] = []; let phonetic = '', audio = '', i = 0;
  for (const e of data) {
    phonetic = phonetic || e.phonetic || (e.phonetics || []).map((p: any) => p.text).find(Boolean) || '';
    audio = audio || (e.phonetics || []).map((p: any) => p.audio).find((a: string) => a) || '';
    for (const m of e.meanings || []) for (const d of m.definitions || []) {
      const t = toks(d.definition + ' ' + (d.example || '')); let ov = 0; t.forEach(x => { if (ctx.has(x)) ov++; });
      senses.push({ pos: m.partOfSpeech || '', def: d.definition, example: d.example, score: ov * 2 + guess(m.partOfSpeech || '') - i++ * 0.05 });
    }
  }
  if (!senses.length) throw new DictError('none', `No definition found for “${w}”.`);
  senses.sort((a, b) => b.score - a.score);
  return { asked: w, word: found, phonetic, audio: audio.startsWith('//') ? 'https:' + audio : audio, senses };
}
