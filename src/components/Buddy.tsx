'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarPicker, randomKid, type Mood } from './game/Avatar';
import { useEngine } from './ui';
import { ANSWERS, GUIDES, canListen, getBuddy, intent, line, listen, setBuddy, speak, useBuddyCfg, type Pers } from '@/lib/buddy';
import { streakInfo, todayCount } from '@/lib/goals';
import { seen } from '@/lib/auth';

const HIDE = /^\/(play|host|duel|privacy)(\/|$)/;
const norm = (p: string) => (p || '/').replace(/\/+$/, '') || '/';
const waitFor = (sel: string, ms: number) => new Promise<HTMLElement | null>(res => {
  const t0 = Date.now(), tick = () => { const el = document.querySelector<HTMLElement>(sel), r = el?.getBoundingClientRect(); if (el && r && r.width > 0) return res(el); if (Date.now() - t0 > ms) return res(null); setTimeout(tick, 120); }; tick();
});
/** Renders in the browser's top layer (above open dialogs) when `pop` is set. It is re-shown on every `k` change so it stays above a dialog that opened after it. */
function Top({ pop, k, className, style, children, role }: { pop: boolean; k: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode; role?: string }) {
  const ref = useRef<HTMLDivElement>(null), [host, setHost] = useState<Element | null>(null);
  // an open modal dialog makes everything outside it unclickable, so while one is open we render inside it
  useEffect(() => { setHost(pop ? document.querySelector('dialog[open]') : null); }, [pop, k]);
  useEffect(() => { const el: any = ref.current; if (!pop || !el || !el.showPopover) return; try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { /* older browsers: normal stacking */ } return () => { try { el.hidePopover(); } catch { /* ignore */ } }; }, [pop, k, host]);
  const node = <div ref={ref} className={className} style={style} role={role} {...(pop ? { popover: 'manual' } as any : {})}>{children}</div>;
  return host ? createPortal(node, host) : node;
}
type R = { x: number; y: number; w: number; h: number };

/** A small animated companion. It greets you, answers simple questions, and walks to the real button when you ask "show me". Rule-based, works offline. */
export function Buddy() {
  const cfg = useBuddyCfg(), path = usePathname() || '/', router = useRouter(), e = useEngine();
  const [mood, setMood] = useState<Mood>('idle'), [bubble, setBubble] = useState(''), [open, setOpen] = useState(false), [offer, setOffer] = useState(''), [txt, setTxt] = useState('');
  const [guide, setGuide] = useState<{ key: string; i: number } | null>(null), [rect, setRect] = useState<R | null>(null), [hop, setHop] = useState(false), [vw, setVw] = useState({ w: 400, h: 800 }), [drag, setDrag] = useState<{ x: number; y: number } | null>(null), [listening, setListening] = useState(false);
  const tm = useRef<any>(0), last = useRef(0), dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null), prev = useRef<{ goal: boolean; streak: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); addEventListener('ud-seen', f); return () => removeEventListener('ud-seen', f); }, []);
  const hidden = !cfg.on || HIDE.test(path) || !seen();

  const say = useCallback((text: string, m: Mood = 'happy', ms = 7500) => {
    clearTimeout(tm.current); setBubble(text); setMood(m); if (getBuddy().voice) speak(text);
    setTimeout(() => setMood('idle'), 1800); tm.current = setTimeout(() => setBubble(''), ms);
  }, []);
  const tod = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'day' : 'evening'; };

  useEffect(() => { const f = () => setVw({ w: innerWidth, h: innerHeight }); f(); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);

  /* proactive lines: once per screen per visit, at most one every 90 seconds */
  useEffect(() => {
    if (hidden || guide) return; const k = 'ud-bd-' + norm(path); let ok = false; try { ok = !sessionStorage.getItem(k); } catch { ok = true; }
    if (!ok || Date.now() - last.current < 90000) return;
    const t = setTimeout(() => {
      try { sessionStorage.setItem(k, '1'); } catch { /* ignore */ }
      const p = getBuddy().pers, p2 = norm(path); last.current = Date.now();
      if (p2 === '/study') return say(line('study', p), 'happy');
      if (p2 === '/lab') return say(line('lab', p), 'wow');
      if (p2 !== '/') return;
      if (!e.ready) return;
      const c = e.counts(), st = streakInfo(e), due = c.dToday + c.nToday;
      if (st.atRisk) return say(line('risk', p, { s: st.n }), 'sad');
      if (due > 0) return say(line('due', p, { n: due }), 'happy');
      say(line('caught', p), 'happy');
    }, 1600);
    return () => clearTimeout(t);
  }, [path, hidden, e.ready, guide]); // eslint-disable-line

  /* reactions: goal reached, streak milestones */
  useEffect(() => {
    if (!e.ready) return; const goal = e.O.dailyGoal || 20, st = streakInfo(e), met = todayCount(e) >= goal, p = prev.current;
    prev.current = { goal: met, streak: st.n };
    if (!p || hidden || guide) return;
    if (met && !p.goal) say(line('goal', getBuddy().pers), 'wow', 9000);
    else if (st.n > p.streak && [3, 7, 14, 30, 60, 100].includes(st.n)) say(line('streak', getBuddy().pers, { s: st.n }), 'wow', 9000);
  }, [e.ver, e.ready]); // eslint-disable-line

  /* now and then a little hop, so it feels alive */
  useEffect(() => { if (hidden) return; const t = setInterval(() => { if (!open && !guide) { setHop(true); setTimeout(() => setHop(false), 800); } }, 38000); return () => clearInterval(t); }, [hidden, open, guide]);

  /* guides */
  const endGuide = useCallback((msg = true) => { setGuide(null); setRect(null); if (msg) say(line('done', getBuddy().pers), 'happy'); }, [say]);
  useEffect(() => {
    if (!guide) return; const g = GUIDES[guide.key], st = g?.steps[guide.i]; if (!st) { setGuide(null); return; }
    let dead = false, raf = 0, el: HTMLElement | null = null; const onClick = () => setTimeout(() => { if (!dead) (guide.i + 1 < g.steps.length ? setGuide({ key: guide.key, i: guide.i + 1 }) : endGuide()); }, 500);
    (async () => {
      if (st.path && norm(path) !== norm(st.path)) router.push(st.path);
      el = await waitFor(st.sel, 5000); if (dead) return;
      if (!el) { if (st.optional) { guide.i + 1 < g.steps.length ? setGuide({ key: guide.key, i: guide.i + 1 }) : endGuide(); return; } setGuide(null); setRect(null); say('I could not find that on this screen. Try again from the home screen.', 'sad'); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.addEventListener('click', onClick, true);
      let lr = '';
      const loop = () => { if (dead || !el) return; const r = el.getBoundingClientRect(), s = [r.left, r.top, r.width, r.height].map(Math.round).join(','); if (s !== lr) { lr = s; setRect({ x: r.left, y: r.top, w: r.width, h: r.height }); } raf = requestAnimationFrame(loop); };
      loop();
    })();
    return () => { dead = true; cancelAnimationFrame(raf); el?.removeEventListener('click', onClick, true); };
  }, [guide]); // eslint-disable-line
  const start = (key: string) => { setOpen(false); setOffer(''); setBubble(''); setMood('happy'); setGuide({ key, i: 0 }); };

  const ask = (t: string) => {
    const s = t.trim(); if (!s) return; setTxt(''); const p = cfg.pers;
    if (/^(hi|hello|hey|selam|hola|yo)\b/i.test(s)) { setOffer(''); return say(line('hello', p, { name: cfg.name }), 'happy', 12000); }
    const it = intent(s);
    if (it) { setOffer(it); say(ANSWERS[it], 'happy', 14000); } else { setOffer(''); say(line('unknown', p), 'sad', 12000); }
  };
  const mic = () => { if (listening) return; setListening(true); listen(t => { setListening(false); ask(t); }, () => { setListening(false); say('I could not hear you. Type it instead?', 'sad'); }); };

  /* dragging */
  const pd = (ev: React.PointerEvent) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); dragRef.current = { sx: ev.clientX, sy: ev.clientY, ox: r.left, oy: r.top, moved: false }; (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); };
  const pm = (ev: React.PointerEvent) => { const d = dragRef.current; if (!d) return; const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy; if (!d.moved && Math.hypot(dx, dy) < 8) return; d.moved = true; setDrag({ x: Math.max(4, Math.min(vw.w - 64, d.ox + dx)), y: Math.max(4, Math.min(vw.h - 64, d.oy + dy)) }); };
  const pu = () => { const d = dragRef.current; dragRef.current = null; if (!d) return; if (d.moved && drag) { setBuddy({ pos: drag }); setDrag(null); } else setOpen(o => !o); };

  if (hidden) return null;
  const S = 60, pos = drag || (guide && rect ? (() => { const above = rect.y > 130; return { x: Math.max(8, Math.min(vw.w - S - 8, rect.x + rect.w / 2 - S / 2)), y: Math.max(8, Math.min(vw.h - S - 8, above ? rect.y - S - 10 : rect.y + rect.h + 10)) }; })() : cfg.pos ? { x: Math.min(cfg.pos.x, vw.w - S - 4), y: Math.min(cfg.pos.y, vw.h - S - 4) } : null);
  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : cfg.side === 'left' ? { left: 12, bottom: 'calc(96px + env(safe-area-inset-bottom))' } : { right: 12, bottom: 'calc(96px + env(safe-area-inset-bottom))' };
  const cx = pos ? pos.x : cfg.side === 'left' ? 12 : vw.w - S - 12, cy = pos ? pos.y : vw.h - 96 - S;
  const bAbove = cy > 170, bRight = cx > vw.w / 2;
  const g = guide ? GUIDES[guide.key] : null, st = g?.steps[guide!.i];
  const cardTop = rect ? rect.y + rect.h / 2 > vw.h / 2 : false;

  return (<>
    {guide && rect && <Top pop k={guide.key + guide.i} className="bd-spot" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />}
    {guide && st && <Top pop k={guide.key + guide.i} className={'bd-card' + (cardTop ? ' top' : '')} role="status"><small>{g!.title} · step {guide.i + 1} of {g!.steps.length}</small><p>{st.text}</p><div><button type="button" onClick={() => endGuide(false)}>Stop</button>{guide.i + 1 < g!.steps.length && <button type="button" className="go" onClick={() => setGuide({ key: guide.key, i: guide.i + 1 })}>Next</button>}</div></Top>}
    <Top pop={!!guide} k={guide ? guide.key + guide.i : ''} className={'bd' + (guide ? ' guiding' : '') + (hop ? ' hop' : '') + (drag ? ' drag' : '')} style={style}>
      {(bubble || open) && !guide && (
        <div className={'bd-bubble' + (bAbove ? '' : ' below') + (bRight ? ' r' : ' l')} role="dialog" aria-label={cfg.name + ' the buddy'}>
          {bubble && <p>{bubble}</p>}
          {open && <>
            {!bubble && <p>{line('hello', cfg.pers, { name: cfg.name })}</p>}
            {offer && <div className="bd-chips"><button type="button" className="go" onClick={() => start(offer)}>Show me how</button></div>}
            <div className="bd-chips">{Object.entries(GUIDES).map(([k, v]) => <button key={k} type="button" onClick={() => start(k)}>{v.title}</button>)}</div>
            <form onSubmit={ev => { ev.preventDefault(); ask(txt); }}>
              <input value={txt} onChange={ev => setTxt(ev.target.value)} placeholder={'Ask ' + cfg.name + '…'} maxLength={80} aria-label={'Ask ' + cfg.name} />
              {canListen() && <button type="button" className={'mic' + (listening ? ' on' : '')} onClick={mic} aria-label="Speak">{listening ? '…' : '🎤'}</button>}
              <button type="submit" className="go">Ask</button>
            </form>
            <button type="button" className="bd-x" onClick={() => { setOpen(false); setBubble(''); }} aria-label="Close">×</button>
          </>}
        </div>
      )}
      <button type="button" className="bd-ch" onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={() => { dragRef.current = null; setDrag(null); }} aria-label={'Talk to ' + cfg.name}>
        <Avatar av={cfg.av} size={S} mood={mood} />
      </button>
    </Top>
  </>);
}

/** Settings → Buddy */
export function BuddyCard() {
  const c = useBuddyCfg(), SEG = (v: string, o: [string, string][], f: (k: string) => void) => <div className="ap-seg">{o.map(([k, l]) => <button key={k} type="button" className={v === k ? 'on' : ''} onClick={() => f(k)}>{l}</button>)}</div>;
  const [look, setLook] = useState(false);
  return (
    <section className="scard ap"><h4>Buddy</h4>
      <label className="bd-row"><span><b>Show the buddy</b><small>A small helper that greets you and shows you around</small></span><input type="checkbox" checked={c.on} onChange={ev => setBuddy({ on: ev.target.checked })} /></label>
      {c.on && <>
        <div className="bd-me"><Avatar av={c.av} size={64} /><div><input className="wl-in" value={c.name} maxLength={14} aria-label="Buddy name" onChange={ev => setBuddy({ name: ev.target.value.replace(/[<>]/g, '') || 'Zee' })} />
          <div className="bd-btns"><button type="button" className="wl-btn" onClick={() => setBuddy({ av: randomKid() })}>Shuffle</button><button type="button" className={'wl-btn' + (look ? ' pri' : '')} onClick={() => setLook(v => !v)}>Customize</button></div></div></div>
        {look && <div className="wl-look"><AvatarPicker value={c.av} onChange={v => setBuddy({ av: v })} /></div>}
        <label className="ap-l">Personality</label>{SEG(c.pers, [['cheer', 'Cheerful'], ['calm', 'Calm'], ['brief', 'Short']], k => setBuddy({ pers: k as Pers }))}
        <label className="ap-l">Side</label>{SEG(c.side, [['right', 'Right'], ['left', 'Left']], k => setBuddy({ side: k as 'left' | 'right', pos: null }))}
        <label className="bd-row"><span><b>Speak out loud</b><small>Uses your device's voice. English works best</small></span><input type="checkbox" checked={c.voice} onChange={ev => { setBuddy({ voice: ev.target.checked }); if (ev.target.checked) speak('Hi, I am ' + c.name); }} /></label>
        {c.pos && <button type="button" className="wl-btn" style={{ marginTop: 8 }} onClick={() => setBuddy({ pos: null })}>Put the buddy back in its corner</button>}
      </>}
    </section>
  );
}
