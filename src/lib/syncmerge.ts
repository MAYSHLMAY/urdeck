/* The rules that decide what survives when two devices changed the same thing. Pure functions with no storage or network, so they can be tested alone.
   Every record has a stamp. The larger stamp wins on every device, so every device ends up in the same state whatever order things arrive in. */
export type Meta = Record<string, [string, string, 0 | 1]>;   // key → [stamp, hash, deleted]
export type Cur = Map<string, { v: any; ts?: number }>;
export type Remote = { k: string; t: string; v: any };

export const stable = (v: any): string => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
export function h53(s: string) { let a = 0xdeadbeef, b = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); } a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36) + s.length; }

/** Compare what this device holds now with what it knew last time. Anything new or changed is stamped and queued; anything gone becomes a stamped delete. */
export function scanMeta(meta: Meta, cur: Cur, base: boolean, tick: () => string, stampAt: (t: number) => string, out: Set<string>) {
  for (const [k, { v, ts }] of cur) {
    const h = h53(stable(v)), m = meta[k];
    if (!m) { meta[k] = [base ? stampAt(ts || 0) : tick(), h, 0]; out.add(k); }
    else if (m[2] === 1 || m[1] !== h) { meta[k] = [tick(), h, 0]; out.add(k); }
  }
  for (const k in meta) if (meta[k][2] === 0 && !cur.has(k)) { meta[k] = [tick(), '', 1]; out.add(k); }
}

/** Take records that arrived from the server. A record is applied only if it is newer than what this device holds; returns what to apply ([key, null] means delete). */
export function mergeRemote(meta: Meta, got: Remote[], seen: (stamp: string) => void): [string, any][] {
  const applied: [string, any][] = [];
  for (const g of got) {
    seen(g.t); const m = meta[g.k];
    if (m && m[0] >= g.t) continue;
    meta[g.k] = [g.t, g.v == null ? '' : h53(stable(g.v)), g.v == null ? 1 : 0];
    applied.push([g.k, g.v]);
  }
  return applied;
}

/** The stamp clock. A stamp is wall-clock milliseconds, a counter for edits in the same millisecond, and the device id.
 *  After a device has seen a stamp from another device, every stamp it makes afterwards is larger, even if its own clock is behind. */
export const stampOf = (wall: number, ctr: number, dev: string) => String(Math.max(0, Math.floor(wall))).padStart(13, '0') + '.' + ctr.toString(16).padStart(4, '0') + '.' + dev;
export class Clock {
  lastWall = 0; ctr = 0;
  constructor(private dev: () => string, private now: () => number = Date.now) {}
  tick(): string { const n = this.now(); if (n > this.lastWall) { this.lastWall = n; this.ctr = 0; } else this.ctr++; return stampOf(this.lastWall, this.ctr, this.dev()); }
  seen(t: string) {
    const w = parseInt(t.slice(0, 13), 10), c = parseInt(t.slice(14, 18), 16) || 0;
    if (isNaN(w)) return;
    if (w > this.lastWall) { this.lastWall = w; this.ctr = c; } else if (w === this.lastWall && c > this.ctr) this.ctr = c;
  }
}
