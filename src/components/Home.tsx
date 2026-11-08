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

/** The landing page: every category (pool) is a card with its card sets, PDFs and 3D models in one place. */
export default function Home() {
  const e = useEngine(), R = usePoolSync(), router = useRouter();
  const [liveG, setLive] = useState<any[]>([]);
  useEffect(() => watchLobby(g => setLive(g)), []);
  const [mounted, setMounted] = useState(false), [set, setSet] = useState(false), [open, setOpen] = useState<string | null>(null);

  useEffect(() => { setMounted(true); e.init(); }, []); // eslint-disable-line
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
  const go = (sel: string) => { e.setSel(sel); router.push('/study'); };
  const cat = open ? R.category(open) : null;

  return (
    <>
      <main className="home">
        <header className="hh">
          <div className="brand"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M2 12 22 3l-5 18-5-7z" fill="currentColor" /></svg><b>Flight Recall</b></div>
          <div className="tools">
            {isOwner() && <span className="own" title="Owner tools are unlocked"><Ic n="key" /> Owner</span>}
            <button className="ico" onClick={() => setSet(true)} aria-label="Settings"><Icon n="set" /></button>
          </div>
        </header>

        <section className="hero">
          <div>
            <p className="kick"><Ic n="fire" /> {live ? S.streak : 0} day streak{e.examInfo() ? ' · ' + e.examInfo() : ''}</p>
            <h1>{c.dToday + c.nToday > 0 ? `${c.dToday + c.nToday} cards ready today` : 'You are all caught up'}</h1>
            <p className="sub">{c.nToday} new · {c.l} learning · {c.dToday} due · {c.m} mastered of {c.tot}</p>
          </div>
          <Link className="cta" href="/study">Continue studying <Ic n="arrowR" /></Link>
        </section>

        <h2 className="hsec">Categories</h2>
        {R.loading && !R.loaded && <p className="info">Loading categories…</p>}
        {R.error && <p className="info">{R.error}</p>}
        <div className="pgrid">
          {R.categories.map(k => {
            const pc = e.poolCount(k.id), np = R.pdfsOf(k.id).length, nm = R.modelsOf(k.id).length;
            return (
              <article className="pcard" key={k.id} style={{ ['--pc' as any]: k.color_theme }}>
                <button className="pmain" onClick={() => setOpen(k.id)} aria-label={'Open ' + k.name}>
                  <span className="pdot" />
                  <b>{k.name}</b>
                  <small>{pc.c} cards · {np} PDF{np === 1 ? '' : 's'} · {nm} model{nm === 1 ? '' : 's'}</small>
                </button>
                <button className="pgo" disabled={!pc.c} onClick={() => go('c:' + k.id)}>Study</button>
              </article>
            );
          })}
        </div>
        {R.loaded && !R.categories.length && (
          <p className="info">No categories yet. As the owner, open the study screen, press <b>R</b> and use the <b>Pools</b> tab to create one, then link PDFs and card sets. 3D models are linked when you upload them in the 3D lab.</p>
        )}

        {liveG.length > 0 && liveG.slice(0, 2).map((g: any) => <Link key={g.pin} className="gbanner" href={'/play?pin=' + g.pin}><Ic n="play" /><b>Live now: {g.title}</b><span>Join</span></Link>)}
        <h2 className="hsec">Tools</h2>
        <div className="tgrid">
          <button className="tcard" onClick={() => go('all')}><span><Ic n="book" /></span><b>Whole library</b><small>{e.Q.length} cards</small></button>
          <Link className="tcard" href="/study"><span><Ic n="cap" /></span><b>Study screen</b><small>Quiz, folders, search</small></Link>
          <Link className="tcard" href="/play"><span><Ic n="play" /></span><b>Live quiz</b><small>Join a game · leaderboard</small></Link>
          {mounted && isOwner() && <Link className="tcard" href="/host"><span><Ic n="star" /></span><b>Host a quiz</b><small>Start a live game</small></Link>}
          <Link className="tcard" href="/lab"><span><Ic n="cube" /></span><b>3D lab</b><small>{allModels.length} model{allModels.length === 1 ? '' : 's'}</small></Link>
        </div>
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
