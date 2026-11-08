'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AskHost, Sheet, SheetFrame, Toast, useEngine, Icon, Ic } from './ui';
import { usePoolSync } from './refHooks';
import { Settings } from './Settings';
import { BUILTIN } from '@/lib/models';
import { isOwner } from '@/lib/api';
import { watchLobby } from '@/lib/game/player';
import { SiteNav, Tibeb } from './SiteChrome';

/** The landing page: every category (pool) is a card with its card sets, PDFs and 3D models in one place. */
export default function Home() {
  const e = useEngine(), R = usePoolSync(), router = useRouter();
  const [liveG, setLive] = useState<any[]>([]);
  useEffect(() => watchLobby(g => setLive(g)), []);
  const [mounted, setMounted] = useState(false), [set, setSet] = useState(false), [open, setOpen] = useState<string | null>(null);

  useEffect(() => { setMounted(true); e.init(); if (new URLSearchParams(location.search).get('settings')) { setSet(true); history.replaceState(null, '', '/'); } }, []); // eslint-disable-line
  const o = e.O;
  useEffect(() => {
    document.documentElement.dataset.theme = o.theme === 'auto' ? '' : o.theme;
    document.documentElement.style.setProperty('--fs', ({ s: '14.5px', m: '16px', l: '18px', xl: '20px' } as any)[o.size] || '16px');
  }, [o.theme, o.size]);

  if (!mounted) return <div className="wrap"><p className="info">Loading…</p></div>;

  const c = e.counts(), S = e.S, now = Date.now();
  const live = S.last === e.dayKey(now) || S.last === e.dayKey(e.addDays(e.dayStart(now), -1));
  const model = (id: string) => R.modelCat[id];
  const allModels = [...BUILTIN, ...R.models.filter(m => !BUILTIN.some(b => b.id === m.id))];
  const looseModels = allModels.filter(m => !model(m.id) || !R.category(model(m.id)));
  const hr = new Date().getHours();
  const week = Array.from({ length: 7 }, (_, i) => { const t = e.addDays(e.dayStart(now), i - 6); return { n: (S.log && S.log[e.dayKey(t)]?.n) || 0, d: 'SMTWTFS'[new Date(t).getDay()] }; });
  const wmax = Math.max(1, ...week.map(w => w.n));
  const go = (sel: string) => { e.setSel(sel); router.push('/study'); };
  const cat = open ? R.category(open) : null;

  return (
    <>
      <SiteNav owner={isOwner()} onSettings={() => setSet(true)} />
      <main className="hm">
        <section className="hhero">
          <div className="hl">
            <p className="greet"><span lang="am" className="geez">{hr < 12 ? 'እንደምን አደሩ' : hr < 18 ? 'እንደምን ዋሉ' : 'እንደምን አመሹ'}</span> · {hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}</p>
            <h1>{c.dToday + c.nToday > 0 ? <>{c.dToday + c.nToday} cards are<br />ready for you today</> : <>You are all<br />caught up</>}</h1>
            <p className="lead">Short, regular practice beats long cramming. {c.dToday + c.nToday > 0 ? 'Start where you left off, or choose a topic below.' : 'Come back tomorrow, or revisit a topic below.'}</p>
            <div className="hbtns"><Link className="cta" href="/study">Continue studying <Ic n="arrowR" /></Link><button className="cta2" onClick={() => go('all')}>Whole library · {e.Q.length}</button></div>
            <div className="chips2"><span><b>{c.nToday}</b> new</span><span><b>{c.l}</b> learning</span><span><b>{c.dToday}</b> due</span><span><b>{c.m}</b> mastered</span></div>
          </div>
          <aside className="hr" aria-label="Your progress">
            <div className="ringw">
              <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden><circle cx="60" cy="60" r="50" className="rb" /><circle cx="60" cy="60" r="50" className="rf" strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - (c.tot ? c.m / c.tot : 0))} /></svg>
              <div className="rt"><b>{c.tot ? Math.round(c.m / c.tot * 100) : 0}%</b><small>mastered</small></div>
            </div>
            <div className="streakln"><Ic n="fire" /><b>{live ? S.streak : 0}</b> day streak{e.examInfo() ? <small> · {e.examInfo()}</small> : null}</div>
            <div className="week" aria-label="Answers in the last 7 days">{week.map((w, i) => <div key={i} title={w.n + ' answers'}><i style={{ height: Math.max(4, w.n / wmax * 100) + '%' }} className={w.n ? 'on' : ''} /><small>{w.d}</small></div>)}</div>
          </aside>
        </section>
        <Tibeb />

        <div className="shead"><h2>Categories</h2><span>Each one gathers its cards, PDFs and 3D models</span></div>
        {R.loading && !R.loaded && <p className="info">Loading categories…</p>}
        {R.error && <p className="info">{R.error}</p>}
        <div className="pgrid">
          {R.categories.map(k => {
            const pc = e.poolCount(k.id), np = R.pdfsOf(k.id).length, nm = R.modelsOf(k.id).length;
            return (
              <article className="pcard" key={k.id} style={{ ['--pc' as any]: k.color_theme }}>
                <button className="pmain" onClick={() => setOpen(k.id)} aria-label={'Open ' + k.name}>
                  <span className="pbadge">{k.name.slice(0, 1).toUpperCase()}</span>
                  <b>{k.name}</b>
                  <small>{pc.c} cards · {np} PDF{np === 1 ? '' : 's'} · {nm} model{nm === 1 ? '' : 's'}</small>
                </button>
                <button className="pgo" disabled={!pc.c} onClick={() => go('c:' + k.id)}>Study <Ic n="arrowR" /></button>
              </article>
            );
          })}
        </div>
        {R.loaded && !R.categories.length && (
          <div className="empty2"><Ic n="layers" /><p>No categories yet. As the owner, open the study screen, press <b>R</b> and use the <b>Pools</b> tab to create one, then link PDFs and card sets.</p></div>
        )}

        {liveG.length > 0 && liveG.slice(0, 2).map((g: any) => <Link key={g.pin} className="gbanner" href={'/play?pin=' + g.pin}><Ic n="play" /><b>Live now: {g.title}</b><span>Join</span></Link>)}

        <div className="shead"><h2>Everything in one place</h2><span>Pick how you want to learn today</span></div>
        <div className="fgrid">
          <Link className="fcard" href="/study"><span className="fi"><Ic n="cap" /></span><h3>Study cards</h3><p>Spaced repetition schedules each question just before you forget it. Folders, search, mistakes and a speed round included.</p><em>Open study <Ic n="arrowR" /></em></Link>
          <Link className="fcard" href="/play"><span className="fi"><Ic n="play" /></span><h3>Live quiz</h3><p>Join a classroom game with a PIN. Pick a stick-figure avatar, race the clock and climb the leaderboard.</p><em>Join a game <Ic n="arrowR" /></em></Link>
          <Link className="fcard" href="/lab"><span className="fi"><Ic n="cube" /></span><h3>3D lab</h3><p>Rotate, explode and move control surfaces on {allModels.length} aircraft model{allModels.length === 1 ? '' : 's'} to see how each part works.</p><em>Open the lab <Ic n="arrowR" /></em></Link>
          {isOwner() && <Link className="fcard" href="/host"><span className="fi"><Ic n="star" /></span><h3>Host a quiz</h3><p>Choose card sets, set the timer and points, then start a live game for everyone in the room.</p><em>Host now <Ic n="arrowR" /></em></Link>}
        </div>
        {looseModels.length > 0 && R.categories.length > 0 && <p className="hnote">{looseModels.length} 3D model{looseModels.length === 1 ? ' has' : 's have'} no category yet.</p>}

        <div className="tips">
          <div><b>1 · Answer honestly</b><p>Choose "I don't know" when unsure. It brings the card back sooner.</p></div>
          <div><b>2 · Little and often</b><p>Ten focused minutes a day beats an hour once a week.</p></div>
          <div><b>3 · Read the source</b><p>Open the reference PDF from any card to see the full explanation.</p></div>
        </div>
      </main>

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
