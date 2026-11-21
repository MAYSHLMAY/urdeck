'use client';
import { StudySkeleton } from './Skeleton';
import { kindOf } from '@/lib/kind';
import { applyLook } from '@/lib/look';
import { useEffect, useState } from 'react';
import { useEngine, Icon, Ic, Sheet, SheetFrame, AskHost, Toast } from './ui';
import { QuizContainer } from './QuizContainer';
import { TypePicker, TypeChip } from './TypePicker';
import Link from 'next/link';
import { refs } from '@/lib/refs';
import { usePoolSync } from './refHooks';
import { HighlightTools } from './Highlights';
import { LibraryMenu } from './LibraryMenu';
import { Search } from './Search';
import { FieldPill } from './Fields';
import { openStreak } from './Streak';
import { streakInfo } from '@/lib/goals';
import { Stats } from './Stats';
import { Settings } from './Settings';
import { AddDialog } from './AddDialog';
import { ModelsDialog } from './ModelsDialog';
import { CardEditor, type EditorState } from './CardEditor';
import { Browse } from './Browse';
import { Manage } from './Manage';
import { SpeedBar, SpeedSummary } from './Speed';

const PLANE = <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><rect x="5.2" y="3.2" width="11.6" height="15.6" rx="2.6" fill="currentColor" opacity=".3" transform="rotate(-14 11 11)" /><rect x="6.6" y="4" width="11.6" height="15.6" rx="2.6" fill="currentColor" opacity=".55" transform="rotate(-6 12 12)" /><rect x="7.6" y="4.6" width="11.2" height="15.2" rx="2.6" fill="currentColor" /><path d="m10.6 12.4 2 2 3.6-4.4" fill="none" stroke="var(--card,#fff)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>;

type Dlg = '' | 'manage' | 'menu' | 'browse' | 'grid' | 'stats' | 'set' | 'add' | 'models' | 'info';

export default function App() {
  const e = useEngine();
  usePoolSync();
  const [mounted, setMounted] = useState(false);
  const [dlg, setDlg] = useState<Dlg>('');
  const [sf, setSf] = useState('all');
  const [infoId, setInfoId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const close = () => setDlg('');

  useEffect(() => {
    setMounted(true);
    e.init();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && !(window as any).Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('/sw.js?v=' + process.env.NEXT_PUBLIC_BUILD).catch(() => {});
    // eslint-disable-next-line
  }, []);

  /* theme + text size */
  const o = e.O;
  useEffect(() => {
    applyLook({ t: o.theme });
    document.documentElement.style.setProperty('--fs', ({ s: '14.5px', m: '16px', l: '18px', xl: '20px' } as any)[o.size] || '16px');
    const d = document.documentElement; o.readable ? d.setAttribute('data-read', '1') : d.removeAttribute('data-read'); o.contrast ? d.setAttribute('data-contrast', '1') : d.removeAttribute('data-contrast');
  }, [o.theme, o.size, o.readable, o.contrast]);

  /* keyboard */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tg = (ev.target as HTMLElement)?.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (document.querySelector('dialog[open]')) return;
      if (!e.typeChosen && e.kindCounts().all.n > 0 && ev.key !== '/') return;
      const k = ev.key, ph = e.phase;
      if (k === '/') { ev.preventDefault(); setSf('all'); setDlg('browse'); return; }
      if ((k === 'r' || k === 'R') && e.cur) { refs().toggle(e.cur); return; }
      if (k === 'z' || k === 'Z') { e.doUndo(); return; }
      if ((k === 'm' || k === 'M') && e.cur && ph !== 'done') { e.toggleFlag(e.cur.id, 'mark'); return; }
      if (ph === 'q' && e.cur && kindOf(e.cur.q) !== 'mc') return;
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

  if (!mounted) return <StudySkeleton />;

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
        <header className="sh">
          <div className="sh-bar">
            <Link href="/" className="sh-ib" aria-label="Home" title="Home"><Ic n="arrowL" /></Link>
            <button className="pick sh-pick" onClick={() => { e.openMenu(); setDlg('menu'); }} aria-haspopup="dialog"><span className="pk">Studying</span><b>{e.selLabel()}</b><span aria-hidden="true"><Ic n="chevD" /></span></button>
            <button className="sh-ib" disabled={!e.U.length} onClick={() => e.doUndo()} aria-label="Undo" title="Undo (Z)"><Icon n="undo" /></button>
            <button className="sh-ib" onClick={() => { setSf('all'); setDlg('browse'); }} aria-label="Search" title="Search (/)"><Icon n="search" /></button>
            <div className="sh-mw">
              <button className={'sh-ib' + (more ? ' on' : '')} onClick={() => setMore(m => !m)} aria-label="More" aria-expanded={more} aria-haspopup="menu"><Ic n="dots" /></button>
              {more && (
                <>
                  <button className="sh-scrim" aria-label="Close menu" onClick={() => setMore(false)} />
                  <div className="sh-menu" role="menu">
                    <button role="menuitem" onClick={() => { setMore(false); setDlg('stats'); }}><Icon n="chart" />Statistics</button>
                    <button role="menuitem" onClick={() => { setMore(false); setDlg('grid'); }}><Ic n="grid" />Browse many cards</button>
                    <button role="menuitem" onClick={() => { setMore(false); setDlg('models'); }}><Icon n="cube" />3D models</button>
                    <Link role="menuitem" href="/read" onClick={() => setMore(false)}><Ic n="file" />Reader</Link>
                    <button role="menuitem" onClick={() => { setMore(false); setDlg('set'); }}><Icon n="set" />Settings</button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="sh-stats">
            <button type="button" className="sh-chip n" onClick={() => setDlg('stats')} aria-label={c.nToday + ' new'}><small>New</small><b>{c.nToday}</b></button>
            <button type="button" className="sh-chip l" onClick={() => setDlg('stats')} aria-label={c.l + ' learning'}><small>Learning</small><b>{c.l}</b></button>
            <button type="button" className="sh-chip d" onClick={() => setDlg('stats')} aria-label={c.dToday + ' due'}><small>Due</small><b>{c.dToday}</b></button>
            <button type="button" className="sh-fire" title={sub} onClick={openStreak} aria-label="Streak details"><Ic n="fire" className="fireic" /><b>{streakInfo(e).n}</b>{(S.freeze || 0) > 0 && <small><Ic n="snow" />{S.freeze}</small>}</button>
          </div>
          <i className="sh-prog" role="progressbar" aria-label="Progress through today's cards" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><u style={{ width: p + '%' }} /></i>
        </header>
        <div className="sh-sub">
          <FieldPill className="st-field" />
          <button className="sh-add" onClick={() => setDlg('add')} aria-label="Add folder or cards" title="Add folder or cards"><Ic n="plus" />Add</button>
        </div>
        <SpeedBar />
        <div id="mode" className={e.cram && !e.speed ? 'on' : ''}><span>Practice: {e.deck.length} left · your schedule is not changed.</span><button className="ghost" onClick={() => e.exitPractice()}>Exit</button></div>
        {!e.typeChosen && e.kindCounts().all.n > 0 ? <TypePicker /> : <>{e.kindCounts().all.n > 0 && !e.cram && <TypeChip />}<QuizContainer onInfo={id => { setInfoId(id); setDlg('info'); }} onCard={(mode, id, section) => setEditor({ mode, id, section })} /></>}
        <p className="hint">Keys: 1–4 answer · 1/2/3 Hard, Good, Easy · Enter continue · L later · D don’t know · Z undo · M mark · R reference PDF · / search</p>
      </div>

      <LibraryMenu open={dlg === 'menu'} onClose={close} onNew={st => { close(); setTimeout(() => setEditor(st), 120); }} />
      <Search open={dlg === 'browse'} init={sf} onClose={close} onStudy={() => close()} onOpenFolder={() => { e.openMenu(true); setDlg('menu'); }} />
      <Stats open={dlg === 'stats'} onClose={close} onSearch={f => { setSf(f); setDlg('browse'); }} />
      <Settings open={dlg === 'set'} onClose={() => { close(); if (e.phase === 'done') e.show(); else e.emit(); }} />
      <AddDialog open={dlg === 'add'} onClose={close} onManage={() => setTimeout(() => setDlg('manage'), 80)} />
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
      <SpeedSummary />
      <Manage open={dlg === 'manage'} onClose={close} onEdit={id => setEditor({ mode: 'edit', id, section: e.qById(id)?.s })} />
      <Browse onManage={() => setTimeout(() => setDlg('manage'), 80)} open={dlg === 'grid'} onClose={close} onPick={() => { e.openMenu(); setDlg('menu'); }} onEdit={id => setEditor({ mode: 'edit', id, section: e.qById(id)?.s })} />
      <CardEditor state={editor} onClose={() => setEditor(null)} />
      <HighlightTools />
      <AskHost />
      <Toast />
    </>
  );
}

export { SheetFrame };
