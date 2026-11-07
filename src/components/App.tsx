'use client';
import { useEffect, useState } from 'react';
import { useEngine, Icon, Ic, Sheet, SheetFrame, AskHost, Toast } from './ui';
import { QuizContainer } from './QuizContainer';
import Link from 'next/link';
import { refs } from '@/lib/refs';
import { usePoolSync } from './refHooks';
import { HighlightTools } from './Highlights';
import { LibraryMenu } from './LibraryMenu';
import { Search } from './Search';
import { Stats } from './Stats';
import { Settings } from './Settings';
import { AddDialog } from './AddDialog';
import { ModelsDialog } from './ModelsDialog';
import { CardEditor, type EditorState } from './CardEditor';

const PLANE = <svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12 22 3l-5 18-5-7z" fill="currentColor" /></svg>;

type Dlg = '' | 'menu' | 'browse' | 'stats' | 'set' | 'add' | 'models' | 'info';

export default function App() {
  const e = useEngine();
  usePoolSync();
  const [mounted, setMounted] = useState(false);
  const [dlg, setDlg] = useState<Dlg>('');
  const [infoId, setInfoId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const close = () => setDlg('');

  useEffect(() => {
    setMounted(true);
    e.init();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // eslint-disable-next-line
  }, []);

  /* theme + text size */
  const o = e.O;
  useEffect(() => {
    document.documentElement.dataset.theme = o.theme === 'auto' ? '' : o.theme;
    document.documentElement.style.setProperty('--fs', ({ s: '14.5px', m: '16px', l: '18px', xl: '20px' } as any)[o.size] || '16px');
  }, [o.theme, o.size]);

  /* keyboard */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tg = (ev.target as HTMLElement)?.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (document.querySelector('dialog[open]')) return;
      const k = ev.key, ph = e.phase;
      if (k === '/') { ev.preventDefault(); setDlg('browse'); return; }
      if ((k === 'r' || k === 'R') && e.cur) { refs().toggle(e.cur); return; }
      if (k === 'z' || k === 'Z') { e.doUndo(); return; }
      if ((k === 'm' || k === 'M') && e.cur && ph !== 'done') { e.toggleFlag(e.cur.id, 'mark'); return; }
      if (ph === 'q') {
        if (/^[1-4]$/.test(k) && e.curOpts[+k - 1]) e.answer(+k - 1);
        else if (k === 'l' || k === 'L') e.laterQ();
        else if (k === 'd' || k === 'D') e.answer(-1);
      } else if (ph === 'ok') {
        if (k === '1' || k === '2' || k === '3') e.grade(+k);
        else if (k === 'Enter' || k === ' ') { ev.preventDefault(); e.grade(2); }
      } else if (ph === 'bad' || ph === 'cr') {
        if (k === 'Enter' || k === ' ') { ev.preventDefault(); e.show(); }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [e]);

  if (!mounted) return <div className="wrap"><p className="info">Loading…</p></div>;

  const c = e.counts(), S = e.S, now = Date.now();
  const live2 = S.last === e.dayKey(now) || S.last === e.dayKey(e.addDays(e.dayStart(now), -1));
  let sub = (live2 ? S.streak : 0) + ' day streak';
  const ex = e.examInfo(); if (ex) sub += ' · ' + ex;
  if (e.syncingCloud) sub += ' · syncing…';
  else if (e.syncing && e.ready) sub += ' · checking for updates…';
  const p = c.tot ? c.r / c.tot * 100 : 0;

  return (
    <>
      <div className="wrap">
        <div className="top">
          <h1><Link href="/" className="homeln" aria-label="Home" title="Home">{PLANE}Flight Recall</Link></h1>
          <div className="tools">
            <button className="ico" disabled={!e.U.length} onClick={() => e.doUndo()} aria-label="Undo" title="Undo (Z)"><Icon n="undo" /></button>
            <button className="ico" onClick={() => setDlg('browse')} aria-label="Search" title="Search (/)"><Icon n="search" /></button>
            <button className="ico" onClick={() => setDlg('stats')} aria-label="Statistics"><Icon n="chart" /></button>
            <button className="ico" onClick={() => setDlg('models')} aria-label="3D models" title="3D models"><Icon n="cube" /></button>
            <button className="ico" onClick={() => setDlg('set')} aria-label="Settings"><Icon n="set" /></button>
          </div>
        </div>
        <p className="sub1"><Ic n="fire" className="fireic" /> {sub}</p>
        <div className="path"><div className="track" /><i id="fill" style={{ width: p + '%' }} /><span id="plane" style={{ left: Math.max(2, Math.min(98, p)) + '%' }}>{PLANE}</span></div>
        <div className="counts">
          <div className="cn n"><b>{c.nToday}</b><small>New</small></div>
          <div className="cn l"><b>{c.l}</b><small>Learning</small></div>
          <div className="cn d"><b>{c.dToday}</b><small>Due</small></div>
        </div>
        <div className="stats2"><b>{c.m}</b> mastered of {c.tot} · <b>{S.done}</b> answered today{S.done ? ' (' + Math.round(S.ok / S.done * 100) + '% right)' : ''}</div>
        <div className="pickrow">
          <button className="pick" onClick={() => { e.openMenu(); setDlg('menu'); }} aria-haspopup="dialog"><span className="pk">Studying</span><b>{e.selLabel()}</b><span aria-hidden="true"><Ic n="chevD" /></span></button>
          <button className="plus" onClick={() => setDlg('add')} aria-label="Add folder or cards" title="Add folder or cards">+</button>
        </div>
        <div id="mode" className={e.cram ? 'on' : ''}><span>Practice: {e.deck.length} left · your schedule is not changed.</span><button className="ghost" onClick={() => e.exitPractice()}>Exit</button></div>
        <QuizContainer onInfo={id => { setInfoId(id); setDlg('info'); }} onCard={(mode, id, section) => setEditor({ mode, id, section })} />
        <p className="hint">Keys: 1–4 answer · 1/2/3 Hard, Good, Easy · Enter continue · L later · D don’t know · Z undo · M mark · R reference PDF · / search</p>
      </div>

      <LibraryMenu open={dlg === 'menu'} onClose={close} />
      <Search open={dlg === 'browse'} onClose={close} onStudy={() => close()} onOpenFolder={() => { e.openMenu(true); setDlg('menu'); }} />
      <Stats open={dlg === 'stats'} onClose={close} />
      <Settings open={dlg === 'set'} onClose={() => { close(); if (e.phase === 'done') e.show(); else e.emit(); }} />
      <AddDialog open={dlg === 'add'} onClose={close} />
      <ModelsDialog open={dlg === 'models'} onClose={close} />
      <Sheet open={dlg === 'info'} onClose={close} className="mini2">
        {infoId && (() => {
          const q = e.qById(infoId);
          return q ? <div>
            <h3 style={{ margin: '0 0 8px' }}>Card info</h3>
            <p className="info" style={{ fontSize: '.9rem' }}>{(q.n ? q.n + ' · ' : '') + q.t}<br />{e.infoText(q)}</p>
            <div className="row"><button className="solid" onClick={close}>Close</button></div>
          </div> : null;
        })()}
      </Sheet>
      <CardEditor state={editor} onClose={() => setEditor(null)} />
      <HighlightTools />
      <AskHost />
      <Toast />
    </>
  );
}

export { SheetFrame };
