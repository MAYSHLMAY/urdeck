'use client';
import { applyLook } from '@/lib/look';
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
export default function Home() {
  const e = useEngine(), R = usePoolSync(), router = useRouter();
  const [liveG, setLive] = useState<any[]>([]);
  useEffect(() => watchLobby(g => setLive(g)), []);
  const [mounted, setMounted] = useState(false), [set, setSet] = useState(false), [open, setOpen] = useState<string | null>(null);

  useEffect(() => { setMounted(true); e.init(); if (new URLSearchParams(location.search).get('settings')) { setSet(true); history.replaceState(null, '', '/'); } }, []); // eslint-disable-line
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

  return (
    <>
      <SiteNav owner={isOwner()} onSettings={() => setSet(true)} />
      <main className="hm">
        <header className="hhead">
          <div>
            <p><span lang="am" className="geez">{hr < 12 ? 'እንደምን አደሩ' : hr < 18 ? 'እንደምን ዋሉ' : 'እንደምን አመሹ'}</span> · {hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}</p>
            <h1>{todo > 0 ? 'Ready to learn?' : 'All caught up'}</h1>
          </div>
          <button className="avatar" onClick={() => setSet(true)} aria-label="Settings"><Ic n="sliders" /></button>
        </header>

        <section className="today">
          <div>
            <small>{todo > 0 ? 'Today' : 'Nothing due'}</small>
            <h2>{todo > 0 ? <>{todo} card{todo === 1 ? '' : 's'}<br />to review</> : <>Come back<br />tomorrow</>}</h2>
            <p className="tmsg">{msg}</p>
            <Link className="go" href="/study">{todo > 0 ? (tc > 0 ? 'Continue' : 'Start') : 'Browse cards'} <Ic n="arrowR" /></Link>
          </div>
          <div className="ringw" aria-label="Today's goal">
            <svg viewBox="0 0 120 120" aria-hidden><circle cx="60" cy="60" r="50" className="rb" /><circle cx="60" cy="60" r="50" className="rf" strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - gp)} /></svg>
            <div className="rt">{gp >= 1 ? <b><Ic n="check" /></b> : <b>{tc}<span>/{goal}</span></b>}<small>{gp >= 1 ? 'goal met' : 'today'}</small></div>
          </div>
        </section>

        <div className="tstats">
          <div className="tstat n"><b>{c.nToday}</b><span>New</span></div>
          <div className="tstat l"><b>{c.l}</b><span>Learning</span></div>
          <div className="tstat d"><b>{c.dToday}</b><span>Due</span></div>
        </div>

        <nav className="qa" aria-label="Shortcuts">
          <Link href="/study"><i><Ic n="cap" /></i>Study</Link>
          <Link href="/play"><i><Ic n="play" /></i>Quiz</Link>
          <Link href="/lab"><i><Ic n="cube" /></i>3D lab</Link>
          <Link href="/exam"><i><Ic n="clock" /></i>Exam</Link>
          <Link href="/duel"><i><Ic n="trophy" /></i>Challenge</Link>
          <button onClick={sprint}><i><Ic n="bolt" /></i>5-min sprint</button>
          <button onClick={openListen}><i><Ic n="bell" /></i>Listen</button>
          {isOwner() && <Link href="/host"><i><Ic n="star" /></i>Host</Link>}
        </nav>

        {liveG.length > 0 && liveG.slice(0, 2).map((g: any) => <Link key={g.pin} className="livebn" href={'/play?pin=' + g.pin}><i className="pulse" /><b>Live now: {g.title}</b><span>Join</span></Link>)}

        <section className="panel">
          <div className="streakln"><Ic n="fire" /><b>{st.n}</b> day streak{st.atRisk ? <small className="risk">study today to keep it</small> : st.done ? <small className="okk">done for today</small> : null}{(S.freeze || 0) > 0 ? <small className="fz"><Ic n="snow" /> {S.freeze} freeze{S.freeze > 1 ? 's' : ''}</small> : null}{e.examInfo() ? <small> · {e.examInfo()}</small> : null}</div>
          <div className="goalbar" aria-label="Daily goal"><div><i style={{ width: gp * 100 + '%' }} className={gp >= 1 ? 'full' : ''} /></div><span>{tc >= goal ? 'Goal reached!' : tc + ' / ' + goal + ' today'}</span></div>
          <div className="week" aria-label="Answers in the last 7 days">{week.map((w, i) => <div key={i} className={w.today ? 'td' : ''} title={w.n + ' answers'}><i style={{ height: w.n ? Math.max(14, w.n / wmax * 100) + '%' : undefined, animationDelay: i * 50 + 'ms' }} className={(w.n ? 'on' : 'z') + (w.n >= goal ? ' hit' : '')} /><small>{w.d}</small></div>)}</div>
          <p className="wnote">{pct}% mastered · {c.tot - c.m} to go</p>
        </section>

        {overconfident(e).length > 0 && <div className="oc"><span><b>{overconfident(e).length}</b> card{overconfident(e).length === 1 ? '' : 's'} you were sure about but got wrong</span><button className="solid" onClick={() => { e.startPracticeIds(overconfident(e)); router.push('/study'); }}>Fix them</button></div>}
        {e.O.smart !== false && (() => { const pt = patterns(e, Object.keys(e.MIS)); return pt.length ? <>
          <div className="shead"><h2>Patterns in your mistakes</h2><span>Cards you confuse together</span></div>
          <div className="pats">{pt.map((p, k) => <button key={k} className="pat" onClick={() => { e.startPracticeIds(p.ids); router.push('/study'); }}><b>{p.label}</b><small>{p.ids.length} cards · practice together</small></button>)}</div>
        </> : null; })()}
        {wk.length > 0 && <>
          <div className="shead"><h2>Needs work</h2><span>Based on your answers</span></div>
          <div className="insights">{wk.map(w => <button key={w.s} className="ins" onClick={() => go(w.s)}><div><b>{w.label}</b><small>{Math.round(w.acc * 100)}% right · {w.tried} tries{w.missed ? ' · ' + w.missed + ' missed' : ''}</small></div><span className="meter"><i style={{ width: Math.round(w.acc * 100) + '%' }} /></span><Ic n="arrowR" /></button>)}</div>
        </>}
        <div className="shead"><h2>Badges</h2><span>{bs.filter(b => b.have).length} of {bs.length}</span></div>
        <div className="badges">{bs.map(b => <div key={b.id} className={'bdg' + (b.have ? ' on' : '')} title={b.desc}><i><Ic n={b.icon} /></i><b>{b.title}</b><small>{b.have ? 'Earned' : b.cur + ' / ' + b.need}</small></div>)}</div>
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
              </article>
            );
          })}
        </div>
        {R.loaded && !R.categories.length && (
          <div className="empty2"><Ic n="layers" /><p>No topics yet. As the owner, open the study screen, press <b>R</b> and use the <b>Pools</b> tab to create one, then link PDFs and card sets.</p></div>
        )}
        {looseModels.length > 0 && R.categories.length > 0 && <p className="hnote">{looseModels.length} 3D model{looseModels.length === 1 ? ' has' : 's have'} no category yet.</p>}
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
