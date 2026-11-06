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

/** The source of a model: a built-in file, or the shared database row. */
export async function modelCode(id: string): Promise<string> {
  const hit = cache.get(id); if (hit) return hit;
  let code = '';
  if (BUILTIN.some(b => b.id === id)) {
    const r = await fetch('/models/' + id + '.model.js');
    if (!r.ok) throw Error('models/' + id + '.model.js not found. Copy your model files into public/models/.');
    code = await r.text();
  } else {
    const r = await sb().from('models').select('code').eq('id', id).maybeSingle();
    if (r.error) throw Error(r.error.message);
    if (!r.data) throw Error('This model no longer exists.');
    code = (r.data as any).code;
  }
  cache.set(id, code); return code;
}
export const forgetModel = (id: string) => cache.delete(id);

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
