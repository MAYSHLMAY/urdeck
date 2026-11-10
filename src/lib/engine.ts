/*
 * The study engine: every rule of the original app, as one plain TypeScript store.
 * React components subscribe to it (see useEngine) and call its methods.
 */
import { replaceCard, type BatchOp } from './batch';
import { fnv } from './fnv';
import { parsePack, parseRaw, ready, cook } from './parse';
import { DEF, M, D, addDays, dayStart, fmtIv, lab as labFn, nxt, steps, ymd, type CS, type Opts } from './srs';
import { applyMut, buildTree, emptyTree, fpath, type Tree } from './tree';
import { emptyMeta, fetchMeta, readCache, saveCards, syncCards, type Meta } from './library';
import { api, isOwner } from './api';
import { setSound, sfx } from './game/sound';
import type { Card, FoldDB, LocalPack, Mut, QCard } from './types';

const K_MIS = 'fr-mistakes-v1', K_SH = 'fr-shaky-v1', K_MY = 'fr-my-v1', K_PROG = 'fr-progress-v1', K_MINE = 'fr-mine-v1', K_FOLD = 'fr-folders-local-v1', K_NOTES = 'fr-notes-v1';
const WORD = ['all', 'book', 'hard', 'pe', 'penew', 'weak', 'marked', 'leech'];

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const shuf = <T,>(a: T[]) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const plain = (h: string) => h.replace(/<[^>]+>/g, '');
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const jget = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

export const splitPath = (t: string) => String(t || '').split('/').map(x => x.trim()).filter(Boolean);

export class Engine {
  ver = 0; notesVer = 0;
  private subs = new Set<() => void>();
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVer = () => this.ver;
  emit() { this.ver++; this.subs.forEach(f => f()); }

  /* loading */
  ready = false; loadErr = ''; syncing = false;

  /* persisted on this device */
  S: any = { cards: {}, day: '', newToday: 0, revToday: 0, done: 0, ok: 0, streak: 0, best: 0, last: '', limit: 20, sec: 'all', log: {}, opt: {} };
  PE: any = { batch: 'past-exam-batch1', added: Date.now(), seen: {} };
  DATA: { packs: LocalPack[]; titles: Record<string, string> } = { packs: [], titles: {} };
  NOTES: Record<string, any[]> = {};
  LF: FoldDB = { folders: [], place: {} };

  /* shared library */
  server: Card[] = [];
  extra: Card[] = [];
  /** Cards the learner marked "unsure" (the Shaky pile). Kept apart from the Study pile; this device only. */
  SH: Record<string, 1> = {};
  /** Mistake log: how often each card was missed, and how many right answers since (two in a row clears it). Device only. */
  MIS: Record<string, { w: number; r: number; t: number }> = {};
  /** Speed round (timed practice). `speedResult` holds the last finished round for the summary screen. */
  speed: { end: number; secs: number; right: number; wrong: number; n: number; missed: string[] } | null = null;
  speedResult: { secs: number; right: number; wrong: number; n: number; missed: string[]; left: number; timeUp: boolean } | null = null;
  /** Private layer (this device only): personal cards, plus edits / removals applied on top of any card. */
  MY: { cards: Card[]; edits: Record<string, any> } = { cards: [], edits: {} };
  meta: Meta = emptyMeta();
  Q: QCard[] = [];
  GT: Record<string, string> = {};
  FT: Tree = emptyTree();
  qver = 0; ftver = 0;

  /* session */
  counter = 0; later: Record<string, number> = {}; last: string | null = null;
  cur: QCard | null = null; phase = ''; curOpts: { t: string; ok: number }[] = []; chosen: number | null = null;
  forced: string | null = null; cram = false; ahead = 0; pend: any = null; showN = 0;
  U: any[] = [];

  /* library menu navigation */
  BR = 'root'; BH: string[] = []; BW: string[] = [];

  /* toast */
  toastMsg = ''; toastOn = false; private toastT: any;

  /* background sync */
  private cloudQ: Mut[] = []; private cloudT: any; cloudBusy = false; cardsBusy = 0;
  private saveT: any = 0;

  constructor() {
    const m = jget(K_MINE);
    if (m) { this.DATA.packs = m.packs || []; this.DATA.titles = m.titles || {}; }
    const sh = jget(K_SH); if (sh) this.SH = sh;
    const mi = jget(K_MIS); if (mi) this.MIS = mi;
    const my = jget(K_MY); if (my) this.MY = { cards: my.cards || [], edits: my.edits || {} };
    const p = jget(K_PROG);
    if (p && p.S) Object.assign(this.S, p.S);
    if (p && p.PE) Object.assign(this.PE, p.PE);
    this.S.opt = Object.assign({}, DEF, this.S.opt); this.S.log = this.S.log || {}; this.S.cards = this.S.cards || {};
    const lf = jget(K_FOLD); if (lf) this.LF = { folders: lf.folders || [], place: lf.place || {} };
    this.NOTES = jget(K_NOTES) || {};
    if (typeof window !== 'undefined') {
      addEventListener('pagehide', () => this.flushAll());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.flushAll();
        else if (this.phase === 'done') this.show();
      });
      addEventListener('beforeunload', e => { if (this.cloudQ.length || this.cloudBusy || this.cardsBusy) { e.preventDefault(); e.returnValue = ''; } });
    }
  }

  get O(): Opts { return this.S.opt; }

  /* ---------- storage ---------- */
  persist() { clearTimeout(this.saveT); this.saveT = setTimeout(() => this.flushSave(), 350); return true; }
  flushSave() {
    clearTimeout(this.saveT); this.saveT = 0;
    try { localStorage.setItem(K_PROG, JSON.stringify({ S: this.S, PE: this.PE })); } catch { this.toast('Storage is full. Download a backup.'); }
  }
  flushAll() { if (this.saveT) this.flushSave(); if (this.cloudQ.length) this.flushCloud(); }
  persistMine() {
    try { localStorage.setItem(K_MINE, JSON.stringify({ packs: this.DATA.packs, titles: this.DATA.titles })); return true; }
    catch { this.toast('Storage is full. Download a backup.'); return false; }
  }
  saveNotes() { try { localStorage.setItem(K_NOTES, JSON.stringify(this.NOTES)); } catch { this.toast('Could not save notes'); } }
  saveLF() { try { localStorage.setItem(K_FOLD, JSON.stringify(this.LF)); } catch { /* ignore */ } }
  save() { this.persist(); }

  toast(m: string) {
    this.toastMsg = m; this.toastOn = true; this.emit();
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { this.toastOn = false; this.emit(); }, 2200);
  }

  /* ---------- boot: show the cached library at once, then check the network ---------- */
  private inited = false;
  async init() {
    if (this.inited) return; this.inited = true;
    try {
      const c = await readCache();
      if (c.cards.length || c.meta) {
        this.server = c.cards; if (c.meta) this.meta = c.meta;
        this.rebuild(); this.ready = true; this.roll(); this.show();
      }
    } catch { /* ignore */ }
    this.sync(!this.ready);
  }

  async sync(first: boolean) {
    this.syncing = true; this.emit();
    try {
      const [m, c] = await Promise.all([fetchMeta(), syncCards(this.server)]);
      const busy = this.cloudQ.length > 0 || this.cloudBusy;
      const changed = c.added > 0 || (!busy && JSON.stringify(m) !== JSON.stringify(this.meta));
      if (c.added) this.server = c.cards;
      if (!busy) this.meta = m;
      if (changed) {
        this.rebuild();
        if (!first) this.toast(c.added ? `Library updated (+${c.added} cards)` : 'Library updated');
      }
    } catch (e: any) {
      if (!this.ready) this.loadErr = e.message || 'Could not load the library.';
    } finally {
      this.syncing = false;
      if (!this.ready && !this.loadErr) { this.ready = true; this.roll(); this.show(); }
      else if (!this.ready) this.ready = true;
      this.emit();
    }
  }

  /* ---------- cards, titles, tree ---------- */
  private pcc = new WeakMap<LocalPack, Card[]>();
  packCards(pk: LocalPack) {
    let r = this.pcc.get(pk);
    if (!r) { r = parsePack(pk.name, pk.text).cards; this.pcc.set(pk, r); }
    return r;
  }
  loadPacks() { return this.DATA.packs; }

  rebuild() {
    this.buildQ();
    if (!this.validSel(this.S.sec)) this.S.sec = 'all';
    this.emit();
  }

  /* ---------- device sync hooks (see lib/sync.ts) ---------- */
  /** Every piece of progress/private data as separate records, so only what changed is sent and merged. */
  syncCollect(m: Map<string, { v: any; ts?: number }>) {
    const S = this.S;
    for (const id in S.cards) m.set('c:' + id, { v: S.cards[id], ts: S.cards[id]?.a || 0 });
    for (const id in this.SH) m.set('sh:' + id, { v: 1 });
    for (const id in this.MIS) m.set('mi:' + id, { v: this.MIS[id], ts: this.MIS[id].t });
    this.MY.cards.forEach(c => m.set('my:' + c.id, { v: c }));
    for (const id in this.MY.edits) m.set('me:' + id, { v: this.MY.edits[id] });
    this.LF.folders.forEach(f => m.set('fo:' + f.id, { v: f }));
    for (const id in this.LF.place) m.set('pl:' + id, { v: this.LF.place[id] });
    for (const d in S.log || {}) m.set('lg:' + d, { v: S.log[d] });
    for (const id in (this.PE.seen || {})) m.set('pe:' + id, { v: this.PE.seen[id] });
  }
  /** Apply records received from another device. */
  syncApply(ch: [string, any][]) {
    const S = this.S; let cards = false;
    for (const [k, v] of ch) {
      const i = k.indexOf(':'), t = k.slice(0, i), id = k.slice(i + 1), del = v == null;
      if (t === 'c') { if (del) delete S.cards[id]; else S.cards[id] = v; cards = true; }
      else if (t === 'sh') { if (del) delete this.SH[id]; else this.SH[id] = 1; }
      else if (t === 'mi') { if (del) delete this.MIS[id]; else this.MIS[id] = v; }
      else if (t === 'my') { this.MY.cards = this.MY.cards.filter(c => c.id !== id); if (!del) this.MY.cards.push(v); cards = true; }
      else if (t === 'me') { if (del) delete this.MY.edits[id]; else this.MY.edits[id] = v; cards = true; }
      else if (t === 'fo') { this.LF.folders = this.LF.folders.filter(f => f.id !== id); if (!del) this.LF.folders.push(v); cards = true; }
      else if (t === 'pl') { if (del) delete this.LF.place[id]; else this.LF.place[id] = v; cards = true; }
      else if (t === 'lg') { S.log = S.log || {}; if (del) delete S.log[id]; else S.log[id] = v; }
      else if (t === 'pe') { this.PE.seen = this.PE.seen || {}; if (del) delete this.PE.seen[id]; else this.PE.seen[id] = v; }
    }
    this.flushSave(); this.saveMy(); this.saveLF();
    try { localStorage.setItem(K_SH, JSON.stringify(this.SH)); localStorage.setItem(K_MIS, JSON.stringify(this.MIS)); } catch { /* ignore */ }
    if (cards && this.ready) this.buildQ();
    this.emit();
  }
  buildQ() {
    const ids = new Set<string>(), all: Card[] = [];
    const ed = this.MY.edits;
    const add = (c: Card) => {
      const k = String(c.id); if (ids.has(k)) return;
      const e = ed[k]; if (e && e.del) return;               // removed for me only
      ids.add(k); all.push(e ? ({ ...c, q: e.q, c: e.c, w: e.w, p: e.p ?? c.p, id: c.id } as Card) : c);
    };
    this.server.forEach(add); this.extra.forEach(add);
    this.DATA.packs.forEach(pk => this.packCards(pk).forEach(add));
    this.MY.cards.forEach(add);
    this.Q = all.map(ready);
    this.qver++;
    this.buildTitles(); this.buildTree();
  }
  gname = (k: string) => this.meta.cats[k] || this.GT[k] || (k === 'other' ? 'Other' : '');
  buildTitles() {
    const GT: Record<string, string> = Object.assign({}, this.meta.chapters), secs = new Map<string, Set<string>>();
    this.Q.forEach(q => {
      if (q.p || !/^\d/.test(q.g)) return;
      if (q.n === q.g && q.t) GT[q.g] = q.t;
      let a = secs.get(q.g); if (!a) { a = new Set(); secs.set(q.g, a); } a.add(q.s);
    });
    secs.forEach((a, k) => { if (!GT[k] && a.size === 1) { const q = this.Q.find(z => !z.p && z.g === k); if (q && q.t) GT[k] = q.t; } });
    const TT = Object.assign({}, this.meta.titles, this.DATA.titles);
    Object.keys(TT).forEach(k => { if (TT[k]) GT[k] = TT[k]; });
    this.GT = GT;
  }
  buildTree() {
    this.FT = buildTree(this.Q, this.meta.fold, this.LF, this.gname);
    this.ftver++; this._pl = null;
  }
  gkey = (k: string) => /^\d/.test(k) ? k : '';

  /* ---------- scheduling clock ---------- */
  dayStart = (t: number) => dayStart(t, this.O.rollover);
  addDays = addDays;
  dayKey = (t: number) => ymd(new Date(this.dayStart(t)));
  roll() {
    const k = this.dayKey(Date.now()), S = this.S;
    if (S.day !== k) { S.day = k; S.newToday = 0; S.revToday = 0; S.done = 0; S.ok = 0; }
  }
  get = (id: string): CS => this.S.cards[id] || { t: 'new', step: 0, iv: 0, ease: this.O.startEase, due: 0, lapses: 0, reps: 0 };
  isNew = (c?: CS) => !c || c.t === 'new';
  isLrn = (c?: CS) => !!c && (c.t === 'learn' || c.t === 'relearn');
  isLeech = (c?: CS) => !!c && (c.lapses || 0) >= this.O.leech;
  isNewPE = (q: QCard) => !!q.p && !this.PE.seen[q.id];
  lab = (id: string, c: CS, g: number) => labFn(id, c, g, this.O);
  fmtIv = fmtIv;

  /* ---------- selection ---------- */
  /** Pools (categories) → their card sets. Lets the study screen pick "everything in this pool" with `c:<id>`. */
  catSets = new Map<string, Set<string>>(); catNames = new Map<string, string>(); poolsLoaded = false; private poolKey = ''; private poolVer = 0;
  setPools(links: { category_id: string; section: string }[], cats: { id: string; name: string }[]) {
    const key = JSON.stringify([links.map(l => l.category_id + l.section).sort(), cats.map(c => c.id + c.name).sort()]);
    if (key === this.poolKey) return;
    this.poolKey = key; this.poolVer++; this.poolsLoaded = true;
    this.catSets = new Map(); this.catNames = new Map(cats.map(c => [c.id, c.name]));
    links.forEach(l => { const st = this.catSets.get(l.category_id) || new Set<string>(); st.add(l.section); this.catSets.set(l.category_id, st); });
    if (!this.validSel(this.S.sec)) this.S.sec = 'all';
    this.emit();
  }
  poolCount(catId: string) {
    const st = this.catSets.get(catId); if (!st) return { c: 0, sets: 0 };
    return { c: this.Q.filter(q => st.has(q.s)).length, sets: st.size };
  }
  inSel(q: QCard, v: string, c?: any): boolean {
    if (v === 'all' || q.s === v) return true;
    switch (v) {
      case 'hard': return q.g === 'hard';
      case 'book': return !q.p;
      case 'pe': return !!q.p;
      case 'penew': return this.isNewPE(q);
      case 'weak': return !!c && ((c.lapses || 0) > 0 || ((c.a || 0) >= 3 && (c.k || 0) / c.a < .6));
      case 'marked': return !!c && !!c.mark;
      case 'leech': return this.isLeech(c);
    }
    if (v.startsWith('c:')) { const st = this.catSets.get(v.slice(2)); return !!st && st.has(q.s); }
    if (v.startsWith('f:')) { const st = this.FT.secs.get(v.slice(2)); return !!st && st.has(q.s); }
    return v.startsWith('g:') && q.g === v.slice(2);
  }
  private _pl: QCard[] | null = null; private _plk = '';
  pool(): QCard[] {
    const v = this.S.sec;
    if (v === 'weak' || v === 'marked' || v === 'leech' || v === 'penew') return this.Q.filter(q => this.inSel(q, v, this.S.cards[q.id]));
    const k = v + '|' + this.qver + '|' + this.ftver + '|' + this.poolVer;
    if (this._pl && this._plk === k) return this._pl;
    this._plk = k;
    return this._pl = this.Q.filter(q => this.inSel(q, v, this.S.cards[q.id]));
  }
  live(q: QCard, now: number) { const c = this.S.cards[q.id]; return !(c && (c.susp || c.by > now)); }
  selLabel() {
    const v = this.S.sec, Q = this.Q;
    const W: Record<string, string> = { all: 'All cards (' + Q.length + ')', book: 'Study-book cards', hard: 'Hard questions', pe: 'Past exam questions', penew: 'Past exam: unseen only', weak: 'Weak spots', marked: 'Marked cards', leech: 'Leeches' };
    if (W[v]) return W[v];
    if (v.startsWith('c:')) return 'Pool: ' + (this.catNames.get(v.slice(2)) || 'Pool');
    if (v.startsWith('f:')) return fpath(this.FT, v.slice(2)).join(' › ') || 'Library';
    if (v.startsWith('g:')) { const k = v.slice(2); return (this.gkey(k) + ' ' + this.gname(k)).trim() || k; }
    const q = Q.find(x => x.s === v);
    return q ? ((q.n ? q.n + ' · ' : '') + q.t) : W.all;
  }
  validSel(v: string) {
    return WORD.includes(v) || (v.startsWith('c:') && (!this.poolsLoaded || this.catSets.has(v.slice(2)))) || (v.startsWith('f:') && this.FT.name.has(v.slice(2))) || (v.startsWith('g:') && this.Q.some(q => q.g === v.slice(2))) || this.Q.some(q => q.s === v);
  }
  setSel(v: string) {
    this.S.sec = v; this.speed = null; this.later = {}; this.last = null; this.cram = false; this.ahead = 0; this.save(); this.show();
  }

  /* ---------- undo ---------- */
  snap(id: string) {
    const S = this.S, dk = this.dayKey(Date.now());
    return { id, c: S.cards[id] ? { ...S.cards[id] } : null, s: { done: S.done, ok: S.ok, newToday: S.newToday, revToday: S.revToday, streak: S.streak, best: S.best, last: S.last }, dk, lg: S.log[dk] ? { ...S.log[dk] } : null };
  }
  pushU(u: any) { this.U.push(u); if (this.U.length > 30) this.U.shift(); }
  doUndo() {
    const u = this.U.pop(); if (!u) return; const S = this.S;
    if (u.c) S.cards[u.id] = u.c; else delete S.cards[u.id];
    Object.assign(S, u.s);
    if (u.lg) S.log[u.dk] = u.lg; else delete S.log[u.dk];
    this.forced = u.id; this.save(); this.toast('Undone'); this.show();
  }

  /* ---------- picking the next card ---------- */
  pick(): QCard | null {
    this.roll();
    const now = Date.now(), x = this.O, S = this.S; this.counter++;
    if (this.forced !== null) {
      const f = String(this.forced), q = this.Q.find(z => String(z.id) === f); this.forced = null; if (q) return q;
    }
    const P = this.pool().filter(q => this.live(q, now)), okc = (q: QCard) => !(this.later[q.id] > this.counter);
    const from = (a: QCard[]) => { const b = a.filter(q => q.id !== this.last); return rnd(b.length ? b : a); };
    if (this.cram) { // practice: bring the chosen cards back once each, in random order; nothing is rescheduled
      while (this.deck.length) { const id = this.deck.shift()!, q = P.find(z => z.id === id); if (q) return q; }
      return null;
    }
    const L = P.filter(q => this.isLrn(S.cards[q.id]));
    let a = L.filter(q => S.cards[q.id].due <= now && okc(q)); if (a.length) return from(a);
    const lim = addDays(this.dayStart(now), 1 + this.ahead);
    const R = (!x.maxRev || S.revToday < x.maxRev || this.ahead) ? P.filter(q => { const c = S.cards[q.id]; return c && c.t === 'review' && c.due < lim && okc(q); }) : [];
    const N = S.newToday < S.limit ? P.filter(q => this.isNew(S.cards[q.id]) && okc(q)) : [];
    const useNew = N.length && (!R.length || x.mix === 'first' || (x.mix === 'mixed' && Math.random() < N.length / (N.length + R.length)));
    if (R.length && !useNew) return from(R);
    if (N.length) return x.newOrder === 'rand' ? rnd(N) : N[0];
    a = L.filter(q => S.cards[q.id].due <= now + x.learnAhead * M && okc(q)).sort((p, r) => S.cards[p.id].due - S.cards[r.id].due); if (a.length) return a[0];
    a = P.filter(q => { const z = S.cards[q.id]; return !okc(q) && ((this.isNew(z) && S.newToday < S.limit) || this.isLrn(z) || (z && z.t === 'review' && z.due < lim)); });
    if (a.length) return from(a);
    return null;
  }

  private cc: { v: number; r: any } | null = null;
  counts() {
    if (this.cc && this.cc.v === this.ver) return this.cc.r;
    const now = Date.now(), x = this.O, S = this.S, P = this.pool().filter(q => this.live(q, now)), lim = addDays(this.dayStart(now), 1 + this.ahead);
    let n = 0, l = 0, d = 0, m = 0, r = 0;
    P.forEach(q => { const c = S.cards[q.id]; if (this.isNew(c)) { n++; return; } if (c.t === 'review') { r++; if (c.iv >= 21) m++; if (c.due < lim) d++; } else l++; });
    const res = { n, l, d, m, r, tot: P.length, nToday: Math.max(0, Math.min(n, S.limit - S.newToday)), dToday: x.maxRev ? Math.min(d, Math.max(0, x.maxRev - S.revToday)) : d };
    this.cc = { v: this.ver, r: res };
    return res;
  }
  examInfo() {
    const e = this.O.exam; if (!e) return '';
    const t = new Date(e + 'T23:59:59').getTime(); if (isNaN(t)) return '';
    const days = Math.ceil((t - Date.now()) / D); if (days < 0) return '';
    const nw = this.Q.filter(q => this.isNew(this.S.cards[q.id]) && !(this.S.cards[q.id] && this.S.cards[q.id].susp)).length;
    return days === 0 ? 'exam today' : `exam in ${days} d${nw ? ` · ~${Math.ceil(nw / Math.max(1, days))} new/day to finish` : ''}`;
  }
  streakTick() {
    const S = this.S, now = Date.now(), t = this.dayKey(now); if (S.last === t) return;
    const yest = this.dayKey(addDays(this.dayStart(now), -1));
    if (S.last === yest) S.streak += 1;
    else {
      // missed days can be covered by streak freezes (one is earned for every 7 days in a row, up to 2)
      let gap = 0; if (S.last) { for (let k = 1; k < 60; k++) { if (this.dayKey(addDays(this.dayStart(now), -k)) === S.last) { gap = k - 1; break; } } }
      if (S.last && S.streak > 0 && gap > 0 && gap <= (S.freeze || 0)) { S.freeze -= gap; S.streak += 1; S.saved = (S.saved || 0) + gap; } else S.streak = 1;
    }
    if (S.streak > 0 && S.streak % 7 === 0 && S.lastFz !== S.streak) { S.freeze = Math.min(2, (S.freeze || 0) + 1); S.lastFz = S.streak; }
    S.last = t; S.best = Math.max(S.best || 0, S.streak);
  }
  logAns(good: boolean, wasReview: boolean) {
    const S = this.S, dk = this.dayKey(Date.now()), L = S.log[dk] || (S.log[dk] = { n: 0, k: 0, r: 0, rk: 0 });
    L.n++; if (good) L.k++; if (wasReview) { L.r++; if (good) L.rk++; }
    const ks = Object.keys(S.log).sort(); while (ks.length > 200) delete S.log[ks.shift()!];
  }

  /* ---------- the study loop ---------- */
  show() {
    this.cur = this.pick(); this.showN++; this.chosen = null;
    if (!this.cur && this.speed) { this.finishSpeed(false); return; }
    if (!this.cur) { this.phase = 'done'; this.curOpts = []; this.emit(); return; }
    this.phase = 'q';
    this.curOpts = shuf([{ t: this.cur.c, ok: 1 }, ...this.cur.w.map(t => ({ t, ok: 0 }))]);
    this.emit();
  }
  laterQ() {
    if (this.phase !== 'q' || !this.cur) return;
    this.later[this.cur.id] = this.counter + 4 + Math.floor(Math.random() * 7); this.last = this.cur.id; this.show();
  }
  setCard(id: string, patch: Partial<CS>) {
    this.pushU(this.snap(id)); this.S.cards[id] = { ...this.get(id), ...patch }; this.save();
  }
  toggleFlag(id: string, k: 'mark' | 'susp') {
    const c: any = this.get(id); this.setCard(id, { [k]: c[k] ? 0 : 1 });
    if (k === 'susp') { this.toast(c.susp ? 'Card unsuspended' : 'Card suspended'); if (this.cur && this.cur.id === id) this.show(); else this.emit(); }
    else { this.toast(c.mark ? 'Mark removed' : 'Card marked'); this.emit(); }
  }
  buryCard(id: string) { this.setCard(id, { by: addDays(this.dayStart(Date.now()), 1) }); this.toast('Buried until tomorrow'); this.show(); }
  resetCard(id: string) { this.pushU(this.snap(id)); delete this.S.cards[id]; this.save(); this.emit(); }

  answer(i: number) {
    if (this.phase !== 'q' || !this.cur) return;
    const good = i >= 0 && !!this.curOpts[i].ok, x = this.O, S = this.S, cur = this.cur;
    this.chosen = i;
    this.noteResult(cur.id, good);
    if (this.speed) {
      const sp = this.speed; if (good) sp.right++; else { sp.wrong++; sp.missed.push(cur.id); }
      setTimeout(() => { if (this.speed && this.phase === 'cr' && this.cur && this.cur.id === cur.id) this.show(); }, good ? 450 : 1400);
    }
    if (typeof navigator !== 'undefined') {
      if (x.vib && navigator.vibrate) navigator.vibrate(good ? 12 : [40, 40, 40]);
      if (x.sound) { setSound(true); (good ? sfx.right : sfx.wrong)(); }
    }
    if (this.cram) { this.phase = 'cr'; this.emit(); return; }
    this.pend = this.snap(cur.id); this.phase = good ? 'ok' : 'bad';
    S.done++; if (good) S.ok++; this.streakTick(); if (cur.p) { this.PE.seen[cur.id] = 1; this.persist(); }
    if (!good) this.commit(cur.id, 0);
    this.emit();
  }
  /** Flip / type-in / cloze cards: the learner grades themselves (0 Again … 3 Easy). Same scheduling as a multiple-choice answer. */
  flipGrade(g: number) {
    if (this.phase !== 'q' || !this.cur) return;
    const ok = g > 0, i = this.curOpts.findIndex(o => !!o.ok === ok);
    this.answer(i < 0 ? -1 : i);
    const ph = this.phase as string;
    if (ph === 'ok') this.grade(g); else if (ph === 'bad' || ph === 'cr') this.show();
  }
  commit(id: string, g: number) {
    const c = this.get(id), x = this.O, S = this.S, was = c.t;
    if (this.pend) { this.pushU(this.pend); this.pend = null; }
    const n: any = nxt(id, c, g, x); n.a = (c.a || 0) + 1; if (g > 0) n.k = (c.k || 0) + 1;
    if (was === 'new') S.newToday++; else if (was === 'review') S.revToday++;
    if (g === 0 && was === 'review' && x.leechSusp && n.lapses === x.leech) { n.susp = 1; this.toast('Leech: card suspended'); }
    this.logAns(g > 0, was === 'review'); S.cards[id] = n; this.last = id; this.save();
  }
  grade(g: number) {
    if (this.phase !== 'ok' || !this.cur) return;
    this.phase = 'graded'; this.commit(this.cur.id, g); this.show();
  }
  /* ---------- Study pile / Shaky pile (separate, per card, so per set) ---------- */
  isShaky(id: string) { return !!this.SH[id]; }
  setShaky(id: string, on: boolean) {
    if (on) this.SH[id] = 1; else delete this.SH[id];
    try { localStorage.setItem(K_SH, JSON.stringify(this.SH)); } catch { /* storage full: still works this session */ }
    this.emit();
  }
  /* ---------- mistake log ---------- */
  noteResult(id: string, good: boolean) {
    const m = this.MIS[id] || (this.MIS[id] = { w: 0, r: 0, t: 0 });
    if (good) m.r++; else { m.w++; m.r = 0; }
    m.t = Date.now();
    if (m.w === 0) delete this.MIS[id];
    try { localStorage.setItem(K_MIS, JSON.stringify(this.MIS)); } catch { /* ignore */ }
  }
  isMissed(id: string) { const m = this.MIS[id]; return !!m && m.w > 0 && m.r < 2; }
  clearMissed(id: string) { delete this.MIS[id]; try { localStorage.setItem(K_MIS, JSON.stringify(this.MIS)); } catch { /* ignore */ } this.emit(); }
  /* ---------- speed round ---------- */
  startSpeed(ids: string[], secs: number) {
    if (!ids.length) return;
    this.speedResult = null; this.speed = null;
    this.startPracticeIds(ids);
    if (!this.cram) return;
    this.speed = { end: Date.now() + secs * 1000, secs, right: 0, wrong: 0, n: ids.length, missed: [] };
    this.emit();
  }
  finishSpeed(timeUp: boolean) {
    const s = this.speed; if (!s) return;
    this.speedResult = { secs: s.secs, right: s.right, wrong: s.wrong, n: s.n, missed: [...new Set(s.missed)], left: this.deck.length + (this.cur && this.phase === 'q' ? 1 : 0), timeUp };
    this.speed = null; this.cram = false; this.deck = []; this.show();
  }
  closeSpeed() { this.speedResult = null; this.emit(); }
  /** Practice exactly these cards (random order). Nothing is rescheduled. */
  startPracticeIds(ids: string[]) {
    const a = ids.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (!a.length) return;
    this.deck = a; this.practiced = a.length; this.cram = true; this.later = {}; this.last = null; this.show();
  }
  /** Practice deck: the cards of the current selection that match `kind`, shuffled. Progress and schedule are never touched. */
  deck: string[] = []; practiced = 0;
  practiceCounts() {
    const now = Date.now(), P = this.pool().filter(q => this.live(q, now)), S = this.S;
    return {
      all: P.length,
      fresh: P.filter(q => this.isNew(S.cards[q.id])).length,
      weak: P.filter(q => { const c = S.cards[q.id]; return !!c && (this.isLrn(c) || (c.lapses || 0) > 0); }).length,
      marked: P.filter(q => { const c = S.cards[q.id]; return !!c && !!c.mark; }).length
    };
  }
  startPractice(kind: 'all' | 'fresh' | 'weak' | 'marked' = 'all') {
    const now = Date.now(), S = this.S;
    const ok = (q: QCard) => { const c = S.cards[q.id]; return kind === 'all' ? true : kind === 'fresh' ? this.isNew(c) : kind === 'weak' ? !!c && (this.isLrn(c) || (c.lapses || 0) > 0) : !!c && !!c.mark; };
    const ids = this.pool().filter(q => this.live(q, now) && ok(q)).map(q => q.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    this.deck = ids; this.practiced = ids.length; this.cram = true; this.later = {}; this.last = null; this.show();
  }
  exitPractice() { this.speed = null; this.cram = false; this.deck = []; this.show(); }
  learnMore() { this.S.limit = this.S.newToday + 10; this.save(); this.show(); }
  reviewAhead() { this.ahead = 1; this.show(); }

  /** What the "done" screen needs. */
  doneInfo() {
    const now = Date.now(), P = this.pool().filter(q => this.live(q, now)), c = this.counts(), S = this.S;
    const cs = P.map(q => S.cards[q.id]);
    const lrn = cs.filter(this.isLrn).map((z: any) => z.due).sort((a: number, b: number) => a - b);
    const nxtRev = cs.filter((z: any) => z && z.t === 'review').map((z: any) => z.due).sort((a: number, b: number) => a - b);
    const tomorrow = cs.filter((z: any) => z && z.t === 'review' && z.due >= addDays(this.dayStart(now), 1) && z.due < addDays(this.dayStart(now), 2)).length;
    const waiting = !!lrn.length && lrn[0] > now + this.O.learnAhead * M;
    return { P: P.length, c, lrn, nxtRev, tomorrow, waiting, first: lrn.length ? lrn[0] : 0 };
  }

  /* ---------- card info ---------- */
  stateOf(q: QCard): [string, string] {
    const c = this.S.cards[q.id], now = Date.now();
    if (c && c.susp) return ['susp', 'Suspended']; if (this.isNew(c)) return ['new', 'New']; if (this.isLrn(c)) return ['learn', 'Learning'];
    if (c.due < addDays(this.dayStart(now), 1)) return ['due', 'Due'];
    return c.iv >= 21 ? ['mature', 'Mastered'] : ['young', 'Young'];
  }
  infoText(q: QCard) {
    const c = this.S.cards[q.id], o: string[] = [];
    if (this.isNew(c)) o.push('Not studied yet');
    else {
      o.push(`Answered ${c.a || c.reps || 0}×, correct ${c.k !== undefined ? c.k : '–'}`); o.push(`Lapses ${c.lapses || 0}${this.isLeech(c) ? ' (leech)' : ''}`);
      if (c.t === 'review') o.push(`Interval ${fmtIv(c.iv)} · ease ${Math.round(c.ease * 100)}%`);
      const d = c.due - Date.now();
      o.push(c.t === 'review' ? `Due ${new Date(c.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : (d > 0 ? `Next step in ${Math.max(1, Math.round(d / M))} min` : 'Due now'));
    }
    if (c && c.mark) o.push('Marked'); if (c && c.susp) o.push('Suspended'); if (c && c.by > Date.now()) o.push('Buried until tomorrow');
    return o.join(' · ');
  }
  qById(id: string) { return this.Q.find(z => String(z.id) === String(id)); }
  secPath = (s: string) => fpath(this.FT, this.FT.secOf.get(s) || 'root');

  /* ---------- library navigation ---------- */
  navTo(id: string) { if (id === this.BR || !this.FT.name.has(id)) return; this.BH.push(this.BR); this.BW = []; this.BR = id; this.emit(); }
  navBack() { if (!this.BH.length) return false; this.BW.push(this.BR); this.BR = this.BH.pop()!; if (!this.FT.name.has(this.BR)) this.BR = 'root'; this.emit(); return true; }
  navFwd() { if (!this.BW.length) return; this.BH.push(this.BR); this.BR = this.BW.pop()!; if (!this.FT.name.has(this.BR)) this.BR = 'root'; this.emit(); }
  navUp() { if (this.BR === 'root') return; this.navTo(this.FT.parent.get(this.BR) || 'root'); }
  openMenu(keep?: boolean) {
    const v = this.S.sec;
    if (!keep) { if (v.startsWith('f:') && this.FT.name.has(v.slice(2))) this.BR = v.slice(2); else if (this.FT.secOf.has(v)) this.BR = this.FT.secOf.get(v)!; }
    if (!this.FT.name.has(this.BR)) this.BR = 'root';
    this.BH = []; this.BW = []; this.emit();
  }
  menuStats() {
    const now = Date.now(), lim = addDays(this.dayStart(now), 1), U = new Map<string, { c: number; d: number; m: number }>();
    this.Q.forEach(q => {
      const c = this.S.cards[q.id]; let u = U.get(q.s); if (!u) { u = { c: 0, d: 0, m: 0 }; U.set(q.s, u); } u.c++;
      if (c) { if (!c.susp && (this.isLrn(c) ? c.due <= now : c.t === 'review' && c.due < lim)) u.d++; if (c.t === 'review' && c.iv >= 21) u.m++; }
    });
    return U;
  }

  /* ---------- folders (optimistic, saved to Supabase in the background) ---------- */
  newId = newId;
  resolvePath(start: string, segs: string[]) {
    let cur = start; const plan: { id: string; name: string; parent: string }[] = [];
    for (const sg of segs) {
      let hit: string | undefined;
      if (!plan.length) hit = (this.FT.kids.get(cur) || []).find(k => (this.FT.name.get(k) || '').toLowerCase() === sg.toLowerCase());
      if (hit) { cur = hit; continue; }
      const id = newId(); plan.push({ id, name: sg, parent: cur }); cur = id;
    }
    return { id: cur, plan };
  }
  ensurePath(start: string, txt: string) {
    const segs = splitPath(txt); if (!segs.length) return { id: start, created: 0 };
    const r = this.resolvePath(start, segs);
    if (r.plan.length) this.foldOp(r.plan.map(f => ({ t: 'addFolder', ...f } as Mut)));
    return { id: r.id, created: r.plan.length };
  }
  foldOp(muts: Mut[]) {
    if (isOwner()) {
      let n = 0; muts.forEach(m => { if (applyMut(this.meta.fold, m)) n++; });
      if (n) { this.cloudQ.push(...muts); clearTimeout(this.cloudT); this.cloudT = setTimeout(() => this.flushCloud(), 500); }
    } else {
      let n = 0; muts.forEach(m => { if (applyMut(this.LF, m)) n++; });
      if (n) this.saveLF();
    }
    this.buildTree(); this.emit();
  }
  /** Delete a folder. The owner must re-type the password; the server checks it before anything changes. */
  async deleteFolder(id: string, up: string, password: string): Promise<string | null> {
    const m: Mut = { t: 'delFolder', id, up };
    if (isOwner()) {
      try { await api('/api/folders', { muts: [m], password }); }
      catch (x: any) { return x.message || 'Could not delete.'; }
      applyMut(this.meta.fold, m); this.buildTree(); this.emit();
    } else this.foldOp([m]);
    return null;
  }
  async flushCloud() {
    clearTimeout(this.cloudT); this.cloudT = 0;
    if (this.cloudBusy || !this.cloudQ.length) return;
    this.cloudBusy = true; this.emit();
    const batch = this.cloudQ.splice(0);
    try { await api('/api/folders', { muts: batch }); }
    catch (e: any) {
      this.toast('Could not save folder changes: ' + e.message);
      try { this.meta = await fetchMeta(); this.cloudQ.length = 0; this.buildTree(); } catch { /* ignore */ }
    }
    this.cloudBusy = false;
    if (this.cloudQ.length) this.flushCloud(); else this.emit();
  }
  get syncingCloud() { return this.cloudBusy || this.cloudQ.length > 0 || this.cardsBusy > 0; }

  /* ---------- owner: edit, remove, add one card ---------- */
  private afterCardChange(showNow: boolean) { saveCards(this.server); this.rebuild(); this.later = {}; if (showNow) this.show(); else this.emit(); }
  /** Change the question / answers of one card. The id stays the same, so progress, notes and PDF links are kept. */
  async editCard(id: string, f: { q: string; c: string; w: string[]; p?: boolean }): Promise<string | null> {
    if (!isOwner()) return 'Locked. Unlock with the owner password first.';
    try {
      const r = await api<{ card: Card }>('/api/cards', { action: 'edit', id, q: f.q, c: f.c, w: f.w, p: f.p });
      const i = this.server.findIndex(c => c.id === id);
      if (i >= 0) this.server[i] = { ...r.card, ord: this.server[i].ord }; else this.server.push(r.card);
      const isCur = !!this.cur && String(this.cur.id) === String(id);
      if (isCur) this.forced = id;
      this.afterCardChange(isCur);
      return null;
    } catch (x: any) { return x.message || 'Could not save the card.'; }
  }
  /** Batch operations. Owner: one request per 300 cards, saved for everyone. Others: private (this device). Returns a message. */
  async batchCards(ids: string[], op: BatchOp, password?: string): Promise<{ ok: boolean; msg: string }> {
    let changed = 0, skipped = 0;
    if (!isOwner()) {
      if (op.op === 'move') return { ok: false, msg: 'Only the owner can move cards between sets.' };
      for (const id of ids) {
        const c = this.qById(id); if (!c) continue;
        if (op.op === 'delete') { this.myRemoveCard(id); changed++; continue; }
        let f = { q: c.q, c: c.c, w: [...c.w], p: !!c.p };
        if (op.op === 'past') f.p = op.past;
        else if (op.op === 'replace') { const n = replaceCard(c, op); if (!n) continue; f = { ...f, ...n }; }
        const m = this.myEditCard(id, f); if (m) skipped++; else changed++;
      }
      return { ok: true, msg: changed + ' card' + (changed === 1 ? '' : 's') + ' changed for you' + (skipped ? ', ' + skipped + ' skipped' : '') + '.' };
    }
    try {
      for (let i = 0; i < ids.length; i += 300) {
        const r = await api<{ cards: Card[]; deleted: string[]; skipped: number }>('/api/cards', { action: 'batch', ids: ids.slice(i, i + 300), password, ...op });
        r.cards.forEach(n => { const k = this.server.findIndex(c => c.id === n.id); if (k >= 0) this.server[k] = { ...n, ord: this.server[k].ord }; });
        const gone = new Set(r.deleted); if (gone.size) { this.server = this.server.filter(c => !gone.has(c.id)); this.extra = this.extra.filter(c => !gone.has(c.id)); }
        changed += r.cards.length + r.deleted.length; skipped += r.skipped || 0;
      }
    } catch (x: any) { this.afterCardChange(false); return { ok: false, msg: (changed ? changed + ' done, then: ' : '') + (x.message || 'Could not finish.') }; }
    const cur = !!this.cur && ids.some(id => String(id) === String(this.cur!.id));
    if (cur) this.pend = null;
    this.afterCardChange(cur);
    return { ok: true, msg: changed + ' card' + (changed === 1 ? '' : 's') + ' changed' + (skipped ? ', ' + skipped + ' skipped' : '') + '.' };
  }
  async removeCard(id: string, password: string): Promise<string | null> {
    if (!isOwner()) return 'Locked. Unlock with the owner password first.';
    try {
      await api('/api/cards', { action: 'delete', id, password });
      const isCur = !!this.cur && String(this.cur.id) === String(id);
      this.server = this.server.filter(c => c.id !== id); this.extra = this.extra.filter(c => c.id !== id);
      if (isCur) this.pend = null;
      this.afterCardChange(isCur);
      return null;
    } catch (x: any) { return x.message || 'Could not delete the card.'; }
  }
  /** Add one card to an existing card set. */
  async addOneCard(f: { s: string; q: string; c: string; w: string[]; p?: boolean }): Promise<string | null> {
    if (!isOwner()) return 'Locked. Unlock with the owner password first.';
    try {
      const r = await api<{ card: Card }>('/api/cards', { action: 'add', ...f });
      this.server.push({ ...r.card, ord: (this.server.length ? (this.server[this.server.length - 1].ord || 0) : 0) + 0.5 });
      this.afterCardChange(this.phase === 'done' || !this.cur);
      return null;
    } catch (x: any) { return x.message || 'Could not add the card.'; }
  }

  /* ---------- private cards and edits (never leave this device) ---------- */
  saveMy(): boolean {
    try { localStorage.setItem(K_MY, JSON.stringify(this.MY)); return true; }
    catch { this.toast('Storage is full. Download a backup.'); return false; }
  }
  isMine(id: string) { return this.MY.cards.some(c => c.id === id); }
  myChanges() {
    const ed = Object.values(this.MY.edits) as any[];
    return { mine: this.MY.cards.length, edited: ed.filter(x => !x.del).length, hidden: ed.filter(x => x.del).length };
  }
  private myAfter(isCur: boolean) {
    this.saveMy(); this.rebuild(); this.later = {};
    if (isCur) { this.pend = null; this.show(); } else this.emit();
  }
  private myClean(f: { s?: string; q: string; c: string; w: string[]; p?: boolean }) {
    const w = f.w.map(x => x.trim()).filter(Boolean);
    if (!f.q.trim() || !f.c.trim()) return { err: 'The question and the correct answer cannot be empty.' } as const;
    if (w.length < 1 || w.length > 5) return { err: 'Give between 1 and 5 wrong answers.' } as const;
    return { card: cook({ s: (f.s || 'My cards').trim() || 'My cards', q: f.q.trim(), c: f.c.trim(), w, p: f.p ? 1 : undefined }) } as const;
  }
  /** Add one personal card. It is only on this device, and shows up inside whichever set you choose. */
  myAddCard(f: { s: string; q: string; c: string; w: string[]; p?: boolean }): string | null {
    const r = this.myClean(f); if ('err' in r) return r.err;
    const id = 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.MY.cards.push({ ...r.card, id });
    this.myAfter(this.phase === 'done' || !this.cur); return null;
  }
  /** Edit any card for yourself only: personal cards change in place, shared cards get a private override. */
  myEditCard(id: string, f: { q: string; c: string; w: string[]; p?: boolean }): string | null {
    const r = this.myClean(f); if ('err' in r) return r.err;
    const i = this.MY.cards.findIndex(c => c.id === id);
    if (i >= 0) this.MY.cards[i] = { ...this.MY.cards[i], q: r.card.q, c: r.card.c, w: r.card.w, p: r.card.p };
    else this.MY.edits[id] = { q: r.card.q, c: r.card.c, w: r.card.w, p: r.card.p };
    const isCur = !!this.cur && String(this.cur.id) === String(id); if (isCur) this.forced = id;
    this.myAfter(isCur); return null;
  }
  /** Remove a card for yourself only. Shared cards are hidden (restorable in Settings); personal cards are deleted. */
  myRemoveCard(id: string) {
    const isCur = !!this.cur && String(this.cur.id) === String(id);
    if (this.isMine(id)) this.MY.cards = this.MY.cards.filter(c => c.id !== id); else this.MY.edits[id] = { del: 1 };
    this.myAfter(isCur);
  }
  /** Undo every private edit and removal (personal cards stay). */
  myRestoreOriginals() { this.MY.edits = {}; this.myAfter(false); }
  myRestoreCard(id: string) { delete this.MY.edits[id]; this.myAfter(false); }

  /* ---------- adding cards ---------- */
  async addPack(name: string, text: string, where: string, tags: string): Promise<{ ok: boolean; msg: string }> {
    const mineOnly = !isOwner();   // everyone else adds privately, on this device only
    const parsed = parseRaw(name, text), cooked = parsePack(name, text);
    if (!cooked.cards.length) return { ok: false, msg: name + ': no questions found.' + (cooked.errs.length ? '\n' + cooked.errs.slice(0, 6).join('\n') : '') };
    const seen = new Set(this.Q.map(c => String(c.id)));
    let add = 0, dup = 0; const fresh: Card[] = [];
    cooked.cards.forEach(c => { const k = String(c.id); if (seen.has(k)) dup++; else { seen.add(k); add++; fresh.push(c); } });
    const skip = cooked.errs.length ? `\n${cooked.errs.length} bad line${cooked.errs.length > 1 ? 's' : ''} skipped:\n` + cooked.errs.slice(0, 6).join('\n') + (cooked.errs.length > 6 ? '\n…and ' + (cooked.errs.length - 6) + ' more' : '') : '';
    if (!add) return { ok: true, msg: `${name}: nothing new. All ${dup} questions are already in your library.` + skip };

    // 1. show it straight away
    const known = new Set(this.Q.map(q => q.s));
    this.extra.push(...fresh); this.buildQ();
    const ns = [...new Set(cooked.cards.map(c => c.s))].filter(s => !known.has(s));
    if ((where || tags) && ns.length) {
      const muts: Mut[] = [];
      ns.forEach(s => { if (where) muts.push({ t: 'setPlace', key: s, value: where }); if (tags) muts.push({ t: 'setPlace', key: 'tags:' + s, value: tags }); });
      this.foldOp(muts);
    }
    this.later = {}; this.last = null; this.emit();

    if (mineOnly) {
      const P = this.DATA.packs.slice(); P.push({ name: this.uniqName(name), text, at: Date.now() });
      const old = this.DATA.packs; this.DATA.packs = P;
      const ids = new Set(fresh.map(c => c.id)); this.extra = this.extra.filter(c => !ids.has(c.id));
      if (!this.persistMine()) { this.DATA.packs = old; this.buildQ(); this.emit(); return { ok: false, msg: 'Storage is full. Nothing was added.' }; }
      this.buildQ(); this.emit();
      return { ok: true, msg: `${name}: ${add} new card${add > 1 ? 's' : ''} added for you (saved on this device only).` + skip };
    }
    // 2. save it to the database in the background
    this.cardsBusy++; this.emit();
    try {
      const r = await api<{ added: number; dup: number }>('/api/cards', { name, cards: parsed.cards });
      this.cardsBusy--; this.emit();
      return { ok: true, msg: `${name}: ${r.added} new card${r.added === 1 ? '' : 's'} saved to the shared database${dup + r.dup ? ', ' + (dup + r.dup) + ' already there (skipped)' : ''}. Library now has ${this.Q.length} cards.` + skip };
    } catch (e: any) {
      this.cardsBusy--;
      const ids = new Set(fresh.map(c => c.id));
      this.extra = this.extra.filter(c => !ids.has(c.id));
      const P = this.DATA.packs.slice(); P.push({ name: this.uniqName(name), text, at: Date.now() });
      const old = this.DATA.packs; this.DATA.packs = P;
      if (!this.persistMine()) { this.DATA.packs = old; this.buildQ(); this.emit(); return { ok: false, msg: 'Storage is full. Nothing was added.' }; }
      this.buildQ(); this.emit();
      return { ok: true, msg: `${name}: ${add} new card${add > 1 ? 's' : ''} added on this device only (could not reach the shared database: ${e.message}).` + skip };
    }
  }
  uniqName(name: string) {
    const P = this.DATA.packs; if (!P.some(z => z.name === name)) return name;
    const m = name.match(/^(.*?)(\.[^.]*)?$/)!; let i = 2, n: string;
    do { n = m[1] + ' (' + i + ')' + (m[2] || ''); i++; } while (P.some(z => z.name === n));
    return n;
  }
  removeLocalPack(i: number) {
    const P = this.DATA.packs.slice(); P.splice(i, 1);
    const old = this.DATA.packs; this.DATA.packs = P;
    if (!this.persistMine()) this.DATA.packs = old;
    this.rebuild(); this.later = {}; this.last = null;
  }

  /* ---------- backup, restore, merge ---------- */
  backupJSON() {
    return JSON.stringify({ app: 'flight-recall', v: 6, progress: { S: this.S, PE: this.PE }, packs: this.DATA.packs, titles: this.DATA.titles, notes: this.NOTES, folders: this.LF, my: this.MY, shaky: this.SH, mistakes: this.MIS });
  }
  mergePacks(list?: LocalPack[]) {
    const ALL = this.DATA.packs.slice(), P = this.DATA.packs.slice(); let k = 0;
    (list || []).forEach(p => {
      if (!p || !p.text || ALL.some(z => z.text === p.text)) return;
      const x = { name: this.uniqName(p.name || 'restored.txt'), text: p.text, at: p.at || Date.now() };
      ALL.push(x); P.push(x); k++;
      this.DATA.packs = P.slice();
    });
    if (k) { this.DATA.packs = P; this.persistMine(); }
    this.buildQ();
    return k;
  }
  mergeData(o: any) {
    const S = this.S, np = this.mergePacks(o.packs);
    if (o.titles) for (const [k, v] of Object.entries(o.titles)) if (v && !this.DATA.titles[k]) this.DATA.titles[k] = v as string;
    let n = 0; const p = o.progress;
    if (p && p.S && p.S.cards) {
      for (const [id, c] of Object.entries<any>(p.S.cards)) { const c2 = S.cards[id]; if (!c2 || (c.a || c.reps || 0) >= (c2.a || c2.reps || 0)) { S.cards[id] = c; n++; } }
      for (const [d, v] of Object.entries(p.S.log || {})) if (!S.log[d]) S.log[d] = v;
      S.streak = Math.max(S.streak, p.S.streak || 0); S.best = Math.max(S.best || 0, p.S.best || 0);
      if (p.PE && p.PE.seen) Object.assign(this.PE.seen, p.PE.seen);
      this.persist();
    }
    if (np || o.titles) this.persistMine();
    this.buildQ(); if (!this.validSel(S.sec)) S.sec = 'all';
    this.later = {}; this.last = null; this.emit();
    return (np ? np + ' question bank' + (np > 1 ? 's' : '') + ' added' : 'No new question banks') + (n ? ', ' + n + ' cards of progress merged' : '') + '.';
  }
  restoreBackup(text: string) {
    const o = JSON.parse(text); if (o.app !== 'flight-recall') throw new Error('bad');
    const msg = this.mergeData({ packs: o.packs, titles: o.titles, progress: o.progress });
    if (o.mistakes) { Object.keys(o.mistakes).forEach(k => { if (!this.MIS[k]) this.MIS[k] = o.mistakes[k]; }); try { localStorage.setItem(K_MIS, JSON.stringify(this.MIS)); } catch { /* ignore */ } }
    if (o.shaky) { Object.keys(o.shaky).forEach(k => { this.SH[k] = 1; }); try { localStorage.setItem(K_SH, JSON.stringify(this.SH)); } catch { /* ignore */ } }
    if (o.my) {
      const ids = new Set(this.MY.cards.map(c => c.id));
      (o.my.cards || []).forEach((c: Card) => { if (c && c.id && !ids.has(c.id)) this.MY.cards.push(c); });
      Object.keys(o.my.edits || {}).forEach(k => { if (!this.MY.edits[k]) this.MY.edits[k] = o.my.edits[k]; });
      this.saveMy(); this.rebuild();
    }
    if (o.notes) { Object.keys(o.notes).forEach(k => { if (!this.NOTES[k]) this.NOTES[k] = o.notes[k]; }); this.saveNotes(); }
    if (o.folders) {
      const ids = new Set(this.LF.folders.map(f => f.id));
      (o.folders.folders || []).forEach((f: any) => { if (!ids.has(f.id)) this.LF.folders.push(f); });
      Object.assign(this.LF.place, o.folders.place || {}); this.saveLF(); this.buildTree(); this.emit();
    }
    return msg;
  }
  oldData() {
    try {
      const S0 = jget('flight-recall-v1'), pk = jget('flight-recall-packs-v1');
      if (!S0 && !(pk && pk.length)) return null;
      return { packs: pk || [], progress: S0 ? { S: S0, PE: jget('flight-recall-pe-v1') } : null };
    } catch { return null; }
  }
  resetProgress() {
    const S = this.S; S.cards = {}; S.newToday = 0; S.revToday = 0; S.done = 0; S.ok = 0; S.streak = 0; S.best = 0; S.last = ''; S.log = {};
    this.later = {}; this.last = null; this.U.length = 0; this.save(); this.show();
  }
  restoreDefaults() { this.S.opt = Object.assign({}, DEF); this.S.limit = 20; this.save(); this.emit(); }
  setTitle(k: string, v: string) {
    if (v) this.DATA.titles[k] = v; else delete this.DATA.titles[k];
    this.persistMine(); this.buildTitles(); this.buildTree(); this.emit();
  }
  fnv = fnv;
  steps = steps;
}

let _e: Engine | null = null;
export const engine = () => _e || (_e = new Engine());
