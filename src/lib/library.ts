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

export async function readCache(): Promise<{ cards: Card[]; meta: Meta | null }> {
  const [c, m] = await Promise.all([kvGet<CardCache>('cards'), kvGet<Meta>('meta')]);
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

/** Download only the cards added since `have` (already in memory) and merge them in. */
export async function syncCards(have: Card[]): Promise<{ cards: Card[]; added: number }> {
  const last = have.length ? (have[have.length - 1].ord || 0) : 0;
  const rows = await pages<any>('cards', 'ord,id,s,q,c,w,p', 'ord', last ? ['ord', last] : undefined);
  if (!rows.length) return { cards: have, added: 0 };
  const known = new Set(have.map(c => c.id));
  const cards = have.slice();
  for (const r of rows) {
    if (known.has(r.id)) continue;
    known.add(r.id);
    const c: Card = { ord: r.ord, id: r.id, s: r.s, q: r.q, c: r.c, w: r.w || [] };
    if (r.p) c.p = 1;
    cards.push(c);
  }
  kvSet('cards', { last: cards.length ? cards[cards.length - 1].ord || 0 : 0, cards } as CardCache);
  return { cards, added: rows.length };
}
