'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Avatar, type Mood } from './Avatar';

export const SHAPES = [
  <svg key="0" viewBox="0 0 24 24"><path d="M12 2 23 21H1z" /></svg>,
  <svg key="1" viewBox="0 0 24 24"><path d="M12 1 23 12 12 23 1 12z" /></svg>,
  <svg key="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" /></svg>,
  <svg key="3" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" /></svg>,
];
export function useTick(ms = 250) { const [, s] = useState(0); useEffect(() => { const t = setInterval(() => s(x => x + 1), ms); return () => clearInterval(t); }, [ms]); }
export function useStore<T extends { subscribe(f: () => void): () => void }>(o: T | null) {
  const [, s] = useState(0); useEffect(() => (o ? o.subscribe(() => s(x => x + 1)) : undefined), [o]);
}
export function Ring({ left, total, size = 64 }: { left: number; total: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, left / total));
  return <div className={'ring' + (f < 0.25 && left > 0 ? ' low' : '')} style={{ width: size, height: size }}><svg viewBox={`0 0 ${size} ${size}`}><circle className="rbg" cx={size / 2} cy={size / 2} r={r} /><circle className="rfg" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - f)} style={f < 0.25 ? { stroke: '#ff5470' } : undefined} /></svg><b style={{ fontSize: size * 0.36 }}>{Math.ceil(left / 1000)}</b></div>;
}
export function Confetti() {
  const c = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#fff', '#fcc419'];
  return <div className="conf" aria-hidden>{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ left: (i * 37) % 100 + '%', background: c[i % c.length], animationDelay: (i % 10) * 0.35 + 's', animationDuration: 2.5 + (i % 5) * 0.5 + 's' }} />)}</div>;
}
export function Leaderboards({ dark = true }: { dark?: boolean }) {
  const [tab, setTab] = useState<'alltime' | 'recent'>('alltime'), [d, setD] = useState<any>(null), [err, setErr] = useState('');
  useEffect(() => { setD(null); setErr(''); fetch('/api/games?view=' + tab, { cache: 'no-store' }).then(r => r.json()).then(j => j.error ? setErr(j.error) : setD(j)).catch(() => setErr('Could not load the leaderboard.')); }, [tab]);
  void dark;
  return (
    <div className="board">
      <div className="gtabs"><button className={tab === 'alltime' ? 'on' : ''} onClick={() => setTab('alltime')}>All-time</button><button className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>Recent games</button></div>
      {err && <p className="note">{err}</p>}
      {!d && !err && <p className="note">Loading…</p>}
      {d?.players && (d.players.length ? d.players.map((p: any, i: number) => <div className="brow" key={p.player_id}><span className="r">{i + 1}</span><Avatar av={p.avatar} size={34} /><span className="n">{p.nickname}</span><span className="d">{p.wins} win{p.wins === 1 ? '' : 's'} · {p.games} game{p.games === 1 ? '' : 's'}</span><span>{p.score.toLocaleString()}</span></div>) : <p className="note">No finished games yet.</p>)}
      {d?.games && (d.games.length ? d.games.map((g: any) => <div className="brow" key={g.id} style={{ flexWrap: 'wrap' }}><span className="n" style={{ flexBasis: '100%' }}>{g.title} <small style={{ opacity: .6 }}>· {new Date(g.ended_at).toLocaleDateString()} · {g.player_count} players</small></span>{g.podium.map((p: any) => <span key={p.player_id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{['🥇', '🥈', '🥉'][p.rank - 1]}<Avatar av={p.avatar} size={26} />{p.nickname} <small>{p.score}</small></span>)}</div>) : <p className="note">No finished games yet.</p>)}
    </div>
  );
}
void useSyncExternalStore;

/** Counts up from 0 to n (used for points) so results feel earned. */
export function CountUp({ n, ms = 800 }: { n: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const f = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [n, ms]);
  return <>{v.toLocaleString()}</>;
}
const SAY: Record<Mood, string[]> = {
  happy: ['Yes!', 'Nailed it!', 'Boom!', 'Easy!', 'Genius!'], angry: ['Argh!', 'So close!', 'Grr!', 'Not again!', 'Next one!'],
  sad: ['Too slow…', 'Time ran out', 'Oh no…'], wow: ['Get ready!', 'Here we go!'], idle: ['']
};
export const sayFor = (m: Mood, i: number) => { const a = SAY[m]; return a[Math.abs(i) % a.length]; };
/** The player's character, peeking up from the bottom of the screen and reacting to how they did. */
export function Dock({ av, mood, say }: { av: string; mood: Mood; say?: string }) {
  return (
    <div className={'dock m-' + mood} aria-hidden>
      <div className="dwrap">
        <div className="dchar" key={mood}><Avatar av={av} size={150} mood={mood} bare /></div>
        {say ? <div className="dsay" key={mood + say}>{say}</div> : null}
        {mood === 'happy' && <div className="dfx">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ ['--a' as any]: i * 45 + 'deg', animationDelay: i * 30 + 'ms' }} />)}</div>}
      </div>
    </div>
  );
}
