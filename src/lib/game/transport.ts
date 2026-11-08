/*
 * Live connection between devices WITHOUT a database: Supabase Realtime "broadcast" (messages) and "presence" (who is online).
 * Nothing sent here is stored anywhere. For trying it out on one device, or when Supabase is not configured, a BroadcastChannel
 * (same browser, other tabs) is used instead with the same interface: add ?t=local to the address.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Chan {
  send(ev: string, payload: any): void;
  on(ev: string, cb: (p: any) => void): void;
  track(meta: any): void;
  onPresence(cb: (list: any[]) => void): void;
  onStatus(cb: (s: 'open' | 'closed') => void): void;
  close(): void;
}

let client: SupabaseClient | null = null;
function rt() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured.');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 30 } } });
  return client;
}
export function useLocalTransport(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('t');
    if (q === 'local') sessionStorage.setItem('fr-game-t', 'local'); else if (q === 'live') sessionStorage.removeItem('fr-game-t');
    if (sessionStorage.getItem('fr-game-t') === 'local') return true;
  } catch { /* ignore */ }
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

class SupaChan implements Chan {
  private ch: any; private ev = new Map<string, ((p: any) => void)[]>(); private pres: ((l: any[]) => void)[] = []; private st: ((s: 'open' | 'closed') => void)[] = [];
  private meta: any = null; private ready = false; private queue: [string, any][] = [];
  constructor(name: string, key: string) {
    this.ch = rt().channel(name, { config: { broadcast: { self: false, ack: false }, presence: { key } } });
    this.ch.on('broadcast', { event: '*' }, (m: any) => { (this.ev.get(m.event) || []).forEach(f => f(m.payload)); });
    this.ch.on('presence', { event: 'sync' }, () => { const l = Object.values(this.ch.presenceState()).flat() as any[]; this.pres.forEach(f => f(l)); });
    this.ch.subscribe((s: string) => {
      if (s === 'SUBSCRIBED') { this.ready = true; if (this.meta) this.ch.track(this.meta); this.queue.splice(0).forEach(([e, p]) => this.send(e, p)); this.st.forEach(f => f('open')); }
      else if (s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { this.ready = false; this.st.forEach(f => f('closed')); }
    });
  }
  send(ev: string, payload: any) { if (!this.ready) { this.queue.push([ev, payload]); return; } this.ch.send({ type: 'broadcast', event: ev, payload }); }
  on(ev: string, cb: (p: any) => void) { this.ev.set(ev, [...(this.ev.get(ev) || []), cb]); }
  track(meta: any) { this.meta = meta; if (this.ready) this.ch.track(meta); }
  onPresence(cb: (l: any[]) => void) { this.pres.push(cb); }
  onStatus(cb: (s: 'open' | 'closed') => void) { this.st.push(cb); if (this.ready) cb('open'); }
  close() { try { this.ch.untrack?.(); rt().removeChannel(this.ch); } catch { /* ignore */ } }
}

class LocalChan implements Chan {
  private bc: BroadcastChannel; private ev = new Map<string, ((p: any) => void)[]>(); private pres: ((l: any[]) => void)[] = []; private st: ((s: 'open' | 'closed') => void)[] = [];
  private seen = new Map<string, { meta: any; at: number }>(); private meta: any = null; private hb: any;
  constructor(name: string, private key: string) {
    this.bc = new BroadcastChannel('fr:' + name);
    this.bc.onmessage = e => {
      const m = e.data; if (!m || m.from === this.key) return;
      if (m.k === 'ev') (this.ev.get(m.ev) || []).forEach(f => f(m.p));
      else if (m.k === 'pres') { this.seen.set(m.from, { meta: m.meta, at: Date.now() }); this.emitPres(); }
      else if (m.k === 'bye') { this.seen.delete(m.from); this.emitPres(); }
    };
    this.hb = setInterval(() => { if (this.meta) this.bc.postMessage({ k: 'pres', from: this.key, meta: this.meta }); this.prune(); }, 1000);
    setTimeout(() => this.st.forEach(f => f('open')), 0);
  }
  private prune() { let ch = false; this.seen.forEach((v, k) => { if (Date.now() - v.at > 3500) { this.seen.delete(k); ch = true; } }); if (ch) this.emitPres(); }
  private emitPres() { const l = [...this.seen.values()].map(v => v.meta); if (this.meta) l.push(this.meta); this.pres.forEach(f => f(l)); }
  send(ev: string, p: any) { this.bc.postMessage({ k: 'ev', from: this.key, ev, p }); }
  on(ev: string, cb: (p: any) => void) { this.ev.set(ev, [...(this.ev.get(ev) || []), cb]); }
  track(meta: any) { this.meta = meta; this.bc.postMessage({ k: 'pres', from: this.key, meta }); this.emitPres(); }
  onPresence(cb: (l: any[]) => void) { this.pres.push(cb); }
  onStatus(cb: (s: 'open' | 'closed') => void) { this.st.push(cb); setTimeout(() => cb('open'), 0); }
  close() { clearInterval(this.hb); this.bc.postMessage({ k: 'bye', from: this.key }); this.bc.close(); }
}

export function openChannel(name: string, key: string): Chan { return useLocalTransport() ? new LocalChan(name, key) : new SupaChan(name, key); }
export const LOBBY = 'fr-lobby';
export const gameChannel = (pin: string) => 'fr-game-' + pin;
