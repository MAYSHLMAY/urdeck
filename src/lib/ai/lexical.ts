/* Tier 0 "embeddings": sparse hashed word + bigram + character-3-gram vectors with IDF weights. Instant, offline, zero download. */
import { tokens } from './text';
export interface Vec { i: Int32Array; v: Float32Array }
const D = 1 << 16;
const h = (s: string) => { let x = 2166136261; for (let k = 0; k < s.length; k++) { x ^= s.charCodeAt(k); x = Math.imul(x, 16777619); } return (x >>> 0) % D; };
function feats(text: string): Map<number, number> {
  const w = tokens(text), m = new Map<number, number>(), add = (f: string, wt: number) => { const k = h(f); m.set(k, (m.get(k) || 0) + wt); };
  w.forEach((t, k) => { add('w:' + t, 1); if (k) add('b:' + w[k - 1] + '_' + t, 0.6); if (t.length > 4) for (let c = 0; c + 3 <= t.length; c++) add('c:' + t.slice(c, c + 3), 0.15); });
  return m;
}
export class Lexical {
  idf = new Map<number, number>(); n = 0;
  fit(docs: string[]) {
    const df = new Map<number, number>(); this.n = docs.length;
    docs.forEach(d => feats(d).forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)));
    this.idf = new Map([...df].map(([k, c]) => [k, Math.log(1 + this.n / c)]));
  }
  vec(text: string): Vec {
    const m = feats(text), ks = [...m.keys()].sort((a, b) => a - b), v = new Float32Array(ks.length); let s = 0;
    ks.forEach((k, j) => { const x = (1 + Math.log(m.get(k)!)) * (this.idf.get(k) ?? Math.log(1 + this.n || 2)); v[j] = x; s += x * x; });
    s = Math.sqrt(s) || 1; for (let j = 0; j < v.length; j++) v[j] /= s;
    return { i: Int32Array.from(ks), v };
  }
}
export function cos(a: Vec, b: Vec) {
  let x = 0, p = 0, q = 0;
  while (p < a.i.length && q < b.i.length) { if (a.i[p] === b.i[q]) { x += a.v[p] * b.v[q]; p++; q++; } else if (a.i[p] < b.i[q]) p++; else q++; }
  return x;
}
