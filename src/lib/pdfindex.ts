/*
 * Background PDF text index: powers "auto-find" (match a quiz card to the passage that explains it) and in-PDF search.
 * Built once per PDF with pdf.js, kept in memory and cached in IndexedDB, so later lookups are instant and offline.
 * Positions are stored as page fractions, so the same highlight works at any zoom.
 */
import { loadPdfjs } from './pdfjs';
import type { Hi } from './refs';

export interface Item { s: number; e: number; x: number; y: number; w: number; h: number }
export interface PageIdx {
  n: number; text: string; items: Item[];
  toks: string[]; offs: number[]; ends: number[];     // derived on load: stemmed tokens and their char ranges
}
export interface PdfIndex { key: string; pages: PageIdx[]; df: Map<string, number>; hasText: boolean }
export interface Passage { page: number; score: number; rects: Hi[]; box: Hi; snippet: string }
export interface CardText { title: string; question: string; correct: string; wrong: string[] }

const DB = 'fr-pdfidx-v1', ST = 'idx', VER = 2;
const r4 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;

/* ---------- tokenising ---------- */
const STOP = new Set(('a an and are as at be been being but by can could did do does for from had has have he her his how i if in into is it its may might more most no not of on or our out over she so some such than that the their them then there these they this those to was we were what when where which while who whom why will with would you your also about after all any because both each few other only same should very which following correct incorrect true false choose select best answer statement').split(' '));

export function stem(w: string) {
  if (w.length <= 4) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';
  for (const suf of ['ing', 'ed', 'es', 'ly', 's']) if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  return w;
}
const WORD = /[\p{L}\p{N}]+/gu;
export function tokenize(text: string) {
  const toks: string[] = [], offs: number[] = [], ends: number[] = [];
  WORD.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = WORD.exec(text))) { toks.push(stem(m[0])); offs.push(m.index); ends.push(m.index + m[0].length); }
  return { toks, offs, ends };
}
const usable = (t: string) => !STOP.has(t) && (t.length >= 3 || (t.length >= 2 && /\d/.test(t)));

function derive(p: { n: number; text: string; items: Item[] }): PageIdx {
  const t = tokenize(p.text);
  return { n: p.n, text: p.text, items: p.items, toks: t.toks, offs: t.offs, ends: t.ends };
}
function finish(key: string, raw: { n: number; text: string; items: Item[] }[]): PdfIndex {
  const pages = raw.map(derive), df = new Map<string, number>();
  pages.forEach(p => new Set(p.toks).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  const chars = pages.reduce((a, p) => a + p.text.length, 0);
  return { key, pages, df, hasText: chars > 40 * Math.max(1, pages.length) * 0.2 };
}

/* ---------- storage ---------- */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'key' });
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
}
async function readCache(key: string): Promise<PdfIndex | null> {
  const db = await openDb(); if (!db) return null;
  return new Promise(res => {
    try {
      const q = db.transaction(ST).objectStore(ST).get(key);
      q.onsuccess = () => {
        const r = q.result; if (!r || r.v !== VER) { res(null); return; }
        res(finish(key, r.pages.map((p: any) => ({ n: p.n, text: p.t, items: p.i.map((a: number[]) => ({ s: a[0], e: a[1], x: a[2], y: a[3], w: a[4], h: a[5] })) }))));
      };
      q.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function writeCache(ix: PdfIndex) {
  const db = await openDb(); if (!db) return;
  try {
    db.transaction(ST, 'readwrite').objectStore(ST).put({ key: ix.key, v: VER, pages: ix.pages.map(p => ({ n: p.n, t: p.text, i: p.items.map(i => [i.s, i.e, i.x, i.y, i.w, i.h]) })) });
  } catch { /* the index still works from memory */ }
}

/* ---------- building ---------- */
const mem = new Map<string, Promise<PdfIndex>>();
export const indexProgress = new Map<string, number>();

async function build(key: string, url: string): Promise<PdfIndex> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
  const raw: { n: number; text: string; items: Item[] }[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
      let text = ''; const items: Item[] = [];
      for (const it of tc.items as any[]) {
        if (typeof it.str !== 'string' || !it.str.trim()) continue;
        const str = it.str.toLowerCase(), s = text.length;
        text += str; const e = text.length;
        text += str.endsWith(' ') ? '' : ' ';
        const [px, py] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = (it.height || Math.hypot(it.transform[2], it.transform[3]) || 10);
        items.push({ s, e, x: r4(px / vp.width), y: r4((py - h * 0.88) / vp.height), w: r4(Math.min(it.width || 0, vp.width - px) / vp.width), h: r4((h * 1.12) / vp.height) });
      }
      raw.push({ n, text, items });
      page.cleanup();
      indexProgress.set(key, n / doc.numPages);
      if (n % 3 === 0) await new Promise(r => setTimeout(r, 0)); // stay responsive while the quiz is in use
    }
  } finally { try { doc.destroy(); } catch { /* ignore */ } }
  const ix = finish(key, raw);
  indexProgress.delete(key);
  writeCache(ix);
  return ix;
}

/** The index for one PDF: from memory, then the device cache, then built in the background. */
export function getIndex(key: string, url: string): Promise<PdfIndex> {
  let p = mem.get(key);
  if (!p) {
    p = readCache(key).then(c => c || build(key, url));
    mem.set(key, p);
    p.catch(() => mem.delete(key)); // let a later call try again
  }
  return p;
}
export const peekIndex = async (key: string): Promise<PdfIndex | null> => { const p = mem.get(key); return p ? p.catch(() => null) : null; };

/* ---------- geometry ---------- */
function rectsFor(p: PageIdx, from: number, to: number): Hi[] {
  const out: Hi[] = [];
  for (const it of p.items) {
    if (it.e <= from || it.s >= to) continue;
    const len = Math.max(1, it.e - it.s), a = Math.max(0, (Math.max(from, it.s) - it.s) / len), b = Math.min(1, (Math.min(to, it.e) - it.s) / len);
    if (b <= a) continue;
    const r = { x: it.x + a * it.w, y: it.y, width: (b - a) * it.w, height: it.h };
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - r.y) < r.height * 0.4 && r.x - (last.x + last.width) < 0.012 && r.x >= last.x - 0.002) {
      const x1 = Math.max(last.x + last.width, r.x + r.width); last.width = x1 - last.x; last.height = Math.max(last.height, r.height);
    } else out.push(r);
  }
  return out.map(r => ({ x: r4(r.x), y: r4(r.y), width: r4(Math.min(r.width, 1 - r.x)), height: r4(r.height) }));
}
export function boxOf(rs: Hi[]): Hi {
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.width)), y1 = Math.max(...rs.map(r => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/* ---------- manual search ---------- */
export interface Hit { page: number; rects: Hi[]; box: Hi }
/** Phrase search: words in order, the last word may be a prefix ("aerodyn" finds "aerodynamics"). */
export function findPhrase(ix: PdfIndex, query: string, limit = 300): Hit[] {
  const q = tokenize(query.toLowerCase()).toks; if (!q.length) return [];
  const out: Hit[] = [];
  for (const p of ix.pages) {
    const T = p.toks;
    for (let i = 0; i + q.length <= T.length && out.length < limit; i++) {
      let ok = true;
      for (let j = 0; j < q.length; j++) { const t = T[i + j], w = q[j]; if (j === q.length - 1 ? !t.startsWith(w) : t !== w) { ok = false; break; } }
      if (!ok) continue;
      const rects = rectsFor(p, p.offs[i], p.ends[i + q.length - 1]);
      if (rects.length) out.push({ page: p.n, rects, box: boxOf(rects) });
    }
  }
  return out;
}

/* ---------- auto-find: which passage explains this card? ---------- */
const clean = (s: string) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ').replace(/\[\[|\]\]/g, ' ');

export function matchCard(ix: PdfIndex, ct: CardText, max = 4): Passage[] {
  if (!ix.hasText) return [];
  const N = ix.pages.length, W = new Map<string, number>();
  const add = (text: string, w: number) => { tokenize(clean(text).toLowerCase()).toks.forEach(t => { if (usable(t) && (W.get(t) || 0) < w) W.set(t, w); }); };
  ct.wrong.forEach(x => add(x, 0.2)); add(ct.title, 0.5); add(ct.question, 1); add(ct.correct, 1.6);
  const idf = (t: string) => { const d = ix.df.get(t) || 0; return d ? Math.log(1 + (N - d + 0.5) / (d + 0.5)) : 0; };
  const qw = new Map<string, number>(); let total = 0;
  W.forEach((w, t) => { const v = w * idf(t); if (v > 0) { qw.set(t, v); total += v; } });
  if (qw.size < 2) return [];
  const need = qw.size <= 3 ? 2 : 3, SPAN = 45;
  const bigrams = new Set<string>();
  const qt = tokenize(clean(ct.question + ' . ' + ct.correct).toLowerCase()).toks;
  for (let i = 0; i + 1 < qt.length; i++) if (qw.has(qt[i]) && qw.has(qt[i + 1])) bigrams.add(qt[i] + ' ' + qt[i + 1]);

  const found: (Passage & { distinct: number; from: number; to: number })[] = [];
  for (const p of ix.pages) {
    const hits: { i: number; t: string }[] = [];
    for (let i = 0; i < p.toks.length && hits.length < 160; i++) if (qw.has(p.toks[i])) hits.push({ i, t: p.toks[i] });
    if (hits.length < 2) continue;
    let best = 0, bFrom = 0, bTo = 0, bDistinct = 0;
    for (let a = 0; a < hits.length; a++) {
      const seen = new Set<string>(); let sc = 0, last = a;
      for (let b = a; b < hits.length && hits[b].i - hits[a].i < SPAN; b++) {
        const t = hits[b].t;
        if (!seen.has(t)) { seen.add(t); sc += qw.get(t)!; }
        if (b > a && hits[b].i - hits[b - 1].i === 1 && bigrams.has(hits[b - 1].t + ' ' + t)) sc += (qw.get(t)! + qw.get(hits[b - 1].t)!) * 0.35;
        last = b;
      }
      if (sc > best) { best = sc; bFrom = hits[a].i; bTo = hits[last].i; bDistinct = seen.size; }
    }
    if (bDistinct < need) continue;
    const from = Math.max(0, bFrom - 3), to = Math.min(p.toks.length - 1, Math.min(bTo + 3, from + 60));
    found.push({ page: p.n, score: best / total, rects: [], box: { x: 0, y: 0, width: 0, height: 0 }, snippet: '', distinct: bDistinct, from, to });
  }
  found.sort((a, b) => b.score - a.score);
  const out: Passage[] = [];
  for (const f of found.slice(0, max)) {
    if (f.score < 0.16 && out.length) continue;
    if (f.score < 0.12) continue;
    const p = ix.pages[f.page - 1], rects = rectsFor(p, p.offs[f.from], p.ends[f.to]);
    if (!rects.length) continue;
    out.push({ page: f.page, score: f.score, rects, box: boxOf(rects), snippet: p.text.slice(p.offs[f.from], p.ends[f.to]).slice(0, 160) });
  }
  return out;
}
