import { fetchRetry } from './net';
/* 3D models. Built-ins are files in /public/models; uploaded ones live in the shared database (owner-only writes). */
import { sb } from './library';

export const MARK = /^\s*\/\*\s*flight-recall-model\s*\*\//;

export const BUILTIN = [
  { id: 'elevon', name: 'Elevon (Flying Wing)', sub: 'Elevons', info: 'Pitch and roll mixing on a flying wing', built: true },
  { id: 'ruddervator', name: 'Ruddervator (V-Tail)', sub: 'Ruddervators', info: 'Pitch and yaw mixing on a V-tail', built: true }
];

export interface ModelDef {
  name: string; category?: string; sub?: string; info?: string;
  build: (THREE: any) => any;
  update?: (g: any, v: Record<string, number>, THREE: any) => void;
  readout?: (v: Record<string, number>) => [string, string][];
  adjusters?: { id: string; label: string; min: number; max: number; step?: number; value: number; unit?: string; hint?: string; sweep?: boolean }[];
  parts?: { id: string; label: string; info?: string }[];
}

const cache = new Map<string, string>();
/* Models you have opened are kept on the device, so they open instantly and offline. A fresh copy is fetched quietly in the background. */
let _mdb: Promise<IDBDatabase | null> | null = null;
const mdb = () => _mdb || (_mdb = new Promise(res => {
  try { const r = indexedDB.open('ud-models', 1); r.onupgradeneeded = () => r.result.createObjectStore('m'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); }
}));
const dget = async (id: string): Promise<string> => { const d = await mdb(); return d ? new Promise(res => { try { const q = d.transaction('m').objectStore('m').get(id); q.onsuccess = () => res(typeof q.result === 'string' ? q.result : ''); q.onerror = () => res(''); } catch { res(''); } }) : ''; };
const dput = async (id: string, code: string) => { const d = await mdb(); if (!d) return; try { d.transaction('m', 'readwrite').objectStore('m').put(code, id); } catch { /* ignore */ } };
const ddel = async (id: string) => { const d = await mdb(); if (!d) return; try { d.transaction('m', 'readwrite').objectStore('m').delete(id); } catch { /* ignore */ } };

/** The source of a model: a built-in file, or the shared database row. */
export async function modelCode(id: string): Promise<string> {
  const hit = cache.get(id); if (hit) return hit;
  let code = '';
  if (BUILTIN.some(b => b.id === id)) {
    const r = await fetchRetry('/models/' + id + '.model.js', {}, { ms: 20_000 });
    if (!r.ok) throw Error('models/' + id + '.model.js not found. Copy your model files into public/models/.');
    code = await r.text();
  } else {
    const kept = await dget(id);
    const fresh = async () => { const r = await sb().from('models').select('code').eq('id', id).maybeSingle(); if (!r.error && r.data) dput(id, (r.data as any).code); return r; };
    if (kept) { fresh().catch(() => {}); cache.set(id, kept); return kept; }
    const r = await fresh();
    if (r.error) throw Error(r.error.message);
    if (!r.data) throw Error('This model no longer exists.');
    code = (r.data as any).code;
  }
  cache.set(id, code); return code;
}
export const forgetModel = (id: string) => { ddel(id); return cache.delete(id); };

/** Load a model file (an ES module with `export default {name, build(THREE)}`). */
export async function validateModel(code: string): Promise<ModelDef> {
  if (!MARK.test(code)) throw Error('first line must be /* flight-recall-model */');
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const m = (await import(/* webpackIgnore: true */ url)).default;
    if (!m || !m.name || typeof m.build !== 'function') throw Error('needs export default {name, build(THREE)}');
    return m;
  } finally { URL.revokeObjectURL(url); }
}
