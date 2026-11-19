'use client';
import { useEffect, useState } from 'react';
import { Ic, Sheet, SheetFrame, useEngine } from './ui';
import { streakInfo, todayDid } from '@/lib/goals';

/** The Streak panel: what keeps your streak alive today, how freezes work, and how many you have. Open it from anywhere with openStreak(). */
export const openStreak = () => { try { dispatchEvent(new Event('ud-streak-open')); } catch { /* ignore */ } };

export function StreakHost() {
  const e = useEngine(), [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); addEventListener('ud-streak-open', f); return () => removeEventListener('ud-streak-open', f); }, []);
  if (!open) return <Sheet open={false} onClose={() => setOpen(false)} className="sheet stk"><span /></Sheet>;
  const st = streakInfo(e), d = todayDid(e), goal = e.O.dailyGoal || 20;
  const rows: [string, string, boolean][] = [
    ['Answer a card', d.cards ? d.cards + ' answered today' : 'Any one card keeps it', d.cards > 0],
    ['Read 5 pages in the Reader', d.read ? 'Done today' : 'Pages you spend real time on, not scrolling', d.read],
    ['Finish a 3D lab quiz', d.lab ? 'Done today' : 'Any model, any score', d.lab],
    ['Heal a leech', d.leech ? 'Done today' : 'In the Leech Lab', d.leech]
  ];
  return (
    <Sheet open onClose={() => setOpen(false)} className="sheet stk">
      <SheetFrame title="Streak" onClose={() => setOpen(false)}>
        <div className="stk-in">
          <div className="stk-hero">
            <span className="stk-f"><Ic n="fire" /></span>
            <div><b>{st.n}</b><small>day streak</small></div>
            <p>{st.done ? 'Today is counted. Come back tomorrow.' : st.n > 0 ? 'Do any one of these today to keep it.' : 'Do any one of these today to start one.'}</p>
          </div>
          <h5>What counts today</h5>
          <ul className="stk-l">{rows.map(([t, s, ok]) => <li key={t} className={ok ? 'ok' : ''}><i>{ok ? <Ic n="check" /> : null}</i><span><b>{t}</b><small>{s}</small></span></li>)}</ul>
          <h5>Freezes</h5>
          <div className="stk-fz">
            <div className="stk-pips" aria-label={st.freeze + ' of 2 freezes'}>{[0, 1].map(i => <span key={i} className={i < st.freeze ? 'on' : ''}><Ic n="snow" /></span>)}</div>
            <p>{st.freeze ? <><b>{st.freeze} ready.</b> A freeze covers a missed day automatically, so your streak survives.</> : <>You have none yet. You earn one every 7 days in a row{st.n > 0 ? ' (' + st.toNext + ' to go)' : ''}, and can keep two.</>}</p>
            {st.saved > 0 && <small>Freezes have saved your streak {st.saved} time{st.saved > 1 ? 's' : ''}.</small>}
          </div>
          <p className="stk-n">Best streak: <b>{st.best}</b> day{st.best === 1 ? "" : "s"} · Daily card goal: <b>{goal}</b></p>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
