'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useEngine, Ic } from './ui';
import { useRefs } from './refHooks';
import { SiteNav } from './SiteChrome';
import { CardFigure } from './CardFigure';
import { qText } from '@/lib/cardimg';
import { shuf } from '@/lib/engine';
import { isOwner } from '@/lib/api';
import type { QCard } from '@/lib/types';

interface Item { q: QCard; opts: { t: string; ok: boolean }[]; pick: number; flag: boolean }
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.max(0, s % 60)).padStart(2, '0');

/** Timed, mixed practice with no feedback until the end, then a score report by topic. Does not reschedule cards. */
export default function Exam() {
  const e = useEngine(), R = useRefs();
  const [stage, setStage] = useState<'setup' | 'run' | 'report'>('setup');
  const [sel, setSel] = useState('all'), [count, setCount] = useState(20), [mins, setMins] = useState(20);
  const [items, setItems] = useState<Item[]>([]), [i, setI] = useState(0), [left, setLeft] = useState(0), [sure, setSure] = useState(false);
  const end = useRef(0);
  useEffect(() => { e.init(); }, []); // eslint-disable-line

  const pool = useMemo(() => e.ready ? e.Q.filter(q => e.inSel(q, sel, e.S.cards[q.id])) : [], [e.ready, e.qver, sel]); // eslint-disable-line
  const n = Math.min(count, pool.length);

  function start() {
    const pick = shuf(pool).slice(0, n).map(q => ({ q, opts: shuf([q.c, ...q.w].map((t, k) => ({ t, ok: k === 0 }))), pick: -1, flag: false }));
    setItems(pick); setI(0); setSure(false); end.current = Date.now() + mins * 60_000; setLeft(mins * 60); setStage('run');
  }
  const finish = () => {
    items.forEach(it => { if (it.pick >= 0) e.noteResult(it.q.id, it.opts[it.pick].ok); else e.noteResult(it.q.id, false); });
    e.save(); setStage('report');
  };
  useEffect(() => {
    if (stage !== 'run') return;
    const t = setInterval(() => { const s = Math.ceil((end.current - Date.now()) / 1000); setLeft(s); if (s <= 0) { clearInterval(t); finish(); } }, 500);
    return () => clearInterval(t);
  }, [stage, items]); // eslint-disable-line

  const choose = (k: number) => setItems(a => a.map((it, j) => j === i ? { ...it, pick: it.pick === k ? -1 : k } : it));
  const flag = () => setItems(a => a.map((it, j) => j === i ? { ...it, flag: !it.flag } : it));

  const report = useMemo(() => {
    if (stage !== 'report') return null;
    const right = items.filter(it => it.pick >= 0 && it.opts[it.pick].ok).length, skipped = items.filter(it => it.pick < 0).length;
    const by = new Map<string, { t: string; n: number; ok: number }>();
    items.forEach(it => { const k = it.q.s, r = by.get(k) || { t: (it.q.n ? it.q.n + ' · ' : '') + it.q.t, n: 0, ok: 0 }; r.n++; if (it.pick >= 0 && it.opts[it.pick].ok) r.ok++; by.set(k, r); });
    return { right, skipped, total: items.length, by: [...by.values()].sort((a, b) => a.ok / a.n - b.ok / b.n) };
  }, [stage]); // eslint-disable-line

  const it = items[i];
  return (
    <div className="exam">
      <SiteNav owner={isOwner()} onSettings={() => { location.href = '/?settings=1'; }} />
      <main className="exm">
        {stage === 'setup' && <>
          <header className="hhead"><div><p>Practice under pressure</p><h1>Mock exam</h1></div><Link className="avatar" href="/" aria-label="Home"><Ic n="close" /></Link></header>
          <section className="panel xset">
            <label>Questions from
              <select value={sel} onChange={ev => setSel(ev.target.value)}>
                <option value="all">All cards</option><option value="pe">Past exam questions</option><option value="weak">Weak spots</option>
                {R.categories.map(k => <option key={k.id} value={'c:' + k.id}>Pool: {k.name}</option>)}
              </select></label>
            <label>Number of questions
              <div className="segx">{[10, 20, 40, 60].map(v => <button key={v} type="button" className={count === v ? 'on' : ''} onClick={() => { setCount(v); setMins(Math.max(5, Math.round(v * 1))); }}>{v}</button>)}</div></label>
            <label>Time limit: <b>{mins} min</b>
              <input type="range" min={5} max={120} step={5} value={mins} onChange={ev => setMins(+ev.target.value)} /></label>
            <p className="hnote">{pool.length ? `${pool.length} cards available. You will get ${n}.` : e.ready ? 'No cards in this selection.' : 'Loading cards…'} No feedback until you submit. Cards are not rescheduled; wrong answers go to your Mistakes list.</p>
            <button className="solid" disabled={!n} onClick={start}>Start exam</button>
          </section>
        </>}

        {stage === 'run' && it && <>
          <div className="xbar"><b className={left < 60 ? 'low' : ''}><Ic n="clock" /> {mmss(left)}</b><span>{i + 1} / {items.length}</span><button className="ghost" onClick={() => setSure(true)}>Submit</button></div>
          <div className="card xq" key={i}>
            <button className={'mini xflag' + (it.flag ? ' on' : '')} onClick={flag} aria-label="Flag for review"><Ic n="flag" /></button>
            <h2 className="q" style={{ fontSize: '1.2rem' }}>{qText(it.q.q).replace(/<[^>]+>/g, '')}</h2>
            <CardFigure q={it.q.q} reveal={false} compact />
            <div className="opts">{it.opts.map((o, k) => <button key={k} className={'opt' + (it.pick === k ? ' sel' : '')} onClick={() => choose(k)}><kbd>{k + 1}</kbd><span dangerouslySetInnerHTML={{ __html: o.t }} /></button>)}</div>
          </div>
          <div className="xnav"><button className="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button><button className="solid" disabled={i === items.length - 1} onClick={() => setI(i + 1)}>Next</button></div>
          <div className="xgrid">{items.map((x, k) => <button key={k} className={(k === i ? 'cur ' : '') + (x.pick >= 0 ? 'done ' : '') + (x.flag ? 'fl' : '')} onClick={() => setI(k)}>{k + 1}</button>)}</div>
          {sure && <div className="clight" onClick={() => setSure(false)}><div className="card" onClick={ev => ev.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3>Submit the exam?</h3><p className="n">{items.filter(x => x.pick < 0).length} unanswered · {items.filter(x => x.flag).length} flagged</p>
            <div className="row"><button className="ghost" onClick={() => setSure(false)}>Keep going</button><button className="solid" onClick={finish}>Submit</button></div></div></div>}
        </>}

        {stage === 'report' && report && <>
          <section className="today xres">
            <div><small>Your score</small><h2>{Math.round(report.right / Math.max(1, report.total) * 100)}%</h2><p>{report.right} of {report.total} correct{report.skipped ? ` · ${report.skipped} skipped` : ''}</p></div>
            <div className="ringw"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" className="rb" /><circle cx="60" cy="60" r="50" className="rf" strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - report.right / Math.max(1, report.total))} /></svg></div>
          </section>
          <div className="shead"><h2>By topic</h2></div>
          <div className="insights">{report.by.map(b => <div className="ins" key={b.t}><div><b>{b.t}</b><small>{b.ok} of {b.n} correct</small></div><span className="meter"><i style={{ width: Math.round(b.ok / b.n * 100) + '%' }} /></span></div>)}</div>
          <div className="shead"><h2>Review</h2><span>{items.filter(x => !(x.pick >= 0 && x.opts[x.pick].ok)).length} to look at</span></div>
          {items.map((x, k) => { const ok = x.pick >= 0 && x.opts[x.pick].ok; return (
            <article key={k} className={'xrev ' + (ok ? 'ok' : 'no')}>
              <b>{k + 1}. {qText(x.q.q).replace(/<[^>]+>/g, '')}</b>
              <CardFigure q={x.q.q} reveal compact />
              <p>{ok ? <><Ic n="check" /> {x.q.c.replace(/<[^>]+>/g, '')}</> : <>{x.pick >= 0 ? <span className="bad">Your answer: {x.opts[x.pick].t.replace(/<[^>]+>/g, '')}<br /></span> : <span className="bad">Skipped<br /></span>}<span className="good">Correct: {x.q.c.replace(/<[^>]+>/g, '')}</span></>}</p>
              {!ok && <button className="ghost" onClick={() => { e.setShaky(x.q.id, true); e.toast('Added to your Shaky pile'); }}><Ic n="flag" /> Add to Shaky</button>}
            </article>); })}
          <div className="row"><button className="ghost" onClick={() => setStage('setup')}>New exam</button><Link className="solid" href="/">Done</Link></div>
        </>}
      </main>
    </div>
  );
}
