/*
 * Reads the shared library from Supabase.
 *  - Cards are insert-only and ordered by `ord`, so the browser keeps them in IndexedDB and only
 *    downloads what is new since last time (usually nothing). Opening the app is then instant.
 *  - Titles, folders and placements are small and always fetched fresh in the background.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Card, FoldDB } from './types';

let _sb: SupabaseClient | null = null;
export function sb() {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Copy .env.example to .env.local and fill it in.');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

export interface Meta {
  cats: Record<string, string>;
  chapters: Record<string, string>;
  titles: Record<string, string>;
  fold: FoldDB;
}
export const emptyMeta = (): Meta => ({ cats: {}, chapters: {}, titles: {}, fold: { folders: [], place: {} } });

/* ---- tiny IndexedDB key/value ---- */
const DB = 'fr-library-v2', ST = 'kv';
let _db: Promise<IDBDatabase | null> | null = null;
const idb = () => _db || (_db = new Promise(res => {
  try {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  } catch { res(null); }
}));
async function kvGet<T>(k: string): Promise<T | null> {
  const d = await idb(); if (!d) return null;
  return new Promise(res => { try { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res((q.result as T) ?? null); q.onerror = () => res(null); } catch { res(null); } });
}
async function kvSet(k: string, v: unknown) {
  const d = await idb(); if (!d) return;
  await new Promise<void>(res => { try { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); t.onabort = () => res(); } catch { res(); } });
}

interface CardCache { last: number; cards: Card[] }

let _last = 0;
export async function readCache(): Promise<{ cards: Card[]; meta: Meta | null }> {
  const [c, m] = await Promise.all([kvGet<CardCache>('cards'), kvGet<Meta>('meta')]);
  _last = c?.last || 0;
  return { cards: c?.cards || [], meta: m };
}

const PAGE = 1000;
async function pool<T>(n: number, jobs: (() => Promise<T>)[], limit = 5): Promise<T[]> {
  const out: T[] = new Array(n); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, n) }, async () => {
    while (i < n) { const k = i++; out[k] = await jobs[k](); }
  }));
  return out;
}

async function pages<T>(table: string, cols: string, order: string, after?: [string, number]): Promise<T[]> {
  const base = () => {
    let q: any = sb().from(table).select(cols).order(order);
    if (after) q = q.gt(after[0], after[1]);
    return q;
  };
  let cq: any = sb().from(table).select(order, { count: 'exact', head: true });
  if (after) cq = cq.gt(after[0], after[1]);
  const { count, error } = await cq;
  if (error) throw new Error(error.message);
  const n = Math.ceil((count || 0) / PAGE);
  const res = await pool(n, Array.from({ length: n }, (_, i) => async () => {
    const r = await base().range(i * PAGE, i * PAGE + PAGE - 1);
    if (r.error) throw new Error(r.error.message);
    return (r.data || []) as T[];
  }));
  return res.flat();
}

export async function fetchMeta(): Promise<Meta> {
  const [titles, folders, place] = await Promise.all([
    pages<{ kind: string; key: string; title: string }>('titles', 'kind,key,title', 'key'),
    pages<{ id: string; name: string; parent: string }>('folders', 'id,name,parent', 'id'),
    pages<{ key: string; value: string }>('placements', 'key,value', 'key')
  ]);
  const m = emptyMeta();
  titles.forEach(t => { (t.kind === 'cat' ? m.cats : t.kind === 'chapter' ? m.chapters : m.titles)[t.key] = t.title; });
  m.fold.folders = folders.map(f => ({ id: f.id, name: f.name, parent: f.parent }));
  place.forEach(p => { m.fold.place[p.key] = p.value; });
  kvSet('meta', m);
  return m;
}

/** Save the card list (after an owner edit) so the next start shows it at once. */
export function saveCards(cards: Card[]) { kvSet('cards', { last: Math.max(_last, ...cards.map(c => c.ord || 0)), cards } as CardCache); }
export function bumpLast(ord: number) { if (ord > _last) _last = ord; }

/**
 * Download only the rows changed since last time and merge them in:
 * new cards are added, edited cards (same id, new `ord`) replace the old copy in place, removed cards (del = true) disappear.
 */
export async function syncCards(have: Card[]): Promise<{ cards: Card[]; added: number }> {
  const last = Math.max(_last, ...have.map(c => c.ord || 0), 0);
  const after: [string, number] | undefined = last ? ['ord', last] : undefined;
  let rows: any[];
  try { rows = await pages<any>('cards', 'ord,id,s,q,c,w,p,del', 'ord', after); }
  catch { rows = await pages<any>('cards', 'ord,id,s,q,c,w,p', 'ord', after); } // cards-edit.sql not run yet
  if (!rows.length) return { cards: have, added: 0 };
  const cards = have.slice(), at = new Map<string, number>(); cards.forEach((c, i) => at.set(c.id, i));
  const gone = new Set<string>(); let top = last;
  for (const r of rows) {
    top = Math.max(top, r.ord || 0);
    if (r.del) { gone.add(r.id); continue; }
    gone.delete(r.id);
    const c: Card = { ord: r.ord, id: r.id, s: r.s, q: r.q, c: r.c, w: r.w || [] };
    if (r.p) c.p = 1;
    const i = at.get(r.id);
    if (i !== undefined) { c.ord = cards[i].ord; cards[i] = c; } else { at.set(r.id, cards.length); cards.push(c); }
  }
  const out = gone.size ? cards.filter(c => !gone.has(c.id)) : cards;
  _last = top;
  kvSet('cards', { last: top, cards: out } as CardCache);
  return { cards: out, added: rows.length };
}
