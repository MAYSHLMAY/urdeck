'use client';
import { openStreak } from './Streak';
import { readerStore } from '@/lib/reader';
import { labs } from '@/lib/prefs';
import { FieldPill } from './Fields';
import { applyLook, getHome, type HomeCfg } from '@/lib/look';
import { useMe } from './Welcome';
import { useSyncExternalStore } from 'react';
import { HomeCustomize } from './HomeCustomize';
import { clozeFront, activeCloze, stripKind, kindOf } from '@/lib/kind';

let _hs = '', _hv: HomeCfg = getHome();
function useHomeCfg(): HomeCfg {
  const snap = () => { try { const j = JSON.stringify(getHome()); if (j !== _hs) { _hs = j; _hv = JSON.parse(j); } } catch { /* ignore */ } return _hv; };
  return useSyncExternalStore(f => { addEventListener('ud-home', f); return () => removeEventListener('ud-home', f); }, snap, () => _hv);
}
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AskHost, Sheet, SheetFrame, Toast, useEngine, Icon, Ic } from './ui';
import { usePoolSync } from './refHooks';
import { Settings } from './Settings';
import { BUILTIN } from '@/lib/models';
import { isOwner } from '@/lib/api';
import { watchLobby } from '@/lib/game/player';
import { scheduleReminder } from '@/lib/remind';
import { openListen } from './Listen';
import { patterns } from '@/lib/ai/smart';
import { badges, newBadges, todayCount, weakTopics, overconfident, sprintIds, streakInfo } from '@/lib/goals';
import { SiteNav } from './SiteChrome';

/** The landing page: every category (pool) is a card with its card sets, PDFs and 3D models in one place. */
/** Tap a deck card: it grows to fill the screen while the study page opens underneath, then melts away (no flash, no reload feel). */
function zoomInto(el: HTMLElement, go: () => void) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !el.animate) { go(); return; }
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), d = document.documentElement;
    const o = el.cloneNode(true) as HTMLElement;
    Object.assign(o.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', zIndex: '2147483000', transform: 'none', transition: 'none', pointerEvents: 'none', boxShadow: 'none' });
    o.removeAttribute('aria-label'); o.setAttribute('aria-hidden', 'true');
    const rot = (cs.getPropertyValue('--r') || '0deg').trim();
    document.body.appendChild(o);
    const kids = Array.from(o.children) as HTMLElement[], rad = cs.borderRadius || '24px';
    const bg = getComputedStyle(document.body).backgroundColor;
    kids.forEach(k => k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards', easing: 'ease-out' }));
    const grow = o.animate([
      { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: rad, transform: `rotate(${rot})`, backgroundColor: cs.backgroundColor },
      { left: '0px', top: '0px', width: '100vw', height: '100dvh', borderRadius: '0px', transform: 'rotate(0deg)', backgroundColor: bg }
    ], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    d.classList.add('zin');
    let done = false;
    const finish = () => { if (done) return; done = true; o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished.finally(() => { o.remove(); setTimeout(() => d.classList.remove('zin'), 250); }); };
    setTimeout(go, 120); // start loading the study page while the card is still growing
    setTimeout(() => { const t0 = Date.now(), tick = () => { if (location.pathname.replace(/\/$/, '') === '/study' && document.querySelector('.card') || Date.now() - t0 > 900) finish(); else requestAnimationFrame(tick); }; tick(); }, 230);
  } catch { go(); }
}

export default function Home() {
  const e = useEngine(), R = usePoolSync(), router = useRouter();
  const [liveG, setLive] = useState<any[]>([]);
  useEffect(() => watchLobby(g => setLive(g)), []);
  const home = useHomeCfg(), me = useMe(), [cz, setCz] = useState(false);
  useEffect(() => { const f = () => setCz(true); addEventListener('ud-arrange', f); return () => removeEventListener('ud-arrange', f); }, []);
  /* phones: Home is three tabs you can swipe between (Today, Progress, Library) instead of one long page */
  const [phone, setPhone] = useState(false), [ptab, setPtab] = useState<'today' | 'progress' | 'library'>('today'), [dir, setDir] = useState(1), [rot, setRot] = useState(0);
  useEffect(() => { const m = matchMedia('(max-width: 899px)'), f = () => setPhone(m.matches); f(); m.addEventListener('change', f); try { const t = sessionStorage.getItem('ud-htab'); if (t === 'progress' || t === 'library') setPtab(t); } catch { /* ignore */ } return () => m.removeEventListener('change', f); }, []);
  const [mounted, setMounted] = useState(false), [set, setSet] = useState(false), [open, setOpen] = useState<string | null>(null);

  useEffect(() => { setMounted(true); e.init(); if (e.typeChosen || e.kindSel !== 'all') e.resetType(); if (new URLSearchParams(location.search).get('settings')) { setSet(true); history.replaceState(null, '', '/'); } }, []); // eslint-disable-line
  const o = e.O;
  useEffect(() => {
    applyLook({ t: o.theme });
    document.documentElement.style.setProperty('--fs', ({ s: '14.5px', m: '16px', l: '18px', xl: '20px' } as any)[o.size] || '16px');
    const d = document.documentElement; o.readable ? d.setAttribute('data-read', '1') : d.removeAttribute('data-read'); o.contrast ? d.setAttribute('data-contrast', '1') : d.removeAttribute('data-contrast');
  }, [o.theme, o.size, o.readable, o.contrast]);

  useEffect(() => { if (mounted && e.ready) scheduleReminder(e); }, [mounted, e.ready, e.ver]); // eslint-disable-line
  useEffect(() => { try { if (!mounted || !e.ready) return; newBadges(e).forEach(b => e.toast('Badge earned: ' + b.title)); } catch { /* ignore */ } }, [mounted, e.ver]); // eslint-disable-line

  if (!mounted) return <div className="wrap"><p className="info">Loading…</p></div>;

  const c = e.counts(), S = e.S, now = Date.now();
  let live = false; for (let k = 0; k <= 1 + (S.freeze || 0); k++) if (S.last === e.dayKey(e.addDays(e.dayStart(now), -k))) live = true;
  const st = streakInfo(e), goal = e.O.dailyGoal || 20, tc = todayCount(e), gp = Math.min(1, tc / goal), bs = badges(e), wk = weakTopics(e);
  const model = (id: string) => R.modelCat[id];
  const allModels = [...BUILTIN, ...R.models.filter(m => !BUILTIN.some(b => b.id === m.id))];
  const looseModels = allModels.filter(m => !model(m.id) || !R.category(model(m.id)));
  const hr = new Date().getHours(), todo = c.dToday + c.nToday;
  const week = Array.from({ length: 7 }, (_, i) => { const t = e.addDays(e.dayStart(now), i - 6); return { n: (S.log && S.log[e.dayKey(t)]?.n) || 0, d: 'SMTWTFS'[new Date(t).getDay()], today: i === 6 }; });
  const left = Math.max(0, goal - tc), pct = c.tot ? Math.round(c.m / c.tot * 100) : 0;
  const msg = tc >= goal ? 'Goal reached. Great work, anything more is a bonus.'
    : tc > 0 ? `${left} more to hit today's goal.`
    : st.atRisk ? `Answer 1 card to keep your ${st.n}-day streak alive.`
    : 'Answer just 5 cards to start a streak.';
  const wmax = Math.max(1, ...week.map(w => w.n));
  const sprint = () => { const ids = sprintIds(e); if (!ids.length) { e.toast('No weak spots yet. Answer some cards first.'); return; } e.startSpeed(ids, 300); router.push('/study'); };
  const go = (sel: string) => { e.setSel(sel); router.push('/study'); };
  const cat = open ? R.category(open) : null;

  const tod = hr < 12 ? 'morning' : hr < 18 ? 'day' : 'evening', first = me ? me.name.split(' ')[0] : '';
  const TIPS = ['Short sessions beat long ones. Ten minutes a day wins.', 'Say the answer out loud before you flip the card.', 'Sleep after studying locks memories in.', 'Mix topics: it feels harder and works better.', 'Wrong answers teach the most. Keep them.', 'Explain a card to an imaginary friend.', 'Start with your weakest topic while you are fresh.'];
  const tip = TIPS[Math.floor(now / 864e5) % TIPS.length];
  const nLeech = e.leeches().length;
  const lastRead = (() => { const r = readerStore().recent(1)[0]; const d = r ? R.pdf(r.id) : null; return r && d ? { id: r.id, t: d.title, p: r.p } : null; })();
  const lastLab = (() => { const id = labs.recent(1)[0]; return id ? allModels.find(m => m.id === id) : undefined; })();
  const COL = ['#5B5BD6', '#E5533C', '#16A064', '#E2A21B'];
  const plainQ = (q: string) => { let t = stripKind(q); if (kindOf(q) === 'c') t = clozeFront(t, activeCloze(t), '____'); t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return t.length > 84 ? t.slice(0, 81).trim() + '...' : t; };
  const deckRaw = e.upNext(4), deckCards = deckRaw.map((_, i) => deckRaw[(i + rot) % deckRaw.length]).map((q, i) => ({ id: q.id, lab: q.s || q.t || 'Card', text: plainQ(q.q) || 'Picture card', col: COL[i] }));
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const card = (x: any, cls: string) => {
    const inner = <><span className="uc-i"><Ic n={x.ic} /></span>{x.b && <span className="uc-b">{x.b}</span>}<b className="uc-t">{x.t}</b><span className="uc-d">{x.d}</span><Ic n={x.ic} className="uc-wm" /></>;
    const st = { ['--c' as any]: x.c };
    return x.href ? <Link key={x.id} href={x.href} className={'uc ' + cls} style={st}>{inner}</Link> : <button key={x.id} type="button" className={'uc ' + cls} style={st} onClick={x.fn}>{inner}</button>;
  };
  const MODES = [
    { id: 'study', t: 'Study', d: 'Review what is due', c: '#5B5BD6', ic: 'cap', href: '/study' },
    { id: 'sprint', t: 'Quick sprint', d: '5 minutes on weak spots', c: '#E2A21B', ic: 'bolt', fn: sprint },
    { id: 'exam', t: 'Exam mode', d: 'Timed, no hints', c: '#E5533C', ic: 'clock', href: '/exam' },
    { id: 'listen', t: 'Listen', d: 'Hear your cards read aloud', c: '#16A064', ic: 'play', fn: openListen }
  ].filter(x => home.short.includes(x.id));
  const MORE = [
    { id: 'quiz', t: 'Live quiz', d: 'Play along with friends', b: 'Live', c: '#0B7BC4', ic: 'play', href: '/play' },
    { id: 'read', t: 'Reader', d: lastRead ? lastRead.t + ' · p. ' + lastRead.p.page : 'Read your PDFs, no cards needed', b: lastRead ? 'Resume' : 'PDF', c: '#D6453D', ic: 'file', href: lastRead ? '/read?pdf=' + encodeURIComponent(lastRead.id) : '/read' },
    { id: 'lab', t: '3D lab', d: lastLab ? 'Continue: ' + lastLab.name : 'Models and simulations', b: lastLab ? 'Resume' : 'New', c: '#8250DF', ic: 'cube', href: lastLab ? '/lab#' + encodeURIComponent(lastLab.id) : '/lab' },
    { id: 'duel', t: 'Challenge', d: 'Duel a friend on your cards', b: 'Hot', c: '#E5533C', ic: 'trophy', href: '/duel' },
    { id: 'leech', t: 'Leech Lab', d: nLeech ? nLeech + ' stuck card' + (nLeech === 1 ? '' : 's') + ' to treat' : 'Fix cards that keep slipping', b: nLeech ? String(nLeech) : 'Fix', c: '#F07B2B', ic: 'flag', href: '/leeches' },
    ...(isOwner() ? [{ id: 'host', t: 'Host', d: 'Run a live game', b: 'Owner', c: '#E2A21B', ic: 'star', href: '/host' }] : [])
  ].filter(x => home.short.includes(x.id));
  const SEC: Record<string, React.ReactNode> = {
    today: (<>
        <section className={'dk' + (home.hero === 'compact' ? ' compact' : '')} data-tod={tod}>
          <div className="dk-top">
            <p className="dk-hi">{greet}{first ? ', ' + first : ''}</p>
            <div className="dk-tools">
              <button type="button" className="dk-ib" onClick={() => setCz(true)} aria-label="Customize home"><Ic n="sliders" /></button>
              <button type="button" className="dk-ib av" onClick={() => setSet(true)} aria-label="Settings">{me?.pic ? <img src={me.pic} alt="" referrerPolicy="no-referrer" /> : <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5" /></svg>}</button>
            </div>
          </div>
          <FieldPill className="dk-field" />
          <h1 className="dk-h">Your memory is on <em>deck</em> today.</h1>
          <p className="dk-sub">{todo > 0 ? <><b>{todo}</b> card{todo === 1 ? '' : 's'} to review. </> : 'Nothing due right now. '}{msg}</p>
          {home.hero === 'deck' && (
            <div className="dk-fan" onTouchStart={ev => { const t = ev.touches[0]; (ev.currentTarget as any)._s = [t.clientX, t.clientY]; }} onTouchEnd={ev => { const a = (ev.currentTarget as any)._s, t = ev.changedTouches[0]; if (!a || deckRaw.length < 2) return; const dx = t.clientX - a[0]; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(t.clientY - a[1])) { (ev.currentTarget as any)._sw = Date.now(); setRot(r => (r + (dx < 0 ? 1 : deckRaw.length - 1)) % deckRaw.length); try { navigator.vibrate?.(6); } catch { /* ignore */ } } }}>
              {deckCards.length ? deckCards.map((d, i) => (
                <button type="button" key={d.id} className={'dk-c c' + i} aria-label={'Study this card: ' + d.text} onClick={ev => { e.openCard(d.id); zoomInto(ev.currentTarget, () => router.push('/study')); }}><small>{d.lab}</small><b>{d.text}</b><span>Card {i + 1} of {Math.max(todo, deckCards.length)}</span></button>
              )) : <Link href="/study" className="dk-c c0"><small>Your deck</small><b>Add your first cards to start studying.</b><span>Card 1 of 1</span></Link>}
            </div>
          )}
          <div className="dk-bar">
            <Link className="dk-go" href="/study">{todo > 0 ? (tc > 0 ? 'Continue' : 'Start') : 'Browse cards'} <Ic n="arrowR" /></Link>
            <div className={'dk-ring' + (gp >= 1 ? ' met' : '')} role="img" aria-label={"Today's goal: " + tc + ' of ' + goal}>
              <svg viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r="50" className="rb" /><circle cx="60" cy="60" r="50" className="rf" strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - gp)} /></svg>
              <span>{gp >= 1 ? <Ic n="check" /> : <b>{tc}</b>}</span>
            </div>
            <div className="dk-gl"><b>{tc}<i>/{goal}</i></b><small>today</small></div>
            <span className="dk-st"><Ic n="fire" /><b>{st.n}</b><small>day streak</small></span>
          </div>
          {home.tip && <p className="dk-tip">{tip}</p>}
        </section>
    </>),
    stats: (<>
        <div className="tstats">
          <div className="tstat n"><b>{c.nToday}</b><span>New</span><Ic n="sparkle" className="uc-wm" /></div>
          <div className="tstat l"><b>{c.l}</b><span>Learning</span><Ic n="clock" className="uc-wm" /></div>
          <div className="tstat d"><b>{c.dToday}</b><span>Due</span><Ic n="target" className="uc-wm" /></div>
        </div>
    </>),
    shortcuts: (<>
        {MODES.length > 0 && <><div className="shead"><h2>Study modes</h2></div><nav className={'modes' + (home.qa === 'row' ? ' row' : '')} aria-label="Study modes">{MODES.map(x => card(x, 'glow'))}</nav></>}
        {MORE.length > 0 && <><div className="shead" style={{ marginTop: MODES.length ? 18 : 0 }}><h2>Explore</h2></div><nav className="more" aria-label="More">{MORE.map(x => card(x, ''))}</nav></>}
    </>),
    progress: (<>
        <section className="panel">
          <button type="button" className="streakln" onClick={openStreak} aria-label="Streak details"><Ic n="fire" /><b>{st.n}</b> day streak{st.atRisk ? <small className="risk">study today to keep it</small> : st.done ? <small className="okk">done for today</small> : null}{(S.freeze || 0) > 0 ? <small className="fz"><Ic n="snow" /> {S.freeze} freeze{S.freeze > 1 ? 's' : ''}</small> : null}{e.examInfo() ? <small> · {e.examInfo()}</small> : null}<span className="stk-go" aria-hidden><Ic n="chevR" /></span></button>
          <div className="goalbar" aria-label="Daily goal"><div><i style={{ width: gp * 100 + '%' }} className={gp >= 1 ? 'full' : ''} /></div><span>{tc >= goal ? 'Goal reached!' : tc + ' / ' + goal + ' today'}</span></div>
          <div className="week" aria-label="Answers in the last 7 days">{week.map((w, i) => <div key={i} className={w.today ? 'td' : ''} title={w.n + ' answers'}><i style={{ height: w.n ? Math.max(14, w.n / wmax * 100) + '%' : undefined, animationDelay: i * 50 + 'ms' }} className={(w.n ? 'on' : 'z') + (w.n >= goal ? ' hit' : '')} /><small>{w.d}</small></div>)}</div>
          <p className="wnote">{pct}% mastered · {c.tot - c.m} to go</p>
        </section>
    </>),
    mistakes: (<>
        {overconfident(e).length > 0 && <div className="oc uc" style={{ ['--c' as any]: 'var(--bad)' }}><span className="uc-i"><Ic n="flag" /></span><span className="oc-t"><b>{overconfident(e).length} card{overconfident(e).length === 1 ? '' : 's'}</b> you were sure about but got wrong</span><button type="button" className="solid" onClick={() => { e.startPracticeIds(overconfident(e)); router.push('/study'); }}>Fix them</button><Ic n="flag" className="uc-wm" /></div>}
        {e.O.smart !== false && (() => { const pt = patterns(e, Object.keys(e.MIS)); return pt.length ? <>
          <div className="shead"><h2>Patterns in your mistakes</h2><span>Cards you confuse together</span></div>
          <div className="pats">{pt.map((p, k) => <button key={k} className="pat" onClick={() => { try { e.startPracticeIds(p.ids); } catch { e.toast('Could not start that practice.'); return; } router.push('/study'); }}><b>{p.label}</b><small>{p.ids.length} cards · practice together</small></button>)}</div>
        </> : null; })()}
    </>),
    needs: (<>
        {wk.length > 0 && <>
          <div className="shead"><h2>Needs work</h2><span>Based on your answers</span></div>
          <div className="insights">{wk.map(w => <button key={w.s} className="ins" onClick={() => go(w.s)}><div><b>{w.label}</b><small>{Math.round(w.acc * 100)}% right · {w.tried} tries{w.missed ? ' · ' + w.missed + ' missed' : ''}</small></div><span className="meter"><i style={{ width: Math.round(w.acc * 100) + '%' }} /></span><Ic n="arrowR" /></button>)}</div>
        </>}
    </>),
    badges: (<>
        <div className="shead"><h2>Badges</h2><span>{bs.filter(b => b.have).length} of {bs.length}</span></div>
        <div className="badges">{bs.map(b => <div key={b.id} className={'bdg' + (b.have ? ' on' : '')} title={b.desc}><i><Ic n={b.icon} /></i><b>{b.title}</b><small>{b.have ? 'Earned' : b.cur + ' / ' + b.need}</small></div>)}</div>
    </>),
    topics: (<>
        <div className="shead"><h2>Topics</h2><span>Cards, PDFs and 3D models</span></div>
        {R.loading && !R.loaded && <p className="info">Loading topics…</p>}
        {R.error && <p className="info">{R.error}</p>}
        <div className="topics">
          {R.categories.map(k => {
            const pc = e.poolCount(k.id), np = R.pdfsOf(k.id).length, nm = R.modelsOf(k.id).length;
            return (
              <article className="tcard" key={k.id} style={{ ['--pc' as any]: k.color_theme }}>
                <button className="tmain" onClick={() => setOpen(k.id)} aria-label={'Open ' + k.name}>
                  <span className="tbadge">{k.name.slice(0, 1).toUpperCase()}</span>
                  <div><b>{k.name}</b><small>{pc.c} cards · {np} PDF{np === 1 ? '' : 's'} · {nm} model{nm === 1 ? '' : 's'}</small></div>
                </button>
                <button className="tbtn" disabled={!pc.c} onClick={() => go('c:' + k.id)}>Study <Ic n="arrowR" /></button>
                <Ic n="layers" className="uc-wm" />
              </article>
            );
          })}
        </div>
        {R.loaded && !R.categories.length && (
          <div className="empty2"><Ic n="layers" /><p>No topics yet. As the owner, open the study screen, press <b>R</b> and use the <b>Pools</b> tab to create one, then link PDFs and card sets.</p></div>
        )}
        {looseModels.length > 0 && R.categories.length > 0 && <p className="hnote">{looseModels.length} 3D model{looseModels.length === 1 ? ' has' : 's have'} no category yet.</p>}
    </>)
  };

  return (
    <>
      <SiteNav owner={isOwner()} onSettings={() => setSet(true)} />
      <main className={'hm' + (home.cols === 2 ? ' two' : '')}>
        {liveG.length > 0 && liveG.slice(0, 2).map((g: any) => <Link key={g.pin} className="livebn" href={'/play?pin=' + g.pin}><i className="pulse" /><b>Live now: {g.title}</b><span>Join</span></Link>)}

        {(() => {
          const GROUPS: Record<string, string[]> = { today: ['today', 'stats', 'shortcuts'], progress: ['progress', 'mistakes', 'needs', 'badges'], library: ['topics'] };
          const vis = (id: string) => !home.hidden.includes(id);
          const tabs = (['today', 'progress', 'library'] as const).filter(t => GROUPS[t].some(vis));
          const cur = tabs.includes(ptab) ? ptab : tabs[0];
          const go2 = (t: 'today' | 'progress' | 'library') => { if (t === cur) return; setDir(tabs.indexOf(t) > tabs.indexOf(cur) ? 1 : -1); setPtab(t); try { sessionStorage.setItem('ud-htab', t); } catch { /* ignore */ } try { navigator.vibrate?.(8); } catch { /* ignore */ } scrollTo({ top: 0 }); };
          const swipe = { x: 0, y: 0, ok: false };
          const L: Record<string, string> = { today: 'Today', progress: 'Progress', library: 'Library' };
          const list = phone ? home.order.filter(id => vis(id) && GROUPS[cur].includes(id)) : home.order.filter(vis);
          return (
            <>
              {phone && tabs.length > 1 && (
                <div className="htabs" role="tablist" aria-label="Home sections" style={{ ['--n' as any]: tabs.length, ['--k' as any]: tabs.indexOf(cur) }}>
                  <i aria-hidden />
                  {tabs.map(t => <button key={t} type="button" role="tab" aria-selected={t === cur} className={t === cur ? 'on' : ''} onClick={() => go2(t)}>{L[t]}</button>)}
                </div>
              )}
              <div key={phone ? cur : 'all'} className={'hsecs' + (phone ? ' ptab ' + (dir > 0 ? 'fwd' : 'back') : '')}
                onTouchStart={ev => { if (!phone) return; const t = ev.touches[0], el = ev.target as HTMLElement; swipe.x = t.clientX; swipe.y = t.clientY; swipe.ok = !el.closest('.dk-fan,.modes.row,.topics,.week,input,textarea,select,dialog'); }}
                onTouchEnd={ev => { if (!phone || !swipe.ok) return; const t = ev.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) { const i = tabs.indexOf(cur) + (dx < 0 ? 1 : -1); if (tabs[i]) go2(tabs[i]); } }}>
                {list.map((id, ix) => (
                  <div key={id} className={'hsx s-' + id} style={{ ['--i' as any]: ix }}>{SEC[id]}</div>
                ))}
              </div>
            </>
          );
        })()}
        <button type="button" className="hcustom" onClick={() => setCz(true)}><Ic n="sliders" /> Customize home</button>
      </main>
      <HomeCustomize open={cz} onClose={() => setCz(false)} cfg={home} />

      <Sheet open={!!cat} onClose={() => setOpen(null)} className="sheet">
        {cat && (
          <SheetFrame title={<span className="ttl"><i className="pdot" style={{ background: cat.color_theme }} />{cat.name}</span>} onClose={() => setOpen(null)}>
            <div className="sc">
              <div className="row"><button className="solid" disabled={!e.poolCount(cat.id).c} onClick={() => { setOpen(null); go('c:' + cat.id); }}>Study {e.poolCount(cat.id).c} cards</button></div>
              <h4 className="dh">PDFs</h4>
              {R.pdfsOf(cat.id).map(p => p.local ? <button className="frow" key={p.id} onClick={() => R.openPdf(p.id, 1, null, cat.id)}><span className="ic"><Ic n="file" /></span><span className="tx"><b>{p.title}</b></span></button> : <a className="frow" key={p.id} href={R.url(p) || '#'} target="_blank" rel="noreferrer"><span className="ic"><Ic n="file" /></span><span className="tx"><b>{p.title}</b></span></a>)}
              {!R.pdfsOf(cat.id).length && <p className="n">No PDFs linked.</p>}
              <h4 className="dh">3D models</h4>
              {R.modelsOf(cat.id).map(m => <Link className="frow" key={m.id} href={'/lab#' + encodeURIComponent(m.id)}><span className="ic"><Ic n="cube" /></span><span className="tx"><b>{m.name}</b><small>{m.sub || ''}</small></span></Link>)}
              {allModels.filter(m => model(m.id) === cat.id && BUILTIN.some(b => b.id === m.id)).map(m => <Link className="frow" key={m.id} href={'/lab#' + m.id}><span className="ic"><Ic n="cube" /></span><span className="tx"><b>{m.name}</b></span></Link>)}
              {!allModels.some(m => model(m.id) === cat.id) && <p className="n">No 3D models linked.</p>}
              <h4 className="dh">Card sets</h4>
              <p className="n">{e.poolCount(cat.id).sets} set{e.poolCount(cat.id).sets === 1 ? '' : 's'} linked. Link sets from the Pools tab while studying.</p>
            </div>
          </SheetFrame>
        )}
      </Sheet>

      <Settings open={set} onClose={() => setSet(false)} />
      <AskHost />
      <Toast />
    </>
  );
}
