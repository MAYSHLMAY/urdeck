/* Compares two versions of an article page (its HTML), so a re-uploaded file can be recognised as an update of one already here, even when the file name is different.
   Text and code are compared as separate lists of "lines". Pure functions, no browser needed (these are under test). */

export type Line = { k: 'text' | 'code'; s: string };
export type Op =
  | { t: 'same'; k: Line['k']; s: string }
  | { t: 'add'; k: Line['k']; s: string }
  | { t: 'del'; k: Line['k']; s: string }
  | { t: 'mod'; k: Line['k']; a: string; b: string; w: Array<{ t: 'same' | 'add' | 'del'; s: string }> };
export type Summary = { same: number; add: number; del: number; mod: number };

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Break a page into comparable lines: visible text first (one line per paragraph, heading, list item, button...), then its script and style lines. */
export function lines(html: string): Line[] {
  const out: Line[] = [];
  const code: string[] = [];
  const body = html.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c: string) => { code.push(c); return '\n'; })
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = decode(body.replace(/<(br|\/?(p|div|section|article|header|footer|main|nav|aside|h[1-6]|li|ul|ol|tr|td|th|table|figure|figcaption|summary|details|button|label|option|dt|dd|blockquote|pre|form|select|title))\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '));
  for (const raw of text.split('\n')) { const s = norm(raw); if (s.length >= 2) out.push({ k: 'text', s }); }
  for (const c of code) for (const raw of c.split('\n')) { const s = raw.trim(); if (s.length >= 6) out.push({ k: 'code', s: s.length > 400 ? s.slice(0, 400) : s }); }
  return out;
}

const key = (l: Line) => l.k + '\u0001' + l.s;

/** Matches lines of two lists, in order. Trims what is equal at both ends, anchors on lines that appear exactly once in each list (so big pages split into small pieces), then does an exact longest-common-subsequence inside each piece. */
function align(a: string[], b: string[], a0 = 0, b0 = 0, out: Array<[number, number]> = []): Array<[number, number]> {
  let lo = 0; while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let ha = a.length, hb = b.length; while (ha > lo && hb > lo && a[ha - 1] === b[hb - 1]) { ha--; hb--; }
  for (let i = 0; i < lo; i++) out.push([a0 + i, b0 + i]);
  const A = a.slice(lo, ha), B = b.slice(lo, hb), n = A.length, m = B.length;
  if (n > 0 && m > 0) {
    if (n * m <= 4_000_000) dp(A, B, a0 + lo, b0 + lo, out);
    else {
      const ca = new Map<string, number>(), cb = new Map<string, number>(), pos = new Map<string, number>();
      A.forEach(k => ca.set(k, (ca.get(k) || 0) + 1)); B.forEach((k, j) => { cb.set(k, (cb.get(k) || 0) + 1); pos.set(k, j); });
      const cand: Array<[number, number]> = []; A.forEach((k, i) => { if (ca.get(k) === 1 && cb.get(k) === 1) cand.push([i, pos.get(k)!]); });
      const anchors = lis(cand);
      if (!anchors.length) { loose(A, B, a0 + lo, b0 + lo, out); }
      else {
        let pi = 0, pj = 0;
        for (const [i, j] of anchors) { align(A.slice(pi, i), B.slice(pj, j), a0 + lo + pi, b0 + lo + pj, out); out.push([a0 + lo + i, b0 + lo + j]); pi = i + 1; pj = j + 1; }
        align(A.slice(pi), B.slice(pj), a0 + lo + pi, b0 + lo + pj, out);
      }
    }
  }
  for (let i = 0; i < a.length - ha; i++) out.push([a0 + ha + i, b0 + hb + i]);
  return out;
}
function dp(A: string[], B: string[], a0: number, b0: number, out: Array<[number, number]>) {
  const n = A.length, m = B.length, w = m + 1, t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * w + j] = A[i] === B[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { out.push([a0 + i, b0 + j]); i++; j++; } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++; else j++; }
}
/** Last resort for a huge piece with nothing to anchor on: match equal lines in order. */
function loose(A: string[], B: string[], a0: number, b0: number, out: Array<[number, number]>) {
  const at = new Map<string, number[]>(); B.forEach((k, j) => { (at.get(k) || at.set(k, []).get(k)!).push(j); });
  let last = -1;
  A.forEach((k, i) => { const l = at.get(k); if (!l) return; const p = l.find(x => x > last); if (p !== undefined) { out.push([a0 + i, b0 + p]); last = p; } });
}
/** Longest increasing run by second value, for pairs already ordered by first value. */
function lis(c: Array<[number, number]>): Array<[number, number]> {
  const tail: number[] = [], prev: number[] = new Array(c.length).fill(-1);
  c.forEach((p, x) => {
    let l = 0, h = tail.length; while (l < h) { const mid = (l + h) >> 1; if (c[tail[mid]][1] < p[1]) l = mid + 1; else h = mid; }
    if (l > 0) prev[x] = tail[l - 1]; tail[l] = x;
  });
  const out: Array<[number, number]> = []; let x = tail.length ? tail[tail.length - 1] : -1;
  while (x >= 0) { out.push(c[x]); x = prev[x]; }
  return out.reverse();
}

const toks = (s: string) => s.split(/(\s+)/).filter(x => x !== '');
const jac = (x: string, y: string) => {
  const A = new Set(x.toLowerCase().split(/\W+/).filter(Boolean)), B = new Set(y.toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size || !B.size) return 0; let n = 0; A.forEach(t => { if (B.has(t)) n++; }); return n / (A.size + B.size - n);
};
/** Word-level difference inside one changed line. */
export function words(a: string, b: string): Array<{ t: 'same' | 'add' | 'del'; s: string }> {
  const x = toks(a), y = toks(b);
  if (x.length * y.length > 250_000) return [{ t: 'del', s: a }, { t: 'add', s: b }];
  const out: Array<{ t: 'same' | 'add' | 'del'; s: string }> = [], p = align(x, y).sort((u, v) => u[0] - v[0]);
  let i = 0, j = 0;
  const push = (t: 'same' | 'add' | 'del', s: string) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }); };
  for (const [pi, pj] of [...p, [x.length, y.length] as [number, number]]) {
    while (i < pi) push('del', x[i++]); while (j < pj) push('add', y[j++]);
    if (pi < x.length) { push('same', x[pi]); i = pi + 1; j = pj + 1; }
  }
  return out;
}

export function diff(oldHtml: string, newHtml: string): { ops: Op[]; sum: Summary } {
  const A = lines(oldHtml), B = lines(newHtml), pairs = align(A.map(key), B.map(key)).sort((u, v) => u[0] - v[0]), ops: Op[] = [];
  let i = 0, j = 0;
  const flush = (ie: number, je: number) => {
    const dels = A.slice(i, ie), adds = B.slice(j, je); let jj = 0;
    for (const d of dels) {
      let hit = -1;
      for (let q = jj; q < Math.min(adds.length, jj + 8); q++) if (adds[q].k === d.k && jac(d.s, adds[q].s) >= 0.5) { hit = q; break; }
      if (hit < 0) { ops.push({ t: 'del', k: d.k, s: d.s }); continue; }
      for (; jj < hit; jj++) ops.push({ t: 'add', k: adds[jj].k, s: adds[jj].s });
      ops.push({ t: 'mod', k: d.k, a: d.s, b: adds[hit].s, w: words(d.s, adds[hit].s) }); jj = hit + 1;
    }
    for (; jj < adds.length; jj++) ops.push({ t: 'add', k: adds[jj].k, s: adds[jj].s });
  };
  for (const [pi, pj] of pairs) { flush(pi, pj); ops.push({ t: 'same', k: A[pi].k, s: A[pi].s }); i = pi + 1; j = pj + 1; }
  flush(A.length, B.length);
  const sum: Summary = { same: 0, add: 0, del: 0, mod: 0 }; for (const o of ops) sum[o.t]++;
  return { ops, sum };
}

/** How much of the OLD page is still in the NEW one (0 to 1). Changed lines count as half. High means "this is probably an update of that article". */
export function kept(sum: Summary): number { const old = sum.same + sum.del + sum.mod; return old ? (sum.same + sum.mod * 0.5) / old : 0; }
export const identical = (sum: Summary) => sum.add + sum.del + sum.mod === 0;
export const looksLikeUpdate = (sum: Summary) => kept(sum) >= 0.5;

/** Group a long diff into chunks to show: each change with a little unchanged context, long unchanged stretches folded. */
export type Chunk = { type: 'fold'; n: number; first: number } | { type: 'op'; i: number; op: Op; change: boolean };
export function chunks(ops: Op[], ctx = 1): Chunk[] {
  const near = new Array(ops.length).fill(false);
  ops.forEach((o, i) => { if (o.t !== 'same') for (let d = -ctx; d <= ctx; d++) if (ops[i + d]) near[i + d] = true; });
  const out: Chunk[] = []; let run = 0, start = 0;
  ops.forEach((o, i) => {
    if (near[i]) { if (run) { out.push({ type: 'fold', n: run, first: start }); run = 0; } out.push({ type: 'op', i, op: o, change: o.t !== 'same' }); }
    else { if (!run) start = i; run++; }
  });
  if (run) out.push({ type: 'fold', n: run, first: start });
  return out;
}
