'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEngine, Ic } from './ui';
import { SiteNav } from './SiteChrome';
import { CardFigure } from './CardFigure';
import { qText } from '@/lib/cardimg';
import { shuf } from '@/lib/engine';
import { isOwner } from '@/lib/api';
import { decodeChallenge, encodeChallenge, getName, seeded, setName, type Challenge } from '@/lib/duel';
import type { QCard } from '@/lib/types';

const N = 10;
/** Challenge a friend: 10 questions, the same cards and option order for both of you, result travels in a link. */
export default function Duel() {
  const e = useEngine();
  const [ch, setCh] = useState<Challenge | null>(null), [stage, setStage] = useState<'home' | 'run' | 'done'>('home');
  const [name, setNm] = useState(''), [sel, setSel] = useState('all'), [i, setI] = useState(0), [picks, setPicks] = useState<number[]>([]), [qr, setQr] = useState('');
  const t0 = useRef(0), [ms, setMs] = useState(0), [boot, setBoot] = useState(false);
  useEffect(() => { e.init(); setNm(getName()); const c = decodeChallenge(location.hash); if (c) setCh(c); setBoot(true); }, []); // eslint-disable-line
  const cards = useMemo(() => {
    if (!e.ready) return [] as QCard[];
    const ids = ch ? ch.ids : [];
    return ids.map(id => e.qById(id)).filter(Boolean) as QCard[];
  }, [e.ready, e.qver, ch]); // eslint-disable-line
  const [mine, setMine] = useState<{ ids: string[]; seed: number } | null>(null);
  const deck = ch ? cards : (mine ? mine.ids.map(id => e.qById(id)).filter(Boolean) as QCard[] : []);
  const seed = ch ? ch.seed : mine?.seed || 1;
  const opts = (q: QCard) => seeded([q.c, ...q.w].map((t, k) => ({ t, ok: k === 0 })), seed + q.id.length * 7 + [...q.id].reduce((a, c) => a + c.charCodeAt(0), 0));
  const o = useMemo(() => deck.map(opts), [deck, seed]); // eslint-disable-line

  function create() {
    if (!name.trim()) { e.toast('Add your name first'); return; }
    setName(name);
    const pool = e.Q.filter(q => e.inSel(q, sel, e.S.cards[q.id]));
    if (pool.length < 4) { e.toast('Not enough cards in that selection'); return; }
    setMine({ ids: shuf(pool).slice(0, N).map(q => q.id), seed: 1 + Math.floor(Math.random() * 1e9) }); begin();
  }
  function begin() { setI(0); setPicks([]); t0.current = Date.now(); setStage('run'); }
  function accept() { if (!name.trim()) { e.toast('Add your name first'); return; } setName(name); begin(); }
  function pick(k: number) {
    if (picks[i] !== undefined) return;
    const np = [...picks]; np[i] = k; setPicks(np);
    setTimeout(() => { if (i + 1 >= deck.length) { setMs(Date.now() - t0.current); setStage('done'); } else setI(i + 1); }, 650);
  }
  const score = picks.filter((p, k) => o[k]?.[p]?.ok).length;
  const reply = useMemo(() => stage === 'done' ? encodeChallenge({ v: 1, ids: deck.map(q => q.id), seed, by: name || 'A friend', sc: score, ms }) : '', [stage]); // eslint-disable-line
  const link = reply ? location.origin + '/duel#' + reply : '';
  useEffect(() => { if (link) QRCode.toDataURL(link, { margin: 1, width: 200 }).then(setQr).catch(() => {}); }, [link]);
  const share = async () => {
    const text = ch ? `I scored ${score}/${deck.length} on your challenge. Can you beat ${score}?` : `I scored ${score}/${deck.length} in ${Math.round(ms / 1000)}s. Beat me!`;
    try { if (navigator.share) { await navigator.share({ title: 'Flight Recall challenge', text, url: link }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text + ' ' + link); e.toast('Link copied. Paste it in Telegram or WhatsApp.'); } catch { e.toast('Copy the link from the address bar after sharing'); }
  };
  const missing = ch ? ch.ids.length - cards.length : 0;

  return (
    <>
      <SiteNav owner={isOwner()} onSettings={() => {}} />
      <main className="hm duel">
        <header className="hhead"><div><p>Play with a friend</p><h1>Challenge</h1></div><Link className="avatar" href="/" aria-label="Home"><Ic n="close" /></Link></header>
        {stage === 'home' && boot && <section className="panel xset">
          {ch ? <>
            <h2>{ch.by} challenged you</h2>
            {ch.sc !== undefined && <p>Score to beat: <b>{ch.sc} / {ch.ids.length}</b>{ch.ms ? ` in ${Math.round(ch.ms / 1000)} s` : ''}</p>}
            {e.ready && missing > 0 && <p className="n">{missing} of the questions are not in your library, so they were left out.</p>}
            {e.ready && !cards.length && <p className="n err">None of these cards are in your library. Ask your friend to share the same deck first.</p>}
          </> : <>
            <h2>10 questions, one link</h2>
            <p className="n">Pick cards, answer them, then send the link. Your friend gets the same questions and your score to beat.</p>
            <label>Questions from
              <select value={sel} onChange={ev => setSel(ev.target.value)}><option value="all">All cards</option><option value="pe">Past exam questions</option><option value="weak">My weak spots</option></select></label>
          </>}
          <label>Your name<input type="text" value={name} maxLength={24} onChange={ev => setNm(ev.target.value)} placeholder="Name your friend will see" /></label>
          <button className="solid" disabled={!e.ready || (!!ch && !cards.length)} onClick={ch ? accept : create}>{ch ? 'Accept the challenge' : 'Start'}</button>
        </section>}
        {stage === 'run' && deck[i] && <section className="panel dq" aria-live="polite">
          <div className="xbar"><b>{i + 1} / {deck.length}</b><span>{picks.filter((p, k) => o[k]?.[p]?.ok).length} right</span></div>
          <h2 className="q">{qText(deck[i].q)}</h2>
          <CardFigure q={deck[i].q} />
          <div className="opts">{o[i].map((x, k) => {
            const d = picks[i] !== undefined;
            return <button key={k} className={'opt' + (d ? (x.ok ? ' ok' : picks[i] === k ? ' bad' : '') : '')} disabled={d} onClick={() => pick(k)}>{x.t}</button>;
          })}</div>
        </section>}
        {stage === 'done' && <>
          <section className="today xres">
            <div><small>{ch ? 'You vs ' + ch.by : 'Your score'}</small><h2>{score} / {deck.length}</h2>
              <p>{Math.round(ms / 1000)} s{ch && ch.sc !== undefined ? (score > ch.sc ? ' · You win!' : score === ch.sc ? ' · A tie' : ' · ' + ch.by + ' wins this time') : ''}</p>
              <button className="go" onClick={share}>{ch ? 'Send my result back' : 'Challenge a friend'} <Ic n="arrowR" /></button></div>
            <div className="ringw"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" className="rb" /><circle cx="60" cy="60" r="50" className="rf" strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - score / Math.max(1, deck.length))} /></svg></div>
          </section>
          {qr && <section className="panel" style={{ textAlign: 'center' }}><img src={qr} alt="QR code of the challenge link" width={200} height={200} /><p className="n">Or let a friend scan this.</p></section>}
          <div className="shead"><h2>Review</h2></div>
          <div className="insights">{deck.map((q, k) => { const ok = !!o[k][picks[k]]?.ok; return <div className="ins" key={q.id}><div><b>{qText(q.q)}</b><small>{ok ? 'Correct' : 'Answer: ' + q.c}</small></div><span className={'meter' + (ok ? '' : ' bad')}><i style={{ width: ok ? '100%' : '12%' }} /></span></div>; })}</div>
          <div className="row"><button className="ghost" onClick={() => { setStage('home'); setCh(null); setMine(null); history.replaceState(null, '', '/duel'); }}>New challenge</button><Link className="ghost" href="/">Home</Link></div>
        </>}
      </main>
    </>
  );
}
