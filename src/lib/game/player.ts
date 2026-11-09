import { openChannel, gameChannel, LOBBY, type Chan } from './transport';
import { setSound, sfx } from './sound';
import type { Player, Snapshot } from './types';

export type Status = 'joining' | 'in' | 'denied' | 'kicked' | 'lost' | 'ended';

/** A player's side of a live game: join, receive what to show, and send the chosen option. Nothing is stored anywhere. */
export class PlayerClient {
  snap: Snapshot | null = null; status: Status = 'joining'; why = ''; link: 'connecting' | 'open' | 'closed' = 'connecting';
  myAnswer: number | null = null; myAnswerIdx = -1; recvAt = 0; lastResult: 'right' | 'wrong' | 'none' | null = null; lastIdx = -1;
  hidden: number[] = []; dblOn = false;
  private chan!: Chan; private subs = new Set<() => void>(); private t: any; private tries = 0; private joined = 0;
  constructor(public pin: string, public me: Player) {}
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private emit() { this.subs.forEach(f => f()); }
  open() {
    this.chan = openChannel(gameChannel(this.pin), this.me.id);
    this.chan.track({ id: this.me.id });
    this.chan.onStatus(s => { this.link = s; if (s === 'open') this.join(); this.emit(); });
    this.chan.on('snap', (s: Snapshot) => this.onSnap(s));
    this.chan.on('half', m => { if (m && m.id === this.me.id && this.snap && m.q === this.snap.idx) { this.hidden = m.hide || []; this.emit(); } });
    this.chan.on('dbl', m => { if (m && m.id === this.me.id && this.snap && m.q === this.snap.idx) { this.dblOn = true; this.emit(); } });
    this.chan.on('deny', m => { if (m && m.id === this.me.id) { this.status = 'denied'; this.why = m.why || 'You cannot join this game.'; this.emit(); } });
    this.chan.on('kick', m => { if (m && m.id === this.me.id) { this.status = 'kicked'; this.emit(); } });
    this.chan.on('bye', () => { this.status = 'ended'; this.emit(); });
    this.t = setInterval(() => {
      if (this.status === 'joining' || this.status === 'lost') { if (++this.tries > 7 && !this.snap) { this.status = 'lost'; this.why = 'No game with that PIN was found.'; } this.join(); }
      else if (this.snap && Date.now() - this.recvAt > 9000 && this.status === 'in') { this.chan.send('hello', { id: this.me.id }); }
      this.emit();
    }, 1500);
  }
  join() { if (this.status === 'denied' || this.status === 'kicked') return; this.chan.send('join', { p: this.me, pin: this.pin }); this.joined = Date.now(); }
  private onSnap(s: Snapshot) {
    if (!s || s.pin !== this.pin || (this.snap && s.hid !== this.snap.hid) || (this.snap && s.v < this.snap.v - 3 && s.phase === this.snap.phase)) return;
    const prev = this.snap; this.snap = s; this.recvAt = Date.now(); setSound(s.settings.sound);
    if (this.status === 'joining' || this.status === 'lost') this.status = 'in';
    if (!s.players.some(p => p.id === this.me.id)) { if (this.status === 'in' && Date.now() - this.joined > 3000) this.join(); }
    if (!prev || prev.idx !== s.idx || s.phase === 'lobby') { if (!prev || prev.idx !== s.idx) this.myAnswer = null; this.myAnswerIdx = s.idx; }
    if (s.phase === 'reveal' && (!prev || prev.phase !== 'reveal') && s.reveal) {
      const me = s.scores[this.me.id], right = this.myAnswer === s.reveal.correct;
      this.lastResult = this.myAnswer == null ? 'none' : right ? 'right' : 'wrong'; this.lastIdx = s.idx; void me;
      if (right) sfx.right(); else sfx.wrong();
    }
    if (s.phase === 'podium' && (!prev || prev.phase !== 'podium')) sfx.fanfare();
    if (s.phase === 'question' && (!prev || prev.phase !== 'question' || prev.idx !== s.idx)) { this.hidden = []; this.dblOn = false; }
    if (s.phase === 'question' && (!prev || prev.phase !== 'question')) sfx.go();
    if (s.phase === 'lobby' && prev && prev.phase !== 'lobby') this.myAnswer = null;
    this.emit();
  }
  answer(choice: number) {
    const s = this.snap; if (!s || s.phase !== 'question' || this.myAnswer != null || s.paused) return;
    this.myAnswer = choice; this.chan.send('answer', { id: this.me.id, q: s.idx, choice }); this.emit();
  }
  usePower(kind: 'half' | 'dbl') { const s = this.snap; if (!s || s.phase !== 'question' || this.myAnswer != null || s.paused) return; this.chan.send('power', { id: this.me.id, q: s.idx, kind }); }
  /** milliseconds left of the current question on this device */
  left(): number { const s = this.snap; if (!s || !s.q) return 0; if (s.paused) return s.q.remaining; return Math.max(0, s.q.remaining - (Date.now() - this.recvAt)); }
  leave() { try { this.chan.send('leave', { id: this.me.id }); } catch { /* ignore */ } clearInterval(this.t); setTimeout(() => this.chan.close(), 200); }
  updateMe(p: Player) { this.me = p; this.join(); }
}

/** Watches the shared lobby channel so any visitor can see (and join) the games that are open right now. */
export function watchLobby(cb: (games: any[]) => void): () => void {
  const key = 'v_' + Math.random().toString(36).slice(2, 9), ch = openChannel(LOBBY, key);
  ch.onPresence(list => cb(list.filter((m: any) => m && m.pin && !m.locked)));
  ch.track({ viewer: true });
  return () => ch.close();
}
