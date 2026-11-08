'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEngine } from '../ui';
import { isOwner, unlock } from '@/lib/api';
import { Host, makeQuestions } from '@/lib/game/host';
import { DEFAULTS, TEAM_COLORS, TEAM_NAMES, type Settings } from '@/lib/game/types';
import { Avatar } from './Avatar';
import { SHAPES, Confetti, Leaderboards, Ring, useStore, useTick } from './shared';

export default function HostApp() {
  const e = useEngine();
  const [ok, setOk] = useState<boolean | null>(null), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const [host, setHost] = useState<Host | null>(null);
  const [saved, setSaved] = useState<ReturnType<typeof Host.hasSaved>>(null);
  useEffect(() => { setOk(isOwner()); setSaved(Host.hasSaved()); e.init(); }, []); // eslint-disable-line
  if (ok === null) return <div className="gm"><div className="gwrap"><p>Loading…</p></div></div>;
  if (!ok) return (
    <div className="gm"><div className="gtop"><Link href="/" className="gbtn sm ghost">← Home</Link><b>Host a quiz</b></div><div className="gwrap"><div className="gcard"><h2>Owner only</h2><p className="note">Only the owner can start a live game.</p>
      <input type="password" placeholder="Owner password" value={pw} onChange={x => setPw(x.target.value)} onKeyDown={async x => { if (x.key === 'Enter') { const m = await unlock(pw); m ? setErr(m) : setOk(true); } }} />
      {err && <p className="err">{err}</p>}<button className="gbtn go" onClick={async () => { const m = await unlock(pw); m ? setErr(m) : setOk(true); }}>Unlock</button></div></div></div>);
  if (host) return <Live host={host} onExit={() => { host.close(); setHost(null); setSaved(null); }} />;
  return <Setup resume={saved} onResume={() => { const h = Host.restore(); if (h) { h.open(); setHost(h); } }} onDiscard={() => { Host.clearSaved(); setSaved(null); }} onStart={h => { h.open(); setHost(h); }} />;
}

function Setup({ resume, onResume, onDiscard, onStart }: { resume: any; onResume: () => void; onDiscard: () => void; onStart: (h: Host) => void }) {
  const e = useEngine();
  const sets = useMemo(() => { const m = new Map<string, number>(); e.Q.forEach(q => m.set(q.s, (m.get(q.s) || 0) + 1)); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [e.Q.length]); // eslint-disable-line
  const [pick, setPick] = useState<Set<string>>(new Set()), [S, setS] = useState<Settings>(DEFAULTS), [title, setTitle] = useState('Live quiz'), [err, setErr] = useState('');
  const pool = e.Q.filter(q => pick.has(q.s)), usable = pool.filter(q => q.w && q.w.length);
  const up = (p: Partial<Settings>) => setS(s => ({ ...s, ...p }));
  const start = () => {
    if (!usable.length) return setErr('Pick at least one set that has multiple-choice cards.');
    const qs = makeQuestions(usable.map(q => ({ id: q.id, q: q.q, c: q.c, w: q.w, s: q.s })), S);
    onStart(new Host(title.trim() || 'Live quiz', S, qs));
  };
  const tog = (k: string) => setPick(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const Seg = ({ v, o, on }: { v: any; o: [any, string][]; on: (x: any) => void }) => <div className="gseg">{o.map(([k, l]) => <button type="button" key={String(k)} className={v === k ? 'on' : ''} onClick={() => on(k)}>{l}</button>)}</div>;
  const maxQ = Math.max(3, Math.min(50, usable.length || 10));
  return (
    <div className="gm"><div className="gtop"><Link href="/" className="gbtn sm ghost">← Home</Link><b>Host a quiz</b></div>
      <div className="gwrap start">
        <h1 className="gtitle">Host a live quiz</h1>
        {resume && <div className="gcard"><h2>Game in progress</h2><p className="note">"{resume.title}" (PIN {resume.pin}) was still running on this device.</p><button className="gbtn go" onClick={onResume}>Resume it</button><button className="gbtn ghost" onClick={onDiscard}>Discard</button></div>}
        <div className="setup">
          <div className="gcard wide">
            <h2><i>1</i> Pick the sets</h2>
            <div className="ctl" style={{ justifyContent: 'flex-start' }}><button className="gbtn sm ghost" onClick={() => setPick(new Set(sets.map(s => s[0])))}>Select all</button><button className="gbtn sm ghost" onClick={() => setPick(new Set())}>Clear</button></div>
            <div className="gchips">{sets.map(([k, n]) => <button type="button" key={k} className={'setchip' + (pick.has(k) ? ' on' : '')} onClick={() => tog(k)}>{k}<small>{n} card{n === 1 ? '' : 's'}</small></button>)}{!sets.length && <p className="note">Loading sets…</p>}</div>
            <p className="note"><b>{usable.length}</b> usable card{usable.length === 1 ? '' : 's'} · questions are picked at random from them.</p>
          </div>
          <div className="gcard wide">
            <h2><i>2</i> Game settings</h2>
            <label>Game name<input value={title} maxLength={60} onChange={x => setTitle(x.target.value)} /></label>
            <label>Questions: {Math.min(S.count, maxQ)}<input type="range" min={3} max={maxQ} value={Math.min(S.count, maxQ)} onChange={x => up({ count: +x.target.value })} /></label>
            <label>Seconds per question<Seg v={S.secs} o={[[5, '5'], [10, '10'], [20, '20'], [30, '30'], [45, '45'], [60, '60'], [90, '90']]} on={v => up({ secs: v })} /></label>
            <label>Points<Seg v={S.points} o={[['std', 'Standard'], ['double', 'Double'], ['none', 'None']]} on={v => up({ points: v })} /></label>
            <label>Teams<Seg v={S.teams} o={[[0, 'Solo'], [2, '2'], [3, '3'], [4, '4']]} on={v => up({ teams: v })} /></label>
            <div className="swgrid">{([['streak', '🔥 Streak bonus'], ['shuffle', '🔀 Shuffle answers'], ['showQ', '📱 Question on phones'], ['late', '🚪 Late joiners'], ['auto', '⏩ Auto-advance'], ['sound', '🔊 Sound & music']] as const).map(([k, l]) => <label className="sw" key={k}>{l}<input type="checkbox" checked={!!S[k]} onChange={x => up({ [k]: x.target.checked } as any)} /></label>)}</div>
            {err && <p className="err">{err}</p>}
            <button className="gbtn go xl" onClick={start}>Create game</button>
          </div>
        </div>
        <details style={{ width: '100%', maxWidth: 620 }}><summary>🏆 Leaderboard</summary><div style={{ marginTop: 10 }}><Leaderboards /></div></details>
      </div></div>
  );
}

function Live({ host, onExit }: { host: Host; onExit: () => void }) {
  useStore(host); useTick(250);
  const [qr, setQr] = useState('');
  const url = typeof location !== 'undefined' ? `${location.origin}/play?pin=${host.pin}${location.search.includes('t=local') ? '&t=local' : ''}` : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 260 }).then(setQr).catch(() => {}); }, [url]);
  const p = host.phase, q = host.qs[host.idx], left = Math.max(0, host.paused ? host.pauseLeft : host.qEnd - Date.now());
  const Top = <div className="gtop"><button className="gbtn sm ghost" onClick={() => { if (p === 'podium' || p === 'lobby' || confirm('End this game and close it for everyone?')) onExit(); }}>Close</button><b>{host.title}</b><span className="gpill">PIN {host.pin}</span><span>{host.players.size} 👤</span>{host.link !== 'open' && <span title="Connecting to the live channel">⚠</span>}</div>;
  const ctl = <div className="ctl">
    {(p === 'question' || p === 'countdown') && (host.paused ? <button className="gbtn sm go" onClick={() => host.resume()}>Resume</button> : <button className="gbtn sm ghost" onClick={() => host.pause()}>Pause</button>)}
    {p === 'question' && <><button className="gbtn sm ghost" onClick={() => host.addTime(10)}>+10 s</button><button className="gbtn sm blue" onClick={() => host.skip()}>Skip timer</button></>}
    {(p === 'reveal' || p === 'board') && <button className="gbtn go" onClick={() => host.next()}>{p === 'reveal' && host.idx >= host.qs.length - 1 ? 'Final results' : 'Next'}</button>}
    {p !== 'lobby' && p !== 'podium' && <button className="gbtn sm red" onClick={() => confirm('End the game now and show the podium?') && host.end()}>End game</button>}
  </div>;
  if (p === 'lobby') return (
    <div className="gm">{Top}<div className="gwrap start"><div className="lobby">
      <section className="joinp">
        <span className="url">Join at <b>{typeof location !== 'undefined' ? location.host : ''}/play</b> with PIN</span>
        <div className="pinbox">{host.pin}</div>
        {qr && <img src={qr} alt="QR code to join" width={190} height={190} />}
        <div className="ctl"><button className="gbtn sm ghost" onClick={() => navigator.clipboard?.writeText(url)}>📋 Copy link</button><button className="gbtn sm ghost" onClick={() => host.setLocked(!host.locked)}>{host.locked ? '🔒 Locked' : '🔓 Lock game'}</button></div>
      </section>
      <section className="roster">
        <h2>Players <span>{host.players.size}</span></h2>
        <div className="rgrid">{[...host.players.values()].map(x => <span key={x.id} className={'pchip' + (host.online.has(x.id) ? '' : ' off')} style={x.team != null ? { boxShadow: '0 0 0 3px ' + TEAM_COLORS[x.team] } : undefined}><Avatar av={x.av} size={38} />{x.name}<button title="Remove" onClick={() => host.kick(x.id)}>×</button></span>)}{!host.players.size && <div className="gempty">Waiting for players to join…<br /><small>Scan the QR code or enter the PIN</small></div>}</div>
        <div className="startbar"><span>{host.qs.length} questions · {host.S.secs}s each{host.S.teams ? ` · ${host.S.teams} teams` : ''}</span><button className="gbtn go xl" disabled={!host.players.size} onClick={() => host.start()}>Start</button></div>
      </section>
    </div></div></div>);
  if (p === 'countdown') return <div className="gm">{Top}<div className="gwrap"><p>Question {host.idx + 2} of {host.qs.length}</p><div className="cd">{host.paused ? '⏸' : Math.max(1, Math.ceil((host.phaseEnd - Date.now()) / 1000))}</div>{ctl}</div></div>;
  if (p === 'question' && q) return (
    <div className="gm" style={{ minHeight: '100dvh' }}>{Top}<div className="gwrap start" style={{ maxWidth: 1280, justifyContent: 'flex-start', flex: 1 }}>
      <div className="qstat"><span className="qn">{host.idx + 1}<small>/{host.qs.length}</small></span><span className="grow" /><span className="cnt-pill">{host.ans.size}/{host.players.size} answered</span><Ring left={left} total={host.S.secs * 1000} size={72} /></div>
      <div className="qcard xl">{q.text}</div>
      <div className={'ans full' + (q.choices.length < 3 ? ' one' : '')} style={{ minHeight: 260 }}>{q.choices.map((c, i) => <div key={i} className={'abtn c' + i}>{SHAPES[i % 4]}<span>{c}</span></div>)}</div>
      {host.paused && <b>⏸ Paused</b>}{ctl}
    </div></div>);
  if ((p === 'reveal' || p === 'board') && q) {
    const mx = Math.max(1, ...host.counts), rows = host.rows();
    return <div className="gm">{Top}<div className="gwrap start">
      {p === 'reveal' ? <><div className="qcard xl">{q.text}</div>
        <div className="hist">{q.choices.map((c, i) => <div key={i}><b>{host.counts[i] || 0}</b><i className={'c' + i} style={{ height: ((host.counts[i] || 0) / mx) * 100 + '%', background: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'][i % 4], opacity: i === q.correct ? 1 : .5 }} /><span style={{ fontWeight: i === q.correct ? 900 : 500 }}>{i === q.correct ? '✔ ' : ''}{c}</span></div>)}</div></>
        : <><h2>Leaderboard</h2>{host.S.teams > 0 && <div className="ctl">{host.teamScores().map((t, i) => <span key={i} className="gpill" style={{ background: TEAM_COLORS[i], color: '#fff' }}>{TEAM_NAMES[i]} {t}</span>)}</div>}</>}
      {p === 'board' && <div className="board">{rows.slice(0, 5).map(r => <div className="brow" key={r.id}><span className="r">{r.rank}</span><Avatar av={r.av} size={34} /><span className="n">{r.name}</span><span className="d">+{host.tot.get(r.id)?.d || 0}</span><b>{r.score}</b></div>)}</div>}
      {ctl}
    </div></div>;
  }
  if (p === 'podium') {
    const rows = host.rows(), top = rows.slice(0, 3), order = [top[1], top[0], top[2]].filter(Boolean), h = (r: number) => ({ 1: 190, 2: 140, 3: 100 } as any)[r];
    const dl = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([host.csv()], { type: 'text/csv' })); a.download = `quiz-${host.pin}.csv`; a.click(); };
    return <div className="gm">{Top}<Confetti /><div className="gwrap start"><h1 className="gtitle">🏆 Podium</h1>
      <div className="podium">{order.map(r => <div className="pst" key={r.id}><Avatar av={r.av} size={70} /><b>{r.name}</b><span>{r.score}</span><div className="pblk" style={{ height: h(r.rank), background: ['', '#d89e00', '#8a8a8a', '#a0603a'][r.rank] }}>{r.rank}</div></div>)}</div>
      <table className="lbl"><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Right</th><th>Streak</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.rank}</td><td>{r.name}</td><td>{r.score}</td><td>{r.correct}/{host.qs.length}</td><td>{r.bestStreak}</td></tr>)}</tbody></table>
      {host.history.length > 0 && <details style={{ width: '100%' }}><summary>Hardest questions</summary>{[...host.history].sort((a, b) => a.rate - b.rate).slice(0, 5).map((x, i) => <div className="brow" key={i}><span className="n">{x.text}</span><b>{Math.round(x.rate * 100)}%</b></div>)}</details>}
      <p className={host.saveState === 'error' ? 'err' : 'note'}>{host.saveState === 'saving' ? 'Saving to the leaderboard…' : host.saveMsg}</p>
      <div className="ctl">{host.saveState === 'error' && <button className="gbtn" onClick={() => host.finish()}>Retry save</button>}<button className="gbtn ghost" onClick={dl}>Download CSV</button>
        <button className="gbtn go" onClick={() => host.again(makeQuestions(host.qs.map(x => ({ id: x.id, q: x.text, c: x.choices[x.correct], w: x.choices.filter((_, i) => i !== x.correct), s: x.set })), host.S))}>Play again</button></div>
    </div></div>;
  }
  return <div className="gm">{Top}</div>;
}
