'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type Orient = 'auto' | 'landscape' | 'portrait';
const NEXT: Record<Orient, Orient> = { auto: 'landscape', landscape: 'portrait', portrait: 'auto' };
const LABEL: Record<Orient, string> = { auto: 'Auto', landscape: 'Landscape', portrait: 'Portrait' };

/** Full screen + orientation for a viewer box (the 3D lab, simulations).
    Full screen is a fixed full-viewport layer, so it works on every phone; the browser's own fullscreen and orientation lock are added when they exist.
    `rotate`: where a lock is unavailable, turn the box 90 degrees to get the other orientation. Only safe for iframes (a canvas would misread touches). */
export function useStage(ref: RefObject<HTMLElement>, opt: { rotate?: boolean } = {}) {
  const [full, setFull] = useState(false), [orient, setOr] = useState<Orient>('auto'), [locked, setLocked] = useState(false);
  const [devP, setDevP] = useState(false), [idle, setIdle] = useState(false), [hint, setHint] = useState('');
  const real = useRef(false), timer = useRef<any>(0), hintT = useRef<any>(0);

  useEffect(() => {
    const mq = matchMedia('(orientation: portrait)'), f = () => setDevP(mq.matches); f();
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, []);

  const lock = useCallback(async (o: Orient) => {
    const so: any = (screen as any).orientation;
    try { if (o === 'auto') { so?.unlock?.(); setLocked(false); } else if (so?.lock) { await so.lock(o); await new Promise(r => setTimeout(r, 500)); setLocked(matchMedia('(orientation: portrait)').matches === (o === 'portrait')); } else setLocked(false); }
    catch { setLocked(false); }
  }, []);

  const exit = useCallback(() => {
    setFull(false); setLocked(false); setIdle(false);
    try { (screen as any).orientation?.unlock?.(); } catch { /* ignore */ }
    if (real.current) { real.current = false; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* ignore */ }); }
  }, []);

  const enter = useCallback(async () => {
    setFull(true);
    const el: any = document.documentElement; // not the box: the browser forces fullscreen elements to ignore transforms, which the rotate fallback needs
    try { const f = el?.requestFullscreen || el?.webkitRequestFullscreen; if (f) { await f.call(el); real.current = true; } } catch { /* the fixed layer still fills the screen */ }
    lock(orientRef.current);
  }, [ref, lock]);
  const orientRef = useRef<Orient>('auto'); orientRef.current = orient;

  const toggle = useCallback(() => { if (full) exit(); else enter(); }, [full, enter, exit]);

  const setOrient = useCallback((o: Orient) => {
    setOr(o); if (full) lock(o);
    clearTimeout(hintT.current); setHint('');
  }, [full, lock]);
  const cycle = useCallback(() => setOrient(NEXT[orient]), [orient, setOrient]);

  // leaving the browser's own fullscreen (Esc, swipe) also leaves ours
  useEffect(() => {
    const fc = () => { if (real.current && !document.fullscreenElement) { real.current = false; exit(); } };
    const key = (ev: KeyboardEvent) => { if (full && ev.key === 'Escape') exit(); };
    document.addEventListener('fullscreenchange', fc); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', fc); document.removeEventListener('keydown', key); };
  }, [full, exit]);

  // page behind does not scroll while full
  useEffect(() => {
    document.documentElement.classList.toggle('vlock', full);
    return () => document.documentElement.classList.remove('vlock');
  }, [full]);
  useEffect(() => () => { try { (screen as any).orientation?.unlock?.(); if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ } }, []);

  // the controls fade while you are playing with it
  useEffect(() => {
    const el = ref.current; if (!el || !full) return;
    const wake = () => { setIdle(false); clearTimeout(timer.current); timer.current = setTimeout(() => setIdle(true), 2600); };
    wake(); el.addEventListener('pointerdown', wake); el.addEventListener('pointermove', wake);
    return () => { el.removeEventListener('pointerdown', wake); el.removeEventListener('pointermove', wake); clearTimeout(timer.current); };
  }, [full, ref]);

  // no lock and no rotate fallback: tell the person to turn the phone themselves
  const mismatch = full && orient !== 'auto' && (orient === 'landscape') === devP;
  const rot = !!opt.rotate && mismatch && !locked;
  useEffect(() => {
    clearTimeout(hintT.current);
    if (mismatch && !locked && !opt.rotate) { setHint('Turn your phone to ' + orient); hintT.current = setTimeout(() => setHint(''), 3500); } else setHint('');
  }, [mismatch, locked, orient, opt.rotate]);

  const cls = 'stagebox' + (full ? ' vfull' : '') + (orient === 'portrait' ? ' op' : orient === 'landscape' ? ' ol' : '') + (rot ? ' vrot' : '');
  return { full, orient, cls, idle, hint, toggle, cycle, setOrient, exit };
}
export type Stage = ReturnType<typeof useStage>;

/** Floating buttons in the corner of the viewer. */
export function StageBar({ st, children }: { st: Stage; children?: React.ReactNode }) {
  const orIcon = st.orient === 'portrait' ? <rect x="8" y="4" width="8" height="16" rx="2" /> : st.orient === 'landscape' ? <rect x="4" y="8" width="16" height="8" rx="2" /> : <><rect x="3" y="9" width="11" height="7" rx="1.5" /><rect x="15" y="5" width="6" height="11" rx="1.5" /></>;
  return <>
    <div className={'stbar' + (st.idle ? ' idle' : '')}>
      {children}
      <button type="button" onClick={st.cycle} aria-label={'Orientation: ' + LABEL[st.orient] + '. Tap to change'} title="Orientation">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>{orIcon}</svg><span>{LABEL[st.orient]}</span>
      </button>
      <button type="button" onClick={st.toggle} aria-label={st.full ? 'Exit full screen' : 'Full screen'} title={st.full ? 'Exit full screen' : 'Full screen'}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>{st.full ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg><span>{st.full ? 'Exit' : 'Full'}</span>
      </button>
    </div>
    {st.hint && <div className="sthint" role="status">{st.hint}</div>}
  </>;
}
