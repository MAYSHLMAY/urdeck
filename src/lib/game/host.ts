import { qText, parseImg } from '../cardimg';
import { openChannel, gameChannel, LOBBY, type Chan } from './transport';
import { api } from '../api';
import { sfx, setSound, startMusic, stopMusic } from './sound';
import type { Phase, Player, Score, Settings, Snapshot } from './types';

export interface HostQ { id: string; text: string; img?: string; occ?: string; choices: string[]; correct: number; set: string }
interface Ans { choice: number; ms: number }
interface Tot { t: number; d: number; streak: number; best: number; ok: number; a: number; ms: number[] }
const K = 'fr-host-v1';
const shuffle = <T,>(a: T[]) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Turn flash cards into quiz questions: the right answer plus up to three wrong ones (cards with one wrong answer become true/false-style). */
export function makeQuestions(cards: { id: string; q: string; c: string; w: string[]; s: string }[], S: Settings): HostQ[] {
  return shuffle(cards).slice(0, S.count).map(c => {
    const wrong = shuffle(c.w).slice(0, 3), all = [c.c, ...wrong], order = S.shuffle ? shuffle(all.map((_, i) => i)) : all.map((_, i) => i);
    return { id: c.id, text: qText(c.q), occ: (/<!--occ:([^>]*)-->/.exec(c.q) || [])[1], img: ((): string | undefined => { const i = parseImg(c.q); return i && /^https?:/.test(i.src) ? i.src : undefined; })(), choices: order.map(i => all[i]), correct: order.indexOf(0), set: c.s };
  });
}

/**
 * The host's browser is the game server: it runs the rounds, checks answers, adds up the points and tells everyone what to show.
 * Players only send "I joined" and "I chose option N". Nothing touches the database until the game is over.
 */
export class Host {
  pin: string; hid: string; title: string; S: Settings; qs: HostQ[];
  phase: Phase = 'lobby'; locked = false; paused = false; idx = -1; v = 0; startedAt = 0; saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle'; saveMsg = '';
  players = new Map<string, Player>(); online = new Set<string>(); kicked = new Set<string>();
  used = new Map<string, number>(); dbl = new Set<string>();
  ans = new Map<string, Ans>(); tot = new Map<string, Tot>(); counts: number[] = []; ranks = new Map<string, number>();
  qStart = 0; qEnd = 0; phaseEnd = 0; autoAt = 0; pauseLeft = 0; link: 'connecting' | 'open' | 'closed' = 'connecting';
  history: { text: string; correct: number; counts: number[]; rate: number }[] = [];
  private chan!: Chan; private lobby!: Chan; private timer: any; private subs = new Set<() => void>(); private lastBeat = 0; private dead = false;

  constructor(title: string, S: Settings, qs: HostQ[], pin?: string, hid?: string) {
    this.title = title; this.S = S; this.qs = qs; this.pin = pin || String(Math.floor(100000 + Math.random() * 900000)); this.hid = hid || 'h_' + Math.random().toString(36).slice(2, 10);
  }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private emit() { this.subs.forEach(f => f()); }

  open() {
    setSound(this.S.sound);
    this.chan = openChannel(gameChannel(this.pin), this.hid);
    this.lobby = openChannel(LOBBY, this.hid);
    this.chan.onStatus(s => { this.link = s; if (s === 'open') this.broadcast(); this.emit(); });
    this.chan.onPresence(list => { this.online = new Set(list.map((m: any) => m && m.id).filter(Boolean)); this.emit(); });
    this.chan.on('join', m => this.onJoin(m));
    this.chan.on('answer', m => this.onAnswer(m));
    this.chan.on('power', m => this.onPower(m));
    this.chan.on('leave', m => { if (m && m.id) { this.online.delete(m.id); this.emit(); } });
    this.chan.on('hello', m => { if (m && m.id) this.broadcast(false); });
    this.announce(); this.timer = setInterval(() => this.tick(), 200);
    this.save(); this.emit();
  }
  close() { this.dead = true; clearInterval(this.timer); stopMusic(); try { this.chan?.send('bye', { pin: this.pin }); } catch { /* ignore */ } setTimeout(() => { this.chan?.close(); this.lobby?.close(); }, 300); try { localStorage.removeItem(K); } catch { /* ignore */ } }

  /* ---------- people ---------- */
  private onJoin(m: any) {
    const p: Player | undefined = m && m.p; if (!p || !p.id || typeof p.name !== 'string') return;
    const had = this.players.has(p.id);
    if (this.kicked.has(p.id)) { this.chan.send('deny', { id: p.id, why: 'The host removed you from this game.' }); return; }
    if (!had) {
      if (this.locked) { this.chan.send('deny', { id: p.id, why: 'The host locked this game.' }); return; }
      if (this.phase !== 'lobby' && !this.S.late) { this.chan.send('deny', { id: p.id, why: 'This game has already started.' }); return; }
      if (this.players.size >= 300) { this.chan.send('deny', { id: p.id, why: 'This game is full.' }); return; }
      const names = [...this.players.values()].map(x => x.name.toLowerCase());
      let name = String(p.name).slice(0, 20) || 'Player', n = 2; while (names.includes(name.toLowerCase())) name = String(p.name).slice(0, 17) + ' ' + n++;
      const team = this.S.teams ? this.pickTeam() : undefined;
      this.players.set(p.id, { id: p.id, name, av: String(p.av || '').slice(0, 80), team }); sfx.join();
    } else { const o = this.players.get(p.id)!; o.av = String(p.av || o.av).slice(0, 80); }
    this.online.add(p.id); this.announce(); this.save(); this.broadcast(); this.emit();
  }
  private pickTeam() { const c = new Array(this.S.teams).fill(0); this.players.forEach(p => { if (p.team != null) c[p.team]++; }); return c.indexOf(Math.min(...c)); }
  private onPower(m: any) {
    if (!this.S.power || this.phase !== 'question' || this.paused || !m || m.q !== this.idx || !this.players.has(m.id) || this.ans.has(m.id)) return;
    const q = this.qs[this.idx], u = this.used.get(m.id) || 0;
    if (m.kind === 'half' && !(u & 1) && q.choices.length >= 3) {
      const wrong = q.choices.map((_, i) => i).filter(i => i !== q.correct), hide = shuffle(wrong).slice(0, Math.min(2, wrong.length - 1));
      this.used.set(m.id, u | 1); this.chan.send('half', { id: m.id, q: this.idx, hide }); this.broadcast(false);
    } else if (m.kind === 'dbl' && !(u & 2) && !this.dbl.has(m.id)) { this.used.set(m.id, u | 2); this.dbl.add(m.id); this.chan.send('dbl', { id: m.id, q: this.idx }); this.broadcast(false); }
  }
  private onAnswer(m: any) {
    if (this.phase !== 'question' || this.paused || !m || m.q !== this.idx || !this.players.has(m.id) || this.ans.has(m.id)) return;
    const q = this.qs[this.idx], c = Number(m.choice); if (!Number.isInteger(c) || c < 0 || c >= q.choices.length) return;
    this.ans.set(m.id, { choice: c, ms: Math.max(0, Date.now() - this.qStart) });
    this.emit();
    const need = [...this.players.keys()].filter(id => this.online.has(id));
    if (need.length && need.every(id => this.ans.has(id))) this.qEnd = Math.min(this.qEnd, Date.now() + 700);
  }
  kick(id: string) { if (!this.players.has(id)) return; this.players.delete(id); this.kicked.add(id); this.tot.delete(id); this.chan.send('kick', { id }); this.announce(); this.save(); this.broadcast(); this.emit(); }
  setLocked(b: boolean) { this.locked = b; this.announce(); this.broadcast(); this.emit(); }

  /* ---------- flow ---------- */
  start() {
    if (this.phase !== 'lobby' || !this.players.size || !this.qs.length) return;
    this.startedAt = Date.now(); this.idx = -1; this.tot.clear(); this.history = []; this.ranks.clear();
    this.players.forEach(p => this.tot.set(p.id, { t: 0, d: 0, streak: 0, best: 0, ok: 0, a: 0, ms: [] }));
    this.toCountdown(); if (this.S.sound) startMusic(); sfx.go();
  }
  private toCountdown() { this.phase = 'countdown'; this.phaseEnd = Date.now() + 3000; this.afterChange(); }
  private nextQuestion() {
    this.idx++; if (this.idx >= this.qs.length) { this.toPodium(); return; }
    this.phase = 'question'; this.ans.clear(); this.dbl.clear(); this.qStart = Date.now(); this.qEnd = this.qStart + this.S.secs * 1000; this.counts = []; this.afterChange(); sfx.go();
  }
  private doReveal() {
    const q = this.qs[this.idx]; this.phase = 'reveal';
    this.counts = q.choices.map(() => 0); let right = 0;
    this.players.forEach(p => {
      const t = this.tot.get(p.id) || { t: 0, d: 0, streak: 0, best: 0, ok: 0, a: 0, ms: [] }; this.tot.set(p.id, t);
      const a = this.ans.get(p.id); t.d = 0;
      if (a) { this.counts[a.choice]++; t.a++; t.ms.push(a.ms); }
      if (a && a.choice === q.correct) {
        right++; t.ok++; t.streak++; t.best = Math.max(t.best, t.streak);
        if (this.S.points === 'none') t.d = 1;
        else {
          const frac = Math.min(1, a.ms / (this.S.secs * 1000)); let base = Math.round(1000 * (1 - frac / 2)); if (this.S.points === 'double') base *= 2;
          t.d = base + (this.S.streak && t.streak >= 2 ? Math.min(500, (t.streak - 1) * 100) : 0);
        }
        if (this.dbl.has(p.id) && this.S.points !== 'none') t.d *= 2;
        t.t += t.d;
      } else t.streak = 0;
    });
    this.history.push({ text: q.text, correct: q.correct, counts: this.counts.slice(), rate: this.players.size ? right / this.players.size : 0 });
    this.rank(); this.autoAt = Date.now() + 6000; this.afterChange(); stopMusic();
    const mine = [...this.players.keys()].length; if (mine) (right ? sfx.right : sfx.wrong)();
  }
  private rank() {
    const arr = [...this.players.values()].map(p => ({ id: p.id, t: this.tot.get(p.id)! })).filter(x => x.t);
    arr.sort((a, b) => b.t.t - a.t.t || b.t.ok - a.t.ok || avg(a.t.ms) - avg(b.t.ms));
    arr.forEach((x, i) => this.ranks.set(x.id, i + 1));
  }
  next() {
    if (this.paused) return;
    if (this.phase === 'reveal') { if (this.idx >= this.qs.length - 1) this.toPodium(); else { this.phase = 'board'; this.autoAt = Date.now() + 6000; this.afterChange(); } }
    else if (this.phase === 'board') { this.toCountdown(); if (this.S.sound) startMusic(); }
    else if (this.phase === 'question') this.qEnd = 0;
    else if (this.phase === 'countdown') this.phaseEnd = 0;
  }
  skip() { if (this.phase === 'question') this.qEnd = 0; else this.next(); }
  pause() {
    if (this.paused || (this.phase !== 'question' && this.phase !== 'countdown')) return;
    this.paused = true; this.pauseLeft = this.phase === 'question' ? this.qEnd - Date.now() : this.phaseEnd - Date.now(); this.afterChange();
  }
  resume() {
    if (!this.paused) return; this.paused = false;
    if (this.phase === 'question') { this.qEnd = Date.now() + this.pauseLeft; this.qStart = this.qEnd - this.S.secs * 1000; } else this.phaseEnd = Date.now() + this.pauseLeft;
    this.afterChange();
  }
  addTime(sec: number) { if (this.phase === 'question') { this.qEnd += sec * 1000; this.qStart += 0; this.broadcast(); this.emit(); } }
  end() { if (this.phase !== 'lobby') this.toPodium(); }
  private toPodium() {
    this.phase = 'podium'; this.paused = false; this.rank(); this.afterChange(); stopMusic(); sfx.fanfare(); this.finish();
  }
  /** Play again with the same people. */
  again(qs: HostQ[]) {
    this.qs = qs; this.phase = 'lobby'; this.idx = -1; this.tot.clear(); this.ranks.clear(); this.ans.clear(); this.used.clear(); this.dbl.clear(); this.history = []; this.saveState = 'idle'; this.saveMsg = ''; this.paused = false;
    this.afterChange();
  }
  private tick() {
    if (this.dead) return; const now = Date.now();
    if (!this.paused) {
      if (this.phase === 'countdown' && now >= this.phaseEnd) this.nextQuestion();
      else if (this.phase === 'question' && now >= this.qEnd) this.doReveal();
      else if (this.S.auto && (this.phase === 'reveal' || this.phase === 'board') && now >= this.autoAt) this.next();
    }
    if (now - this.lastBeat > 4000) { this.broadcast(false); }
    if (this.phase === 'question' || this.phase === 'countdown') this.emit();
  }
  private afterChange() { this.announce(); this.save(); this.broadcast(); this.emit(); }

  /* ---------- talking to the players ---------- */
  snapshot(): Snapshot {
    const q = this.qs[this.idx], now = Date.now();
    const scores: Record<string, Score> = {};
    if (this.phase === 'reveal' || this.phase === 'board' || this.phase === 'podium') this.players.forEach(p => { const t = this.tot.get(p.id); if (t) scores[p.id] = { t: t.t, d: t.d, r: this.ranks.get(p.id) || 0, s: t.streak, ok: t.ok, a: t.a }; });
    const s: Snapshot = {
      v: ++this.v, pin: this.pin, hid: this.hid, title: this.title, phase: this.phase, settings: this.S, locked: this.locked, paused: this.paused,
      players: [...this.players.values()], idx: this.idx, total: this.qs.length, answered: this.ans.size, scores, pu: this.S.power ? this.puMap() : undefined,
    };
    if (q && this.phase === 'question') s.q = { text: this.S.showQ ? q.text : '', img: this.S.showQ ? q.img : undefined, occ: this.S.showQ ? q.occ : undefined, choices: q.choices, secs: this.S.secs, remaining: this.paused ? this.pauseLeft : Math.max(0, this.qEnd - now) };
    if (q && this.phase === 'countdown') s.q = { text: '', choices: [], secs: 0, remaining: this.paused ? this.pauseLeft : Math.max(0, this.phaseEnd - now) };
    if (q && (this.phase === 'reveal' || this.phase === 'board')) s.reveal = { correct: q.correct, counts: this.counts, choices: q.choices };
    if (this.S.teams) s.teamScores = this.teamScores();
    return s;
  }
  teamScores(): number[] {
    const sum = new Array(this.S.teams).fill(0), n = new Array(this.S.teams).fill(0);
    this.players.forEach(p => { if (p.team != null) { n[p.team]++; sum[p.team] += this.tot.get(p.id)?.t || 0; } });
    return sum.map((v, i) => (n[i] ? Math.round(v / n[i]) : 0));
  }
  puMap() { const o: Record<string, number> = {}; this.used.forEach((v, k) => { o[k] = v; }); return o; }
  private broadcast(count = true) { this.lastBeat = Date.now(); if (this.chan) this.chan.send('snap', this.snapshot()); void count; }
  private announce() {
    if (!this.lobby) return;
    this.lobby.track({ pin: this.pin, hid: this.hid, title: this.title, n: this.players.size, phase: this.phase, locked: this.locked, late: this.S.late });
  }

  /* ---------- results ---------- */
  rows() {
    return [...this.players.values()].map(p => { const t = this.tot.get(p.id) || { t: 0, ok: 0, a: 0, best: 0, ms: [] as number[], d: 0, streak: 0 }; return { id: p.id, name: p.name, av: p.av, team: p.team, score: t.t, correct: t.ok, answered: t.a, bestStreak: t.best, avgMs: t.ms.length ? Math.round(avg(t.ms)) : null, rank: this.ranks.get(p.id) || 0 }; })
      .sort((a, b) => a.rank - b.rank);
  }
  async finish() {
    if (this.saveState === 'saving' || this.saveState === 'saved') return;
    const rows = this.rows(); if (!rows.length || !this.startedAt) return;
    this.saveState = 'saving'; this.emit();
    try {
      await api('/api/games', { pin: this.pin, title: this.title, startedAt: this.startedAt, questions: this.qs.length, mode: this.S.teams ? 'teams' : 'solo', settings: this.S, players: rows });
      this.saveState = 'saved'; this.saveMsg = 'Saved to the leaderboard.';
    } catch (e: any) { this.saveState = 'error'; this.saveMsg = e?.message || 'Could not save the results.'; }
    this.emit();
  }
  csv() {
    const esc = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    return ['Rank,Name,Score,Correct,Answered,Best streak,Avg answer (s)'].concat(this.rows().map(r => [r.rank, esc(r.name), r.score, r.correct, r.answered, r.bestStreak, r.avgMs == null ? '' : (r.avgMs / 1000).toFixed(1)].join(','))).join('\n');
  }

  /* ---------- survive a refresh of the host's page ---------- */
  private save() {
    try {
      localStorage.setItem(K, JSON.stringify({ pin: this.pin, hid: this.hid, title: this.title, S: this.S, qs: this.qs, phase: this.phase, locked: this.locked, idx: this.idx, startedAt: this.startedAt,
        players: [...this.players.values()], kicked: [...this.kicked], tot: [...this.tot.entries()], ans: [...this.ans.entries()], qStart: this.qStart, qEnd: this.qEnd, counts: this.counts, history: this.history, saved: this.saveState }));
    } catch { /* ignore */ }
  }
  static restore(): Host | null {
    try {
      const j = JSON.parse(localStorage.getItem(K) || 'null'); if (!j || !j.pin) return null;
      const h = new Host(j.title, j.S, j.qs, j.pin, j.hid);
      h.phase = j.phase; h.locked = j.locked; h.idx = j.idx; h.startedAt = j.startedAt; h.kicked = new Set(j.kicked || []); h.counts = j.counts || []; h.history = j.history || []; h.saveState = j.saved === 'saved' ? 'saved' : 'idle';
      (j.players || []).forEach((p: Player) => h.players.set(p.id, p)); (j.tot || []).forEach(([k, v]: any) => h.tot.set(k, v)); (j.ans || []).forEach(([k, v]: any) => h.ans.set(k, v));
      h.qStart = j.qStart; h.qEnd = Math.max(j.qEnd, Date.now() + 1500); h.phaseEnd = Date.now() + 2000; h.rank();
      return h;
    } catch { return null; }
  }
  static hasSaved(): { pin: string; title: string; phase: string } | null { try { const j = JSON.parse(localStorage.getItem(K) || 'null'); return j && j.pin ? { pin: j.pin, title: j.title, phase: j.phase } : null; } catch { return null; } }
  static clearSaved() { try { localStorage.removeItem(K); } catch { /* ignore */ } }
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 1e9);
