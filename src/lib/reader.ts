/*
 * Reading memory: where you stopped in each PDF, its bookmarks, and what you read last. Local first; the per-document
 * records also ride along with account sync (see prefs.ts), so you carry on from the same page on another device.
 */
export interface Bm { p: number; l: string; t: number }
export interface Prog { page: number; total?: number; zoom?: number; t: number; bm?: Bm[]; sec?: number; rd?: string }
const K = 'ud-read-v1';
type Sub = () => void;

class ReaderStore {
  ver = 0; private subs = new Set<Sub>(); private m: Record<string, Prog> | null = null;
  subscribe = (f: Sub) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVer = () => this.ver;
  private all(): Record<string, Prog> {
    if (this.m) return this.m;
    let v: any = null; try { v = JSON.parse(localStorage.getItem(K) || 'null'); } catch { /* ignore */ }
    return (this.m = v && v.m ? v.m : {});
  }
  private save() { try { localStorage.setItem(K, JSON.stringify({ v: 1, m: this.all() })); } catch { /* ignore */ } this.ver++; this.subs.forEach(f => f()); try { dispatchEvent(new Event('ud-read')); } catch { /* ignore */ } }
  prog(id: string): Prog | undefined { return typeof window === 'undefined' ? undefined : this.all()[id]; }
  /** Remember the page (cheap: called while scrolling, so it only writes when the page changed). */
  at(id: string, page: number, total?: number, zoom?: number) {
    const m = this.all(), o = m[id];
    if (o && o.page === page && (total == null || o.total === total) && Date.now() - o.t < 4000) return;
    m[id] = { ...o, page, total: total ?? o?.total, zoom: zoom ?? o?.zoom, t: Date.now() }; this.save();
  }
  /* ---- pages you really read (not just scrolled past): stored as ranges like "1-5,8,10-12" so they stay tiny and sync well ---- */
  readPages(id: string): Set<number> { const out = new Set<number>(); for (const part of (this.all()[id]?.rd || '').split(',')) { const [a, b] = part.split('-').map(Number); if (a > 0) for (let i = a; i <= (b || a) && i < 20000; i++) out.add(i); } return out; }
  isRead(id: string, page: number) { return this.readPages(id).has(page); }
  readCount(id: string) { return this.readPages(id).size; }
  private fmt(set: Set<number>) { const a = [...set].sort((x, y) => x - y), out: string[] = []; for (let i = 0; i < a.length;) { let j = i; while (a[j + 1] === a[j] + 1) j++; out.push(j > i ? a[i] + '-' + a[j] : '' + a[i]); i = j + 1; } return out.join(','); }
  /** A page counts as read only after real time on it (see Reader). Returns true the first time. Five new pages a day keep the streak. */
  markRead(id: string, page: number): boolean {
    const m = this.all(), set = this.readPages(id); if (set.has(page)) return false;
    set.add(page); m[id] = { ...(m[id] || { page, t: 0 }), rd: this.fmt(set), t: Date.now() }; this.save();
    this.today(id + ':' + page);
    return true;
  }
  /** Distinct pages read today on this device (for the "5 pages" streak rule). */
  todayPages(): number { try { const d = new Date(), k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), r = JSON.parse(localStorage.getItem('ud-read-day') || 'null'); return r && r.k === k ? r.p.length : 0; } catch { return 0; } }
  private today(key: string) {
    try {
      const d = new Date(), k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), raw = JSON.parse(localStorage.getItem('ud-read-day') || 'null');
      const st: { k: string; p: string[]; done?: boolean } = raw && raw.k === k ? raw : { k, p: [] };
      if (!st.p.includes(key)) st.p.push(key);
      if (!st.done && st.p.length >= 5) { st.done = true; import('./engine').then(m => m.engine().logActivity('read')).catch(() => { /* ignore */ }); }
      localStorage.setItem('ud-read-day', JSON.stringify(st));
    } catch { /* ignore */ }
  }
  recent(n = 6): { id: string; p: Prog }[] { const m = this.all(); return Object.keys(m).filter(k => m[k].page).sort((a, b) => m[b].t - m[a].t).slice(0, n).map(id => ({ id, p: m[id] })); }
  bms(id: string): Bm[] { return (this.all()[id]?.bm || []).slice().sort((a, b) => a.p - b.p); }
  hasBm(id: string, page: number) { return (this.all()[id]?.bm || []).some(b => b.p === page); }
  toggleBm(id: string, page: number, label = '') {
    const m = this.all(), o = m[id] || { page, t: 0 }, bm = (o.bm || []).slice(), i = bm.findIndex(b => b.p === page);
    if (i >= 0) bm.splice(i, 1); else bm.push({ p: page, l: label.slice(0, 60), t: Date.now() });
    m[id] = { ...o, bm, t: Date.now() }; this.save();
  }
  renameBm(id: string, page: number, label: string) { const m = this.all(), o = m[id]; if (!o?.bm) return; m[id] = { ...o, bm: o.bm.map(b => b.p === page ? { ...b, l: label.slice(0, 60) } : b), t: Date.now() }; this.save(); }
  /* account sync */
  syncCollect(out: Map<string, { v: any; ts?: number }>) { const m = this.all(); for (const id in m) out.set('kv:rd:' + id, { v: m[id], ts: m[id].t }); }
  syncApply(id: string, v: any) {
    const m = this.all(); if (v == null) { delete m[id]; this.save(); return; }
    const mine = this.readPages(id); // pages read on either device stay read
    m[id] = v; if (mine.size) { const u = this.readPages(id); mine.forEach(x => u.add(x)); m[id] = { ...v, rd: this.fmt(u) }; }
    this.save();
  }
}
let _s: ReaderStore | null = null;
export const readerStore = () => _s || (_s = new ReaderStore());
