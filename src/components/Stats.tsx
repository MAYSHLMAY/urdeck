'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { D } from '@/lib/srs';
import { Sheet, SheetFrame, useEngine } from './ui';

export function Stats({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: (filter: string) => void }) {
  const e = useEngine(), router = useRouter(), [bar, setBar] = useState(-1), [day, setDay] = useState(-1);
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const S = e.S, now = Date.now(), t0 = e.dayStart(now);
  const k = { new: 0, learn: 0, young: 0, mature: 0, susp: 0, mark: 0, leech: 0 }, fc: number[] = new Array(14).fill(0);
  e.QF.forEach(q => {
    const c = S.cards[q.id];
    if (c && c.susp) k.susp++; if (c && c.mark) k.mark++; if (e.isLeech(c)) k.leech++;
    if (e.isNew(c)) k.new++;
    else if (c.t === 'review') { (c.iv >= 21 ? k.mature++ : k.young++); if (!c.susp) { const d = Math.max(0, Math.floor((c.due - t0) / D)); if (d < 14) fc[d]++; } }
    else k.learn++;
  });
  let r = 0, rk = 0, tot = 0, days = 0; const cells: number[] = [], dates: number[] = [];
  for (let i = 83; i >= 0; i--) {
    const L = S.log[e.dayKey(e.addDays(t0, -i))]; cells.push(L ? L.n : 0); dates.push(e.addDays(t0, -i));
    if (i < 30 && L) { r += L.r; rk += L.rk; tot += L.n; if (L.n) days++; }
  }
  const mx = Math.max(1, ...fc);
  const bySec = new Map<string, any>();
  e.QF.forEach(q => { const c = S.cards[q.id]; if (!c || !c.a) return; let z = bySec.get(q.s); if (!z) { z = { s: q.s, n: q.n, t: q.t, a: 0, k: 0 }; bySec.set(q.s, z); } z.a += c.a; z.k += c.k || 0; });
  const weak = [...bySec.values()].filter(z => z.a >= 6).sort((a, b) => a.k / a.a - b.k / b.a).slice(0, 5);
  const ex = e.examInfo();
  const Big = ({ b, s }: { b: any; s: string }) => <div><b>{b}</b><small>{s}</small></div>;
  const Go = ({ b, s, f, href }: { b: any; s: string; f?: string; href?: string }) => (
    <button type="button" className={'stb' + (b ? ' go' : '')} onClick={() => { onClose(); if (href) router.push(href); else setTimeout(() => onSearch(f || 'all'), 140); }}><b>{b}</b><small>{s}</small></button>
  );
  const goal = e.O.dailyGoal || 20, ret = r ? Math.round(rk / r * 100) : 0, target = e.O.retention || 90;
  const fmtD = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const tip = k.leech > 0 ? { t: k.leech + ' card' + (k.leech === 1 ? ' keeps' : 's keep') + ' slipping away. Fixing them lifts your retention more than extra reviews.', b: 'Open the Leech Lab', fn: () => { onClose(); router.push('/leeches'); } }
    : fc[0] > 0 ? { t: fc[0] + ' review' + (fc[0] === 1 ? ' is' : 's are') + ' due today. Clearing them first keeps the schedule honest.', b: 'Back to studying', fn: onClose }
    : { t: 'Nothing is due. A few new cards now means a lighter week later.', b: 'Add cards', fn: () => { onClose(); setTimeout(() => onSearch('new'), 140); } };

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title="Statistics" onClose={onClose}>
        <div className="sc" id="stbody">
          <div className="big"><Big b={S.streak} s="day streak" /><Big b={S.best || S.streak} s="best streak" /><Big b={S.done + '/' + goal} s="daily goal" /></div>
          <div className="big" style={{ marginTop: 8 }}><Big b={tot} s="answers, 30 days" /><Big b={r ? ret + '%' : '–'} s={r ? 'retention, target ' + target + '%' : 'review retention'} /><Big b={days ? Math.round(tot / days) : '–'} s="avg per active day" /></div>
          <p className="sec">Card states <small>({e.fieldOk() ? (e.FT.name.get(e.field) || 'field') + ': ' : 'all '}{e.QF.length})</small></p>
          <div className="big"><Go b={k.new} s="new" f="new" /><Go b={k.learn} s="learning" f="learn" /><Go b={k.young} s="young (<21d)" f="young" /><Go b={k.mature} s="mastered" f="mature" /><Go b={k.mark} s="marked" f="mark" /><Go b={k.susp} s="suspended" f="susp" /><Go b={fc[0]} s="due today" f="due" /><Go b={k.leech} s="leeches" href="/leeches" /><Go b={e.QF.length} s="all cards" f="all" /></div>
          <div className="sti"><p>{tip.t}</p><div className="row"><button type="button" className="solid" onClick={tip.fn}>{tip.b}</button></div></div>
          <p className="sec">Reviews due, next 14 days</p>
          <div className="fc">{fc.map((n, i) => <button type="button" key={i} className={bar === i ? 'on' : ''} aria-label={(i ? 'In ' + i + ' day' + (i === 1 ? '' : 's') : 'Today') + ': ' + n + ' due'} onClick={() => setBar(bar === i ? -1 : i)}><i style={{ height: Math.max(2, n / mx * 100) + '%' }} /></button>)}</div>
          <div className="fl"><span>today ({fc[0]})</span><span>+14 d</span></div>
          <p className="dtl">{bar < 0 ? 'Tap a bar to see that day.' : (bar === 0 ? 'Today' : fmtD(e.addDays(t0, bar))) + ': ' + fc[bar] + ' review' + (fc[bar] === 1 ? '' : 's') + ' due'}</p>
          <p className="sec">Last 12 weeks</p>
          <div className="heat">{cells.map((n, i) => <i key={i} role="button" tabIndex={0} aria-label={fmtD(dates[i]) + ': ' + n + ' answers'} className={day === i ? 'on' : ''} onClick={() => setDay(day === i ? -1 : i)} onKeyDown={ev => { if (ev.key === 'Enter') setDay(day === i ? -1 : i); }} style={n ? { background: `color-mix(in srgb,var(--acc) ${Math.min(100, 25 + n * 3)}%,transparent)` } : undefined} />)}</div>
          <p className="dtl">{day < 0 ? 'Tap a day to see what you answered.' : fmtD(dates[day]) + ': ' + cells[day] + ' answer' + (cells[day] === 1 ? '' : 's') + (S.log[e.dayKey(dates[day])]?.r ? ', ' + Math.round(S.log[e.dayKey(dates[day])].rk / S.log[e.dayKey(dates[day])].r * 100) + '% of reviews right' : '')}</p>
          {weak.length ? <>
            <p className="sec">Weakest sections <small>(by answers so far)</small></p>
            {weak.map(z => (
              <div className="wk" key={z.s}><span><span className="num">{z.n || ''}</span> {z.t} · <b>{Math.round(z.k / z.a * 100)}%</b></span>
                <button className="ghost" onClick={() => { e.setSel(z.s); onClose(); }}>Study</button></div>
            ))}
          </> : null}
          {ex ? <><p className="sec">Exam</p><p className="info" style={{ fontSize: '.9rem' }}>{ex}</p></> : null}
        </div>
      </SheetFrame>
    </Sheet>
  );
}
