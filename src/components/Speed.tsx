'use client';
import { useEffect, useState } from 'react';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';

/** Countdown strip shown above the card during a speed round. Ends the round when the time is up. */
export function SpeedBar() {
  const e = useEngine(), sp = e.speed;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sp) return;
    const t = setInterval(() => { if (e.speed && Date.now() >= e.speed.end) e.finishSpeed(true); else tick(n => n + 1); }, 250);
    return () => clearInterval(t);
  }, [sp, e]);
  if (!sp) return null;
  const left = Math.max(0, Math.ceil((sp.end - Date.now()) / 1000)), pct = Math.max(0, Math.min(100, (sp.end - Date.now()) / (sp.secs * 10)));
  return (
    <div className={'speedbar on' + (left <= 10 ? ' low' : '')} role="timer" aria-live="off">
      <span className="tm">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      <span className="tr"><i style={{ width: pct + '%' }} /></span>
      <small>{sp.right + sp.wrong} done · {sp.right} right</small>
      <button className="ghost" onClick={() => e.finishSpeed(false)}>Stop</button>
    </div>
  );
}

export function SpeedSummary() {
  const e = useEngine(), r = e.speedResult, n = r ? r.right + r.wrong : 0;
  return (
    <Sheet open={!!r} onClose={() => e.closeSpeed()} className="mini2">
      {r && <div>
        <h3 style={{ margin: '0 0 4px' }}><Ic n="clock" /> {r.timeUp ? 'Time’s up' : r.left ? 'Round stopped' : 'You finished them all'}</h3>
        <div className="sres">
          <div><b>{n}</b><small>answered</small></div>
          <div><b>{r.right}</b><small>right</small></div>
          <div><b>{n ? Math.round(r.right / n * 100) : 0}%</b><small>accuracy</small></div>
        </div>
        <p className="n">{r.missed.length ? `${r.missed.length} missed card${r.missed.length > 1 ? 's were' : ' was'} added to your Mistakes list.` : n ? 'No mistakes. Nice.' : 'No cards were answered.'}{r.left ? ` ${r.left} card${r.left > 1 ? 's' : ''} left unseen.` : ''}</p>
        <div className="row">
          {r.missed.length > 0 && <button className="solid" onClick={() => { const ids = r.missed; e.closeSpeed(); e.startPracticeIds(ids); }}>Drill the {r.missed.length} I missed</button>}
          <button className="ghost" onClick={() => e.closeSpeed()}>Close</button>
        </div>
      </div>}
    </Sheet>
  );
}
