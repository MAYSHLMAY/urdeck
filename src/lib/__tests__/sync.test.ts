import { describe, it, expect } from 'vitest';
import { scanMeta, mergeRemote, stable, h53, stampOf, Clock, type Meta, type Remote } from '../syncmerge';

/* A tiny model of the real thing: devices with their own clocks, and a server that keeps the newest version of each record
   (the same rule as the database function sync_put). */
type Row = { k: string; t: string; v: any; seq: number };
class Server {
  rows = new Map<string, Row>(); seq = 0;
  put(ops: { k: string; t: string; v: any }[]) { for (const o of ops) { const r = this.rows.get(o.k); if (r && r.t >= o.t) continue; this.rows.set(o.k, { ...o, seq: ++this.seq }); } }
  after(n: number) { return [...this.rows.values()].filter(r => r.seq > n).sort((a, b) => a.seq - b.seq); }
}
class Dev {
  data = new Map<string, any>(); meta: Meta = {}; out = new Set<string>(); cur = 0; clk: Clock;
  constructor(public id: string, public now: () => number) { this.clk = new Clock(() => id, now); }
  tick = () => this.clk.tick();
  seen = (t: string) => this.clk.seen(t);
  private stamp(w: number, c = 0) { return stampOf(w, c, this.id); }
  set(k: string, v: any) { this.data.set(k, v); }
  del(k: string) { this.data.delete(k); }
  scan() { const cur = new Map([...this.data].map(([k, v]) => [k, { v }])); scanMeta(this.meta, cur, false, this.tick, t => this.stamp(t), this.out); }
  sync(s: Server) {
    this.scan();
    const ops = [...this.out].map(k => ({ k, t: this.meta[k][0], v: this.meta[k][2] ? null : this.data.get(k) })); this.out.clear(); s.put(ops);
    const rows = s.after(this.cur); if (!rows.length) return;
    this.scan();
    for (const [k, v] of mergeRemote(this.meta, rows.map(r => ({ k: r.k, t: r.t, v: r.v })), this.seen)) v == null ? this.data.delete(k) : this.data.set(k, v);
    this.cur = rows[rows.length - 1].seq;
  }
  snapshot() { return JSON.stringify([...this.data].sort(([a], [b]) => a < b ? -1 : 1)); }
}
const clock = (start = 1_700_000_000_000) => { let t = start; return { now: () => t, adv: (ms: number) => { t += ms; } }; };

describe('two devices', () => {
  it('edits to different records both survive', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now);
    a.set('c:1', { n: 1 }); b.set('c:2', { n: 2 });
    a.sync(s); b.sync(s); a.sync(s);
    expect(a.snapshot()).toBe(b.snapshot()); expect(a.data.size).toBe(2);
  });
  it('the later edit of the same record wins, whichever device syncs first', () => {
    for (const order of [['A', 'B'], ['B', 'A']]) {
      const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now), d: any = { A: a, B: b };
      a.set('c:1', 'old'); a.sync(s); b.sync(s);
      c.adv(1000); a.set('c:1', 'from-A'); c.adv(1000); b.set('c:1', 'from-B');
      d[order[0]].sync(s); d[order[1]].sync(s); a.sync(s); b.sync(s);
      expect([a.data.get('c:1'), b.data.get('c:1')]).toEqual(['from-B', 'from-B']);
    }
  });
  it('a delete does not come back when the other device syncs old data later', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now);
    a.set('n:1', 'hello'); a.sync(s); b.sync(s);
    c.adv(5000); a.del('n:1'); a.sync(s);
    c.adv(5000); b.sync(s); a.sync(s);   // B did nothing: it must adopt the delete, not resurrect the note
    expect([a.data.has('n:1'), b.data.has('n:1')]).toEqual([false, false]);
  });
  it('a newer edit after a delete brings the record back on both', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now);
    a.set('n:1', 'v1'); a.sync(s); b.sync(s);
    c.adv(1000); a.del('n:1'); a.sync(s);
    c.adv(1000); b.sync(s); c.adv(1000); b.set('n:1', 'v2'); b.sync(s); a.sync(s);
    expect([a.data.get('n:1'), b.data.get('n:1')]).toEqual(['v2', 'v2']);
  });
  it('an edit made before the other device deleted loses to that delete', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now);
    a.set('n:1', 'v1'); a.sync(s); b.sync(s);
    c.adv(1000); b.set('n:1', 'edited'); b.scan(); /* noticed (and stamped) at edit time, even offline */ c.adv(1000); a.del('n:1');
    a.sync(s); b.sync(s); a.sync(s);
    expect([a.data.has('n:1'), b.data.has('n:1')]).toEqual([false, false]);
  });
  it('syncing the same data twice changes nothing', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now);
    a.set('c:1', 1); a.sync(s); b.sync(s); const before = b.snapshot(), metaBefore = JSON.stringify(b.meta);
    b.cur = 0; b.sync(s); b.cur = 0; b.sync(s);
    expect(b.snapshot()).toBe(before); expect(JSON.stringify(b.meta)).toBe(metaBefore);
  });
  it('nothing is sent again when nothing changed', () => {
    const c = clock(), a = new Dev('A', c.now); a.set('c:1', 1); a.scan(); a.out.clear(); a.scan();
    expect(a.out.size).toBe(0);
  });
});

describe('clock differences', () => {
  it('a device whose clock is far behind still wins after it has seen the newer data, because its clock catches up', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', () => c.now() - 3_600_000);
    a.set('c:1', 'A'); a.sync(s);
    c.adv(1000); b.sync(s);                // B pulls A's stamp and moves its own clock past it
    c.adv(1000); b.set('c:1', 'B-later'); b.sync(s); a.sync(s);
    expect([a.data.get('c:1'), b.data.get('c:1')]).toEqual(['B-later', 'B-later']);
  });
  it('a device with a clock far ahead cannot be undone by older edits, and stays consistent everywhere', () => {
    const c = clock(), s = new Server(), a = new Dev('A', () => c.now() + 86_400_000), b = new Dev('B', c.now);
    a.set('c:1', 'A-ahead'); a.sync(s); c.adv(1000); b.sync(s); b.set('c:1', 'B-real'); b.sync(s); a.sync(s);
    expect(a.snapshot()).toBe(b.snapshot());
  });
  it('two edits in the same millisecond still order the same way everywhere', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', c.now);
    a.set('c:1', 'A'); b.set('c:1', 'B'); a.sync(s); b.sync(s); a.sync(s); b.sync(s);
    expect(a.snapshot()).toBe(b.snapshot());
  });
  it('several quick edits on one device keep their order', () => {
    const c = clock(), a = new Dev('A', c.now), t1 = a.tick(), t2 = a.tick(), t3 = a.tick();
    expect(t1 < t2 && t2 < t3).toBe(true);
  });
});

describe('merge rules as maths', () => {
  let uniq = 0;
  const rec = (k: string, wall: number, dev: string, v: any): Remote => ({ k, t: stampOf(wall, uniq++ % 65536, dev), v });
  const run = (list: Remote[]) => { const m: Meta = {}; mergeRemote(m, list, () => {}); return JSON.stringify(Object.entries(m).sort()); };
  const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const shuffle = <T,>(a: T[], r: () => number) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const sample = (r: () => number, n: number) => Array.from({ length: n }, () => rec('k' + Math.floor(r() * 5), 1000 + Math.floor(r() * 30), ['A', 'B', 'C'][Math.floor(r() * 3)], r() < 0.25 ? null : Math.floor(r() * 9)));

  it('the order records arrive in never changes the result (commutative)', () => {
    for (let seed = 1; seed <= 200; seed++) { const r = rng(seed), l = sample(r, 12); expect(run(shuffle(l, r))).toBe(run(l)); }
  });
  it('applying the same records again changes nothing (idempotent)', () => {
    for (let seed = 1; seed <= 100; seed++) { const l = sample(rng(seed), 10); expect(run([...l, ...l])).toBe(run(l)); }
  });
  it('merging in two batches equals merging all at once (associative)', () => {
    for (let seed = 1; seed <= 100; seed++) { const r = rng(seed), l = sample(r, 12), cut = 1 + Math.floor(r() * 10); const m: Meta = {}; mergeRemote(m, l.slice(0, cut), () => {}); mergeRemote(m, l.slice(cut), () => {}); expect(JSON.stringify(Object.entries(m).sort())).toBe(run(l)); }
  });
  it('an older record never replaces a newer one', () => {
    const m: Meta = {}; mergeRemote(m, [rec('k', 2000, 'A', 'new')], () => {}); const out = mergeRemote(m, [rec('k', 1000, 'A', 'old')], () => {});
    expect(out).toEqual([]); expect(m.k[1]).toBe(h53(stable('new')));
  });
  it('a delete is kept as a delete, and only a newer record replaces it', () => {
    const m: Meta = {}; mergeRemote(m, [rec('k', 2000, 'A', null)], () => {});
    expect(m.k[2]).toBe(1); expect(mergeRemote(m, [rec('k', 1500, 'B', 'x')], () => {})).toEqual([]); expect(mergeRemote(m, [rec('k', 2500, 'B', 'x')], () => {})).toHaveLength(1);
  });
});

describe('many devices, random behaviour', () => {
  const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  it('after everyone syncs, three devices always hold identical data (200 random histories)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed), c = clock(), s = new Server(), skew = [0, -600_000, 90_000], devs = ['A', 'B', 'C'].map((id, i) => new Dev(id, () => c.now() + skew[i]));
      for (let step = 0; step < 40; step++) {
        c.adv(Math.floor(r() * 3000));
        const d = devs[Math.floor(r() * 3)], k = 'k' + Math.floor(r() * 6), x = r();
        if (x < 0.5) d.set(k, Math.floor(r() * 100)); else if (x < 0.65) d.del(k); else d.sync(s);
      }
      for (let round = 0; round < 3; round++) devs.forEach(d => { c.adv(1000); d.sync(s); });
      expect(devs[1].snapshot()).toBe(devs[0].snapshot()); expect(devs[2].snapshot()).toBe(devs[0].snapshot());
    }
  });
});

describe('hashing', () => {
  it('equal data in a different key order is the same', () => { expect(stable({ b: 1, a: [1, { y: 2, x: 1 }] })).toBe(stable({ a: [1, { x: 1, y: 2 }], b: 1 })); });
  it('different data gives a different hash', () => { expect(h53(stable({ a: 1 }))).not.toBe(h53(stable({ a: 2 }))); });
  it('undefined fields are ignored, Geʼez text is handled', () => { expect(stable({ a: 1, b: undefined })).toBe(stable({ a: 1 })); expect(h53(stable('ሰላም'))).toBe(h53(stable('ሰላም'))); });
});

describe('stamp clock (regression: a late edit used to lose to older data)', () => {
  it('after seeing a stamp with a high counter, the next stamp is larger even when this clock is behind', () => {
    const k = new Clock(() => 'B', () => 1000);
    const seenStamp = stampOf(5000, 200, 'C');
    k.seen(seenStamp);
    expect(k.tick() > seenStamp).toBe(true);
  });
  it('seeing an older stamp does not move the clock back', () => {
    const k = new Clock(() => 'B', () => 9000); const a = k.tick(); k.seen(stampOf(100, 5, 'C')); expect(k.tick() > a).toBe(true);
  });
  it('ignores a malformed stamp', () => { const k = new Clock(() => 'B', () => 1); expect(() => k.seen('garbage')).not.toThrow(); expect(k.tick()).toBeTruthy(); });
  it('a device with a slow clock that has synced still wins with its next edit, against many quick edits on the other device', () => {
    const c = clock(), s = new Server(), a = new Dev('A', c.now), b = new Dev('B', () => c.now() - 5000);
    for (let i = 0; i < 300; i++) a.set('k' + i, i); a.sync(s); b.sync(s);
    b.set('k299', 'B-newer'); b.sync(s); a.sync(s);
    expect([a.data.get('k299'), b.data.get('k299')]).toEqual(['B-newer', 'B-newer']);
  });
});
