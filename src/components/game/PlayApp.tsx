'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar, AvatarPicker, randomKid, type Mood } from './Avatar';
import { SHAPES, Confetti, CountUp, Dock, Leaderboards, Ring, sayFor, useStore, useTick } from './shared';
import { loadIdentity, saveIdentity, recoveryCode, importCode, type Identity } from '@/lib/game/identity';
import { randomName, cleanName, badName } from '@/lib/game/names';
import { PlayerClient, watchLobby } from '@/lib/game/player';
import { TEAM_COLORS, TEAM_NAMES } from '@/lib/game/types';

type View = 'home' | 'edit' | 'board' | 'game';

export default function PlayApp() {
  const [me, setMe] = useState<Identity | null | undefined>(undefined);
  const [view, setView] = useState<View>('home');
  const [pin, setPin] = useState('');
  const [auto, setAuto] = useState('');
  useEffect(() => {
    loadIdentity().then(i => setMe(i));
    const q = new URLSearchParams(location.search).get('pin'); if (q) setAuto(q.replace(/\D/g, '').slice(0, 6));
  }, []);
  if (me === undefined) return <div className="gm"><div className="gwrap"><p>Loading…</p></div></div>;
  if (me === null || view === 'edit') return <Profile me={me} first={me === null} onDone={i => { setMe(i); setView(auto ? 'game' : 'home'); if (auto) setPin(auto); }} onCancel={() => setView('home')} />;
  if (view === 'game' && pin) return <Game me={me} pin={pin} onExit={() => { setPin(''); setAuto(''); setView('home'); history.replaceState(null, '', '/play'); }} onEdit={() => setView('edit')} />;
  if (view === 'board') return <div className="gm"><div className="gtop"><button className="gbtn sm ghost" onClick={() => setView('home')}>← Back</button><b>Leaderboard</b></div><div className="gwrap start"><Leaderboards /></div></div>;
  return <Home me={me} auto={auto} go={p => { setPin(p); setView('game'); }} setView={setView} />;
}

function Profile({ me, first, onDone, onCancel }: { me: Identity | null; first: boolean; onDone: (i: Identity) => void; onCancel: () => void }) {
  const [name, setName] = useState(me?.name || randomName()), [av, setAv] = useState(me?.av || randomKid()), [err, setErr] = useState(''), [code, setCode] = useState(''), [show, setShow] = useState(false);
  const save = () => {
    const n = cleanName(name); if (n.length < 2) return setErr('Pick a nickname with at least 2 letters.'); if (badName(n)) return setErr('Please choose a friendlier nickname.');
    onDone(saveIdentity({ id: me?.id, name: n, av }));
  };
  const imp = () => { const i = importCode(code); if (!i) return setErr('That recovery code is not valid.'); onDone(i); };
  return (
    <div className="gm"><div className="gwrap start">
      <h1 className="gtitle">{first ? 'Create your player' : 'Your player'}</h1>
      <div className="gcard">
        <AvatarPicker value={av} onChange={setAv} />
        <label>Nickname<div style={{ display: 'flex', gap: 6 }}><input value={name} maxLength={20} onChange={e => { setName(e.target.value); setErr(''); }} /><button type="button" className="gbtn ghost sm" onClick={() => setName(randomName())}>🎲</button></div></label>
        {err && <p className="err">{err}</p>}
        <button className="gbtn go" onClick={save}>{first ? "Let's play" : 'Save'}</button>
        {!first && <button className="gbtn ghost" onClick={onCancel}>Cancel</button>}
        <p className="note">Your player is saved deeply in this browser (three places) and cannot be removed by clearing one of them.</p>
        {me && <><button className="gbtn ghost sm" onClick={() => setShow(s => !s)}>Recovery code</button>{show && <><textarea readOnly rows={3} value={recoveryCode(me)} onFocus={e => e.currentTarget.select()} /><p className="note">Keep this code. Paste it on another device to be the same player.</p></>}</>}
        {first && <details><summary>Already a player? Use a recovery code</summary><textarea rows={3} value={code} onChange={e => setCode(e.target.value)} /><button className="gbtn ghost sm" onClick={imp}>Restore</button></details>}
      </div>
    </div></div>
  );
}

function Home({ me, auto, go, setView }: { me: Identity; auto: string; go: (p: string) => void; setView: (v: View) => void }) {
  const [pin, setPin] = useState(auto), [games, setGames] = useState<any[]>([]), [top, setTop] = useState<any[]>([]);
  useEffect(() => { if (auto.length === 6) go(auto); }, [auto]); // eslint-disable-line
  useEffect(() => watchLobby(g => setGames(g)), []);
  useEffect(() => { fetch('/api/games?view=alltime', { cache: 'no-store' }).then(r => r.json()).then(j => setTop((j.players || []).slice(0, 3))).catch(() => {}); }, []);
  return (
    <div className="gm"><div className="gtop"><Link href="/" className="gbtn sm ghost">← Home</Link><b>Live quiz</b><button className="me-chip sm" onClick={() => setView('edit')} aria-label="Edit your player"><Avatar av={me.av} size={30} /><b>{me.name}</b></button></div>
      <div className="gwrap start">
        <div className="phero stg" style={{ ['--i' as any]: 0 }}><div className="herochar"><Avatar av={me.av} size={128} bare /></div><p className="kick">Hi, {me.name}</p><h1 className="gtitle">Join a live quiz</h1><p className="note">Enter the 6-digit PIN shown on the host's screen.</p></div>
        <div className="gcard pincard stg" style={{ ['--i' as any]: 1 }}>
          <input className="pinin" inputMode="numeric" placeholder="······" aria-label="Game PIN" value={pin} maxLength={6} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && pin.length === 6 && go(pin)} />
          <button className="gbtn go xl" disabled={pin.length !== 6} onClick={() => go(pin)}>Join game</button>
        </div>
        {games.length > 0 && <div className="live stg" style={{ ['--i' as any]: 2 }}><b>Open games right now</b>{games.map((g: any) => <button key={g.pin} onClick={() => go(g.pin)}>{g.title}<span>{g.phase === 'lobby' ? `${g.n} waiting` : g.late ? 'in progress · join late' : 'in progress'}</span></button>)}</div>}
        <div className="steps3 stg" style={{ ['--i' as any]: 3 }}><div><i>1</i><b>Enter the PIN</b><span>Or scan the QR code on the screen.</span></div><div><i>2</i><b>Pick your look</b><span>A nickname and a character.</span></div><div><i>3</i><b>Answer fast</b><span>Quicker correct answers score more.</span></div></div>
        {top.length > 0 && <div className="topthree"><h3>All-time top players</h3><div className="board">{top.map((p: any, i: number) => <div className="brow" key={p.player_id}><span className="r">{i + 1}</span><Avatar av={p.avatar} size={34} /><span className="n">{p.nickname}</span><span>{p.score.toLocaleString()}</span></div>)}</div></div>}
        <button className="gbtn ghost" onClick={() => setView('board')}>🏆 Full leaderboard</button>
      </div></div>
  );
}

function Game({ me, pin, onExit, onEdit }: { me: Identity; pin: string; onExit: () => void; onEdit: () => void }) {
  const [c, setC] = useState<PlayerClient | null>(null);
  useEffect(() => { const p = new PlayerClient(pin, { id: me.id, name: me.name, av: me.av }); p.open(); setC(p); return () => p.leave(); }, [pin]); // eslint-disable-line
  useStore(c); useTick(250);
  if (!c) return null;
  const s = c.snap, me2 = s?.players.find(p => p.id === me.id), sc = s?.scores[me.id];
  const Top = <div className="gtop"><button className="gbtn sm ghost" onClick={onExit}>Leave</button><b>{me.name}</b>{sc && <span className="gpill">{sc.t}</span>}<Avatar av={me.av} size={32} /></div>;
  if (c.status === 'denied') return <Shell top={Top}><h2>Cannot join</h2><p>{c.why}</p><button className="gbtn" onClick={onExit}>Back</button></Shell>;
  if (c.status === 'kicked') return <Shell top={Top}><h2>You were removed</h2><p>The host removed you from this game.</p><button className="gbtn" onClick={onExit}>Back</button></Shell>;
  if (c.status === 'ended') return <Shell top={Top}><h2>Game closed</h2><p>The host closed this game.</p><button className="gbtn" onClick={onExit}>Back</button></Shell>;
  if (c.status === 'lost') return <Shell top={Top}><h2>Looking for the game…</h2><p>{c.why} Check the PIN, or wait – we keep trying.</p><button className="gbtn" onClick={onExit}>Back</button></Shell>;
  if (!s) return <Shell top={Top}><h2>Joining…</h2><p className="note">{c.link === 'open' ? 'Waiting for the host' : 'Connecting…'}</p></Shell>;
  const teamCol = me2?.team != null ? TEAM_COLORS[me2.team] : undefined;
  const r = c.lastResult, rank = sc?.r || 0;
  const mood: Mood = s.phase === 'countdown' ? 'wow' : (s.phase === 'reveal' || s.phase === 'board') ? (r === 'right' ? 'happy' : r === 'wrong' ? 'angry' : 'sad') : s.phase === 'podium' ? (rank > 0 && rank <= 3 ? 'happy' : 'idle') : 'idle';
  const say = s.phase === 'lobby' ? 'Ready!' : (s.phase === 'reveal') ? sayFor(mood, s.idx) : s.phase === 'podium' ? (rank === 1 ? 'Champion!' : rank <= 3 ? 'Podium!' : 'GG!') : s.phase === 'countdown' ? sayFor('wow', s.idx) : '';
  const dock = <Dock av={me.av} mood={mood} say={say} />;
  if (s.paused) return <Shell top={Top} dock={dock}><h2>Paused</h2><p>The host paused the game.</p></Shell>;
  if (s.phase === 'lobby') return (
    <Shell top={Top} dock={dock} top0>
      <div className="stg" style={{ ['--i' as any]: 0 }}><h1 className="gtitle">You're in!</h1><p className="note">{s.players.length} player{s.players.length === 1 ? '' : 's'} in “{s.title}”. Waiting for the host to start…</p></div>
      {me2?.team != null && <b className="stg" style={{ background: teamCol, color: '#fff', padding: '4px 14px', borderRadius: 99, ['--i' as any]: 1 }}>Team {TEAM_NAMES[me2.team]}</b>}
      <div className="lobbyfaces">{s.players.map((p, i) => <span key={p.id} className={'lf' + (p.id === me.id ? ' me' : '')} style={{ ['--i' as any]: Math.min(i, 14) + 2 }}><Avatar av={p.av} size={56} ring={p.id === me.id ? 'var(--acc)' : undefined} /><small>{p.name}</small></span>)}</div>
      <button className="gbtn ghost sm" onClick={onEdit}>Change look</button>
    </Shell>);
  if (s.phase === 'countdown') return <Shell top={Top} dock={dock}><p className="note">Question {s.idx + 2 > s.total ? s.total : s.idx + 2} of {s.total}</p><div className="cd" key={Math.ceil(c.left() / 1000)}>{Math.max(1, Math.ceil(c.left() / 1000))}</div></Shell>;
  if (s.phase === 'question' && s.q) {
    const left = c.left(), done = c.myAnswer != null;
    return <div className="gm">{Top}<div className="pq">
      <div className="qstat stg" style={{ ['--i' as any]: 0 }}><span className="qn">{s.idx + 1}<small>/{s.total}</small></span><span className="dots">{Array.from({ length: Math.min(s.total, 20) }, (_, i) => <i key={i} className={i < s.idx ? 'd' : i === s.idx ? 'n' : ''} />)}</span><Ring left={left} total={s.q.secs * 1000} size={56} /></div>
      {s.q.text && <div className="qcard stg" style={{ ['--i' as any]: 1 }}>{s.q.text}</div>}
      {done ? <div className="sent stg"><div className="spin" /><b>Answer locked in</b><span>Waiting for the others…</span></div>
        : <div className={'ans full' + (s.q.choices.length < 3 ? ' one' : '')}>{s.q.choices.map((t, i) => <button key={i} className={'abtn c' + i} style={{ ['--i' as any]: i }} onClick={() => c.answer(i)}>{SHAPES[i % 4]}<span>{s.q!.text ? t : ''}</span></button>)}</div>}
    </div>{dock}</div>;
  }
  if (s.phase === 'reveal' || s.phase === 'board') {
    const right = r === 'right';
    return <Shell top={Top} dock={dock}>
      {s.phase === 'reveal' ? <div className={'fb stg ' + (r || 'none')} style={{ ['--i' as any]: 0 }}><div className="ficon">{right ? '✓' : r === 'wrong' ? '✕' : '⏱'}</div><b>{right ? 'Correct!' : r === 'wrong' ? 'Not this time' : "Time's up"}</b>{right && sc && <span className="pts">+<CountUp n={sc.d} /> points{sc.s >= 2 ? ` · 🔥 ${sc.s} in a row` : ''}</span>}{r !== 'right' && s.reveal && <span>Answer: {s.reveal.choices?.[s.reveal.correct] ?? ''}</span>}</div> : null}
      {sc && <div className="rankbig stg" style={{ ['--i' as any]: 2 }}>#{sc.r} <small style={{ fontSize: '1rem' }}>· <CountUp n={sc.t} /> pts</small></div>}
      <MiniBoard s={s} me={me.id} />
    </Shell>;
  }
  if (s.phase === 'podium') {
    return <Shell top={Top} dock={dock}>{rank === 1 && <Confetti />}<h1 className="gtitle stg" style={{ ['--i' as any]: 0 }}>{rank === 1 ? 'You won!' : rank <= 3 ? 'On the podium!' : 'Game over'}</h1><div className="rankbig stg" style={{ ['--i' as any]: 1 }}>#{rank} · <CountUp n={sc?.t ?? 0} /> points</div><p className="stg" style={{ ['--i' as any]: 2 }}>{sc?.ok ?? 0} of {s.total} correct</p><MiniBoard s={s} me={me.id} /><Link className="gbtn ghost" href="/play" onClick={onExit}>Done</Link></Shell>;
  }
  return <Shell top={Top} dock={dock}><p>…</p></Shell>;
}

function Shell({ top, children, dock, top0 }: { top: any; children: any; dock?: any; top0?: boolean }) { return <div className="gm">{top}<div className={'gwrap' + (top0 ? ' start' : '') + (dock ? ' hasdock' : '')}>{children}</div>{dock}</div>; }

function MiniBoard({ s, me }: { s: NonNullable<PlayerClient['snap']>; me: string }) {
  const rows = s.players.map(p => ({ p, sc: s.scores[p.id] })).filter(x => x.sc).sort((a, b) => a.sc.r - b.sc.r);
  const top = rows.slice(0, 5), mine = rows.find(x => x.p.id === me);
  const show = mine && !top.includes(mine) ? [...top, mine] : top;
  return <div className="board">{s.teamScores && <div className="ctl">{s.teamScores.map((t, i) => <span key={i} className="gpill" style={{ background: TEAM_COLORS[i], color: '#fff', padding: '4px 12px', borderRadius: 99 }}>{TEAM_NAMES[i]} {t}</span>)}</div>}
    {show.map((x, i) => <div key={x.p.id} className={'brow' + (x.p.id === me ? ' me' : '')}><span className="r">{x.sc.r}</span><Avatar av={x.p.av} size={32} /><span className="n">{x.p.name}</span>{x.sc.d > 0 && <span className="d">+{x.sc.d}</span>}<span>{x.sc.t}</span></div>)}</div>;
}
void useRef;
