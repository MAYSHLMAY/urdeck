/*
 * Device sync without accounts.
 *  - A device makes a random pairing code. Any device that enters the code joins the same private "space".
 *  - Everything is encrypted in the browser (AES-GCM) before it leaves; the server stores opaque blobs under a hash of the code.
 *  - Every record (one card's progress, one note, one pinned mistake, …) carries a hybrid logical clock stamp. When two devices
 *    changed the same record, the newer stamp wins on every device, so they always end in the same state and nothing is lost
 *    for records only one device touched. Deleting is a stamped tombstone, so deletes sync too.
 *  - Nothing is sent that did not change; the server keeps only the newest version of each record.
 *  - Not synced: PDF files (they stay on the device they were added on), AI keys, reminders and the live quiz identity.
 *    Study options, look, home layout, badges and 3D-lab progress do sync (lib/prefs.ts).
 */
import { apiUrl } from '@/lib/base';
import { engine } from './engine';
import { notes } from './notes';
import { auth, profile } from './auth';
import { prefs } from './prefs';
import { timedFetch, isNetErr } from './net';
import { stable, h53, scanMeta, mergeRemote, stampOf, Clock, type Meta } from './syncmerge';

const K_CFG = 'fr-sync-cfg-v1', K_META = 'fr-sync-meta-v1', K_CUR = 'fr-sync-cur-v1', K_OUT = 'fr-sync-out-v1';
const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export interface Cfg { code: string; space: string; dev: string; since: number; base?: boolean }
export interface Status { state: 'off' | 'idle' | 'syncing' | 'offline' | 'error'; last: number; err: string; pending: number }

const jget = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const jset = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = (s: string) => crypto.subtle.digest('SHA-256', enc.encode(s));
const b64 = (u: Uint8Array) => { let s = ''; u.forEach(c => (s += String.fromCharCode(c))); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const cleanCode = (s: string) => s.toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '').replace(/U/g, 'V');
export const fmtCode = (c: string) => c.match(/.{1,5}/g)?.join('-') || c;
export const newCode = () => { const r = crypto.getRandomValues(new Uint8Array(20)); return [...r].map(x => A[x & 31]).join(''); };
const validCode = (c: string) => c.length === 20 && [...c].every(x => A.includes(x));

class Sync {
  cfg: Cfg | null = null; st: Status = { state: 'off', last: 0, err: '', pending: 0 };
  private meta: Meta = {}; private out = new Set<string>(); private cur = 0; private key: CryptoKey | null = null;
  private subs = new Set<() => void>(); private busy = false; private again = false; private dirty = true; private started = false; private armed = false; private deb: any = 0;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  private emit() { this.subs.forEach(f => f()); }
  private set(p: Partial<Status>) { this.st = { ...this.st, ...p }; this.emit(); }

  /* ---------- set-up ---------- */
  start() {
    if (this.started || typeof window === 'undefined') return; this.started = true;
    this.cfg = jget(K_CFG); this.meta = jget(K_META) || {}; this.cur = jget(K_CUR) || 0; this.out = new Set(jget(K_OUT) || []);
    if (!this.cfg) { this.emit(); return; }
    this.set({ state: 'idle', pending: this.out.size }); this.arm();
  }
  private arm() {
    if (this.armed) return; this.armed = true;
    const mark = () => { this.dirty = true; clearTimeout(this.deb); this.deb = setTimeout(() => this.run(), 1500); };
    engine().subscribe(mark); notes().subscribe(mark); prefs.subscribe(mark);
    ['ud-look', 'ud-home', 'ud-read'].forEach(ev => addEventListener(ev, mark));
    setInterval(() => { if (!document.hidden) this.run(); }, 7000);
    document.addEventListener('visibilitychange', () => this.run());
    addEventListener('online', () => this.run()); addEventListener('focus', () => this.run());
    setTimeout(() => this.run(), 1200);
  }
  async enable(codeIn?: string): Promise<string> {
    if (!crypto?.subtle) throw new Error('Sync needs a secure (https) connection.');
    const code = codeIn ? cleanCode(codeIn) : newCode();
    if (!validCode(code)) throw new Error('That code does not look right. It has 20 letters and numbers.');
    if (this.cfg && this.cfg.code !== code) this.reset();
    const dev = this.cfg?.dev || crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    this.cfg = { code, space: hex(await sha('fr-space|' + code)).slice(0, 32), dev, since: Date.now(), base: true }; jset(K_CFG, this.cfg); this.key = null;
    this.started = true; this.arm(); this.dirty = true; this.set({ state: 'idle', err: '' }); this.run();
    return code;
  }
  disable() { this.reset(); this.cfg = null; try { localStorage.removeItem(K_CFG); } catch { /* ignore */ } this.set({ state: 'off', err: '', pending: 0, last: 0 }); }
  private reset() { this.meta = {}; this.out = new Set(); this.cur = 0; this.key = null; [K_META, K_CUR, K_OUT].forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } }); }
  private save() { jset(K_META, this.meta); jset(K_CUR, this.cur); jset(K_OUT, [...this.out]); }

  /* ---------- clock ---------- */
  private clk = new Clock(() => this.cfg!.dev);
  private stamp(wall: number, ctr = 0) { return stampOf(wall, ctr, this.cfg!.dev); }
  private tick() { return this.clk.tick(); }
  private seen(t: string) { this.clk.seen(t); }

  /* ---------- crypto ---------- */
  private async aes() { if (!this.key) this.key = await crypto.subtle.importKey('raw', await sha('fr-key|' + this.cfg!.code), 'AES-GCM', false, ['encrypt', 'decrypt']); return this.key; }
  private async seal(o: unknown) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aes(), enc.encode(JSON.stringify(o)))); const u = new Uint8Array(12 + ct.length); u.set(iv); u.set(ct, 12); return b64(u); }
  private async open(s: string) { const u = unb64(s); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await this.aes(), u.slice(12)))); }
  private rk = async (k: string) => hex(await sha('fr-rk|' + this.cfg!.code + '|' + k)).slice(0, 32);

  /* ---------- the cycle ---------- */
  /** Compare this device's data with what we last knew; stamp whatever changed and queue it. */
  private collect() {
    const m = new Map<string, { v: any; ts?: number }>();
    engine().syncCollect(m);
    notes().syncCollect(m);
    prefs.syncCollect(m);
    return m;
  }
  private scan() {
    const cur = this.collect(), base = !!this.cfg?.base;
    scanMeta(this.meta, cur, base, () => this.tick(), t => this.stamp(t), this.out);
    if (base) { this.cfg!.base = false; jset(K_CFG, this.cfg); }
    return cur;
  }
  async run() {
    if (!this.cfg) return;
    if (this.busy) { this.again = true; return; }
    await notes().start();   // never compare against notes that are still loading (they would look deleted)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Offline: still note what changed, and when. A change made now must carry today's stamp, not the stamp of the day the phone reconnects.
      if (this.dirty) { this.dirty = false; this.scan(); this.save(); }
      this.set({ state: 'offline', pending: this.out.size }); return;
    }
    this.busy = true; this.again = false; const wasDirty = this.dirty; this.dirty = false;
    try {
      this.set({ state: 'syncing', err: '' });
      if (wasDirty) this.scan(); this.save(); this.set({ pending: this.out.size });
      await this.push(); await this.pull();
      this.set({ state: 'idle', last: Date.now(), pending: this.out.size }); profile.schedulePush();
    } catch (e: any) { this.set({ state: navigator.onLine === false || isNetErr(e) ? 'offline' : 'error', err: String(e?.message || e).slice(0, 160), pending: this.out.size }); }
    finally { this.busy = false; this.save(); if (this.again) setTimeout(() => this.run(), 400); }
  }
  /** When signed in, requests carry the account's login so a space the account has claimed accepts them. */
  private async uh(): Promise<Record<string, string>> { const t = await auth.token(); return t ? { 'x-user-token': t } : {}; }
  private async call(body: object) {
    const r = await timedFetch(apiUrl('/api/sync'), { method: 'POST', headers: { 'content-type': 'application/json', ...(await this.uh()) }, body: JSON.stringify(body) }, 25_000);
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not reach sync.'); return j;
  }
  /** Protect this device's space with the signed-in account ('' = done, otherwise the reason it did not work). */
  async protect(on = true): Promise<string> {
    if (!this.cfg) return 'Turn on sync first.';
    try { await this.call({ space: this.cfg.space, [on ? 'claim' : 'release']: true }); return ''; } catch (e: any) { return e.message || 'Could not protect sync.'; }
  }
  private async push() {
    const cur = this.collect();
    while (this.out.size) {
      const keys = [...this.out].slice(0, 120), ops: { rk: string; t: string; d: string }[] = [], sent: string[] = [];
      for (const k of keys) {
        const m = this.meta[k]; if (!m) { this.out.delete(k); continue; }
        const c = cur.get(k);
        if (m[2] === 0 && !c) { this.out.delete(k); continue; }   // vanished between scan and push; the next scan makes a tombstone
        ops.push({ rk: await this.rk(k), t: m[0], d: await this.seal({ k, v: m[2] ? null : c!.v }) }); sent.push(k);
      }
      if (ops.length) await this.call({ space: this.cfg!.space, ops });
      sent.forEach(k => this.out.delete(k)); this.save(); this.set({ pending: this.out.size });
    }
  }
  private async pull() {
    for (let guard = 0; guard < 60; guard++) {
      const r = await timedFetch(apiUrl(`/api/sync?space=${this.cfg!.space}&after=${this.cur}`), { cache: 'no-store', headers: await this.uh() }, 25_000);
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not reach sync.');
      const rows: { rk: string; t: string; d: string; seq: number }[] = j.rows || []; if (!rows.length) return;
      const got: { k: string; t: string; v: any }[] = [];
      for (const row of rows) { try { const o = await this.open(row.d); if (o && typeof o.k === 'string') got.push({ k: o.k, t: row.t, v: o.v }); } catch { /* not ours / corrupted: skip */ } }
      this.scan();   // stamp anything the user changed meanwhile, so it beats older remote data
      const eng: [string, any][] = [], nts: [string, any][] = [], kvs: [string, any][] = [];
      for (const [k, v] of mergeRemote(this.meta, got, t => this.seen(t))) (k.startsWith('no:') ? nts : k.startsWith('kv:') ? kvs : eng).push([k, v]);
      if (eng.length) engine().syncApply(eng);
      if (nts.length) notes().syncApply(nts);
      if (kvs.length) prefs.syncApply(kvs);
      this.cur = rows[rows.length - 1].seq; this.save();
      if (rows.length < 300) return;
    }
  }
}
let _s: Sync | null = null;
export const sync = () => _s || (_s = new Sync());
