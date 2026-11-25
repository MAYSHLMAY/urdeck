'use client';
import { useEffect, useRef, useState } from 'react';

/* The first-time guide. It is not a slideshow: it floats over the real app, points at the real button, and moves on by itself
   when the person actually does the thing. Each step is a small playing card; the stack on the left shows how many are left. */

const K = 'ud-guide';
export const GUIDE_EVENT = 'ud-guide';
export const startGuide = () => { try { dispatchEvent(new Event(GUIDE_EVENT)); } catch { /* ignore */ } };

type Flags = { graded: boolean };
type Step = { say: string; sub: string; where: RegExp; go: string; target: string; done: (p: string, f: Flags) => boolean };
const has = (s: string) => !!document.querySelector(s);
const STEPS: Step[] = [
  { say: 'Tap Study', sub: 'Your first cards are waiting there.', where: /^\/$/, go: '/study', target: '.dk-go', done: p => p === '/study' },
  { say: 'Pick a card type', sub: 'Start with any type that has cards.', where: /^\/study/, go: '/study', target: '.tp-c:not(:disabled)', done: () => has('.flip, .opts .opt') },
  { say: 'Answer the card', sub: 'Tap Show answer, or pick an option.', where: /^\/study/, go: '/study', target: '.flip .solid.wide | .opts .opt', done: () => has('.grades, #fb .say') },
  { say: 'Now rate it', sub: 'Good is fine. This decides when the card comes back.', where: /^\/study/, go: '/study', target: '.grades .g.sug | .grades .g2 | #fb .g2 | #fb .g0', done: (_p, f) => f.graded },
  { say: 'Go back Home', sub: 'See your streak and today’s goal.', where: /^\/study/, go: '/', target: 'a.sh-ib[href="/"] | .tabbar a[href="/"] | a.sbrand', done: p => p === '/' },
  { say: 'Try the 3D lab', sub: 'Models you can spin and zoom.', where: /^\/$/, go: '/lab', target: '.more a[href^="/lab"] | .modes a[href^="/lab"] | .tabbar a[href^="/lab"] | .slinks a[href^="/lab"]', done: p => p.startsWith('/lab') },
  { say: 'You are set', sub: 'Cards return right on time. The gear icon holds everything else, and you can replay this from Settings.', where: /.*/, go: '', target: '', done: () => false },
];
const EXEMPT = /^\/(play|host|duel|privacy)(\/|$)/;
const path = () => location.pathname.replace(/(.)\/$/, '$1') || '/';
const read = () => { try { const v = localStorage.getItem(K); return v === 'done' ? -1 : v == null ? -2 : +v; } catch { return -1; } };
const write = (v: number | 'done') => { try { localStorage.setItem(K, String(v)); } catch { /* ignore */ } };
const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
/** Try each selector in the order written; the first one that is on screen wins. */
const find = (sel: string): HTMLElement | null => { for (const one of sel.split(' | ')) for (const el of Array.from(document.querySelectorAll<HTMLElement>(one))) if (visible(el)) return el; return null; };

export function Guide() {
  const [i, setI] = useState(-1), [box, setBox] = useState<{ x: number; y: number; w: number; h: number; r: string } | null>(null), [away, setAway] = useState(false), [hide, setHide] = useState(false), [pop, setPop] = useState(0);
  const flags = useRef<Flags>({ graded: false }), shown = useRef(-1);
  useEffect(() => {
    const r = read(); if (r >= 0) setI(Math.min(r, STEPS.length - 1));
    const start = () => { flags.current.graded = false; write(0); setI(0); };
    const click = (e: MouseEvent) => { if ((e.target as HTMLElement)?.closest?.('.grades .g, #fb .g')) flags.current.graded = true; };
    addEventListener(GUIDE_EVENT, start); document.addEventListener('click', click, true);
    return () => { removeEventListener(GUIDE_EVENT, start); document.removeEventListener('click', click, true); };
  }, []);
  useEffect(() => {
    if (i < 0) return;
    let raf = 0, last = '', t0 = Date.now(), alive = true;
    shown.current = -1;
    const tick = () => {
      if (!alive) return;
      const p = path(), s = STEPS[i], off = EXEMPT.test(p) || has('.wl') || document.documentElement.hasAttribute('data-gate-on');
      setHide(h => (h === off ? h : off));
      if (!off && s.go && s.done(p, flags.current)) { const n = i + 1; write(n); setI(n); setPop(v => v + 1); return; }
      const onPath = s.where.test(p), el = s.target ? (onPath ? find(s.target) : find(`a[href="${s.go}"] | a[href="${s.go}/"]`)) : null;
      if (el && !off) {
        if (shown.current !== i) { shown.current = i; const r0 = el.getBoundingClientRect(); if (r0.top < 70 || r0.bottom > innerHeight - 150) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        const r = el.getBoundingClientRect(), key = [r.left, r.top, r.width, r.height].map(Math.round).join();
        if (key !== last) { last = key; setBox({ x: r.left, y: r.top, w: r.width, h: r.height, r: getComputedStyle(el).borderRadius }); }
      } else if (last) { last = ''; setBox(null); }
      setAway(!onPath && !!s.go);
      raf = requestAnimationFrame(tick); void t0;
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [i]);
  if (i < 0 || hide) return null;
  const s = STEPS[i], last = i === STEPS.length - 1, n = STEPS.length - 1;
  const close = () => { write('done'); setI(-1); };
  return (<>
    {box && <div className="gd-ring" style={{ left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12, borderRadius: box.r === '0px' ? '12px' : box.r }} aria-hidden>
      <svg className="gd-hand" viewBox="0 0 32 32" width="34" height="34"><path d="M7 3l17 9.500-7.200 2.300L13.500 22 7 3Z" fill="#fff" stroke="#10131c" strokeWidth="1.8" strokeLinejoin="round" /></svg>
    </div>}
    <aside className={'gd' + (last ? ' fin' : '') + (box && box.y > innerHeight * 0.5 ? ' up' : '')} role="status" aria-live="polite" key={i + ':' + pop}>
      <div className="gd-stack" aria-hidden>{Array.from({ length: n }, (_, k) => <i key={k} className={'gd-c ' + (k < i ? 'out' : k === i ? 'top' : '')} style={{ ['--k' as any]: k }} />)}</div>
      <div className="gd-body">
        <b>{last ? s.say : away ? 'Head over: ' + s.say.toLowerCase() : s.say}</b>
        <small>{s.sub}</small>
      </div>
      <div className="gd-act">
        {last ? <button className="gd-ok" onClick={close}>Done</button> : <>
          <button className="gd-skip" onClick={() => { const k = i + 1; write(k); setI(k); }}>Skip</button>
          <button className="gd-x" onClick={close} aria-label="Hide the guide">Hide</button>
        </>}
      </div>
    </aside>
  </>);
}
