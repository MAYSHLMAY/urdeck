'use client';
import { D } from '@/lib/srs';
import { Sheet, SheetFrame, useEngine } from './ui';

export function Stats({ open, onClose }: { open: boolean; onClose: () => void }) {
  const e = useEngine();
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const S = e.S, now = Date.now(), t0 = e.dayStart(now);
  const k = { new: 0, learn: 0, young: 0, mature: 0, susp: 0, mark: 0, leech: 0 }, fc: number[] = new Array(14).fill(0);
  e.Q.forEach(q => {
    const c = S.cards[q.id];
    if (c && c.susp) k.susp++; if (c && c.mark) k.mark++; if (e.isLeech(c)) k.leech++;
    if (e.isNew(c)) k.new++;
    else if (c.t === 'review') { (c.iv >= 21 ? k.mature++ : k.young++); if (!c.susp) { const d = Math.max(0, Math.floor((c.due - t0) / D)); if (d < 14) fc[d]++; } }
    else k.learn++;
  });
  let r = 0, rk = 0, tot = 0, days = 0; const cells: number[] = [];
  for (let i = 83; i >= 0; i--) {
    const L = S.log[e.dayKey(e.addDays(t0, -i))]; cells.push(L ? L.n : 0);
    if (i < 30 && L) { r += L.r; rk += L.rk; tot += L.n; if (L.n) days++; }
  }
  const mx = Math.max(1, ...fc);
  const bySec = new Map<string, any>();
  e.Q.forEach(q => { const c = S.cards[q.id]; if (!c || !c.a) return; let z = bySec.get(q.s); if (!z) { z = { s: q.s, n: q.n, t: q.t, a: 0, k: 0 }; bySec.set(q.s, z); } z.a += c.a; z.k += c.k || 0; });
  const weak = [...bySec.values()].filter(z => z.a >= 6).sort((a, b) => a.k / a.a - b.k / b.a).slice(0, 5);
  const ex = e.examInfo();
  const Big = ({ b, s }: { b: any; s: string }) => <div><b>{b}</b><small>{s}</small></div>;

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title="Statistics" onClose={onClose}>
        <div className="sc" id="stbody">
          <div className="big"><Big b={S.streak} s="day streak" /><Big b={S.best || S.streak} s="best streak" /><Big b={S.done} s="answered today" /></div>
          <div className="big" style={{ marginTop: 8 }}><Big b={tot} s="answers, 30 days" /><Big b={r ? Math.round(rk / r * 100) + '%' : '–'} s="review retention" /><Big b={days ? Math.round(tot / days) : '–'} s="avg per active day" /></div>
          <p className="sec">Card states <small>(all {e.Q.length})</small></p>
          <div className="big"><Big b={k.new} s="new" /><Big b={k.learn} s="learning" /><Big b={k.young} s="young (<21d)" /><Big b={k.mature} s="mastered" /><Big b={k.mark} s="marked" /><Big b={k.susp} s="suspended" /></div>
          <p className="sec">Reviews due, next 14 days</p>
          <div className="fc">{fc.map((n, i) => <i key={i} style={{ height: Math.max(2, n / mx * 100) + '%' }} title={String(n)} />)}</div>
          <div className="fl"><span>today ({fc[0]})</span><span>+14 d</span></div>
          <p className="sec">Last 12 weeks</p>
          <div className="heat">{cells.map((n, i) => <i key={i} title={n + ' answers'} style={n ? { background: `color-mix(in srgb,var(--acc) ${Math.min(100, 25 + n * 3)}%,transparent)` } : undefined} />)}</div>
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
