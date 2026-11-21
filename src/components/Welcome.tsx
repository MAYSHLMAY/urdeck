'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { auth, profile, seen, markSeen, TOUR_EVENT, CLAIM_EVENT, type Stats } from '@/lib/auth';
import { engine } from '@/lib/engine';
import { sync } from '@/lib/sync';
import { Avatar, AvatarPicker, randomKid, type Mood } from './game/Avatar';
import { loadIdentity, saveIdentity, type Identity } from '@/lib/game/identity';
import { randomName, cleanName, badName } from '@/lib/game/names';

export const useMe = () => useSyncExternalStore(auth.subscribe, () => auth.me(), () => null);
const EXEMPT = /^\/(play|host|duel|privacy)(\/|$)/;
/** First run: the app behind stays hidden until the welcome is finished (skip, guest or signed in). */
const gate = (on: boolean) => { try { const d = document.documentElement; if (on) d.setAttribute('data-gate-on', '1'); else { d.removeAttribute('data-gate'); d.removeAttribute('data-gate-on'); } } catch { /* ignore */ } };

/** Make the account and device sync agree, so signing in on a new device brings your progress back. */
export async function linkAccount() {
  const me = auth.me(); if (!me) return;
  try {
    const s = sync();
    if (!s.cfg) { const code = await s.enable(me.sync); if (!me.sync) await auth.saveSync(code); }
    else if (me.sync !== s.cfg.code) await auth.saveSync(s.cfg.code);
    const pe = await s.protect(); if (pe) engine().toast(pe);
    await profile.pull();
    let claim = false; try { claim = sessionStorage.getItem('ud-claim') === '1'; sessionStorage.removeItem('ud-claim'); } catch { /* ignore */ }
    if (claim) dispatchEvent(new Event(CLAIM_EVENT)); else engine().toast('Signed in as ' + me.name);
  } catch { /* sync is optional */ }
}

function Mark({ size = 84 }: { size?: number }) {
  return (
    <svg className="wl-mark" width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <rect className="c3" x="22" y="14" width="52" height="68" rx="10" fill="var(--acc)" opacity=".35" />
      <rect className="c2" x="22" y="14" width="52" height="68" rx="10" fill="var(--acc)" opacity=".65" />
      <rect className="c1" x="22" y="14" width="52" height="68" rx="10" fill="var(--acc)" />
      <path className="tick" d="M38 50l8 8 15-18" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- tour scenes: every one has something to touch ---------- */
function SceneCards() {
  const [flip, setFlip] = useState(false), [pick, setPick] = useState(-1);
  const R = [['Again', 'in 10 minutes'], ['Good', 'in 2 days'], ['Easy', 'in 6 days']];
  return (<>
    <button className={'wl-card' + (flip ? ' f' : '')} onClick={() => setFlip(f => !f)} aria-label="Flip the card">
      <span className="fr">Which organelle makes ATP?</span><span className="bk">Mitochondria</span>
    </button>
    <div className="wl-row" role="group" aria-label="How did it go?">
      {R.map(([l], i) => <button key={l} className={'wl-chip' + (pick === i ? ' on' : '')} onClick={() => { setFlip(true); setPick(i); }}>{l}</button>)}
    </div>
    <p className="wl-hint" aria-live="polite">{pick < 0 ? (flip ? 'Now tell it how it went' : 'Tap the card to flip it') : <>Next time: <b>{R[pick][1]}</b>. Hard cards come back sooner, easy ones fade out.</>}</p>
  </>);
}
function SceneMix() {
  const [on, setOn] = useState<number | null>(null);
  const P = [['which', 'witch', 5], ['affect', 'effect', 3], ['stalactite', 'stalagmite', 4]] as const;
  return (<>
    <div className="wl-pairs">{P.map(([a, b], i) => (
      <button key={a} className={'wl-pair' + (on === i ? ' on' : '')} onClick={() => setOn(i)}><b>{a}</b><i>⇄</i><b>{b}</b></button>
    ))}</div>
    <p className="wl-hint" aria-live="polite">{on === null ? 'Tap a pair you might mix up' : <>You swapped these <b>{P[on][2]}×</b>. UrDeck spots it and keeps the two apart until they stick.</>}</p>
  </>);
}
function SceneLab() {
  const [r, setR] = useState({ x: -22, y: 30 }), drag = useRef<{ x: number; y: number } | null>(null), [touched, setT] = useState(false);
  useEffect(() => { const t = setInterval(() => { if (!drag.current) setR(v => ({ ...v, y: v.y + 0.8 })); }, 30); return () => clearInterval(t); }, []);
  const F = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'], T = ['translateZ(60px)', 'rotateY(180deg) translateZ(60px)', 'rotateY(90deg) translateZ(60px)', 'rotateY(-90deg) translateZ(60px)', 'rotateX(90deg) translateZ(60px)', 'rotateX(-90deg) translateZ(60px)'];
  return (<>
    <div className="wl-cube" data-noswipe
      onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); setT(true); }}
      onPointerMove={e => { const d = drag.current; if (!d) return; setR(v => ({ x: Math.max(-80, Math.min(80, v.x - (e.clientY - d.y) * .6)), y: v.y + (e.clientX - d.x) * .6 })); drag.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="cube" style={{ transform: `rotateX(${r.x}deg) rotateY(${r.y}deg)` }}>{F.map((f, i) => <div key={f} style={{ transform: T[i] }}>{f}</div>)}</div>
    </div>
    <p className="wl-hint">{touched ? 'Nice. Real models work the same way: spin, zoom, tap parts to learn them.' : 'Drag the cube to spin it'}</p>
  </>);
}
function SceneQuiz() {
  const [a, setA] = useState(-1);
  const O = ['Nucleus', 'Mitochondria', 'Ribosome'];
  const L = [['You', a === 1 ? 82 : a < 0 ? 30 : 30], ['Sara', 64], ['Abel', 48]] as const;
  return (<>
    <div className="wl-q"><b>Powerhouse of the cell?</b>
      {O.map((o, i) => <button key={o} disabled={a >= 0} className={'wl-opt' + (a >= 0 && i === 1 ? ' right' : a === i ? ' wrong' : '')} onClick={() => setA(i)}>{o}</button>)}</div>
    <div className="wl-board" aria-label="Live scoreboard">{L.map(([n, v]) => <div key={n}><span>{n}</span><i><u style={{ width: v + '%' }} /></i></div>)}</div>
    <p className="wl-hint" aria-live="polite">{a < 0 ? 'Pick an answer. Friends join with a code.' : a === 1 ? 'Correct! Speed and streaks climb the board.' : 'Not quite, the green one was right. Wrong answers become review cards.'}</p>
  </>);
}
function SceneAI() {
  const [on, setOn] = useState(false);
  return (<>
    <button className={'wl-switch' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={() => setOn(v => !v)}><span>Smart help</span><i /></button>
    <div className={'wl-bubble' + (on ? ' show' : '')} aria-live="polite">{on ? 'Mitochondria turn glucose and oxygen into ATP, the cell’s energy currency. Think “power plant”.' : ''}</div>
    <p className="wl-hint">{on ? 'Works offline for hints and similar cards. Add a free Groq key in Settings for full explanations.' : 'Flip the switch'}</p>
  </>);
}

const TOUR: [string, string, () => ReactNode][] = [
  ['Cards that return right on time', 'Spaced repetition shows each card just before you would forget it.', () => <SceneCards />],
  ['See what you mix up', 'Your mistakes turn into patterns, then into a plan.', () => <SceneMix />],
  ['A 3D lab you can touch', 'Models and simulations next to your flashcards.', () => <SceneLab />],
  ['Live quizzes with friends', 'Host a game, share a code, race.', () => <SceneQuiz />],
  ['Smart help, only if you want it', 'Hints, explanations and card-making, with your own key.', () => <SceneAI />]
];

/* ---------- guided practice with coach marks ---------- */
const DEMO = [['Capital of Ethiopia?', 'Addis Ababa'], ['H₂O is…', 'Water'], ['2⁵ = ?', '32']];
function Try({ done }: { done: () => void }) {
  const [i, setI] = useState(0), [flip, setFlip] = useState(false), [fin, setFin] = useState(false), [tab, setTab] = useState(-1);
  const rate = () => { if (i === DEMO.length - 1) setFin(true); else { setFlip(false); setI(i + 1); } };
  const TABS = [['Home', 'Your streak, goal ring and what to review today.'], ['Study', 'Answer cards. Add, import or scan cards here too.'], ['Quiz', 'Host or join a live game with a code.'], ['3D lab', 'Models and simulations.']];
  if (fin) return (
    <div className="wl-pane">
      <h2>That’s the whole loop <span aria-hidden>🔥</span></h2>
      <p className="wl-sub">Tap each tab to see where things live.</p>
      <div className="wl-tabs">{TABS.map(([t], k) => <button key={t} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
      <p className="wl-hint" aria-live="polite">{tab < 0 ? 'Tabs sit at the bottom of the screen.' : TABS[tab][1]}</p>
      <button className="wl-go" onClick={done}>Continue</button>
    </div>
  );
  return (
    <div className="wl-pane">
      <div className="wl-coach" aria-live="polite"><b>{i + 1}/{DEMO.length}</b> {!flip ? 'Tap the card to see the answer' : 'How did it go? Tap Good if you knew it'}</div>
      <button className={'wl-card big' + (flip ? ' f' : '')} onClick={() => setFlip(true)} aria-label="Reveal answer"><span className="fr">{DEMO[i][0]}</span><span className="bk">{DEMO[i][1]}</span></button>
      <div className={'wl-row' + (flip ? '' : ' dim')}>
        {['Again', 'Good', 'Easy'].map(l => <button key={l} disabled={!flip} className={'wl-chip' + (flip && l === 'Good' ? ' nudge' : '')} onClick={rate}>{l}</button>)}
      </div>
    </div>
  );
}

/* ---------- player card builder + claim ---------- */
function Card3D({ av, name, goal, photo, mood = 'idle', claimed }: { av: string; name: string; goal: number; photo?: string; mood?: Mood; claimed?: boolean }) {
  const [t, setT] = useState({ x: 0, y: 0 });
  const mv = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); setT({ x: ((e.clientY - r.top) / r.height - .5) * -14, y: ((e.clientX - r.left) / r.width - .5) * 18 }); };
  return (
    <div className="wl-pc-wrap" data-noswipe onPointerMove={mv} onPointerLeave={() => setT({ x: 0, y: 0 })}>
      <div className={'wl-pc' + (claimed ? ' claimed' : '')} style={{ transform: `rotateX(${t.x}deg) rotateY(${t.y}deg)` }}>
        <div className="wl-pc-av">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <Avatar av={av} size={88} mood={mood} />}{claimed && <i className="wl-pc-badge" aria-label="Saved to your account">✓</i>}</div>
        <b className="wl-pc-name">{name || 'Your name'}</b>
        <span className="wl-pc-meta">{goal} answers a day</span>
        <span className="wl-pc-shine" />
      </div>
    </div>
  );
}
function Join({ finish }: { finish: () => void }) {
  const me = useMe(), e = engine();
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [g, setG] = useState(e.O.dailyGoal || 20);
  const [name, setName] = useState(''), [av, setAv] = useState(''), [mood, setMood] = useState<Mood>('idle'), [look, setLook] = useState(false), [id, setId] = useState<string | undefined>();
  useEffect(() => { loadIdentity().then(i => { setId(i?.id); setName(i?.name || randomName()); setAv(i?.av || randomKid()); }); }, []);
  const pickGoal = (n: number) => { setG(n); e.O.dailyGoal = n; e.save(); e.emit(); setMood('happy'); setTimeout(() => setMood('idle'), 900); };
  const shuffle = () => { setName(randomName()); setAv(randomKid()); setMood('wow'); setTimeout(() => setMood('idle'), 900); };
  const bad = () => { const n = cleanName(name); return n.length < 2 ? 'Pick a name with at least 2 letters.' : badName(n) ? 'Please choose a friendlier name.' : ''; };
  const keep = () => { const m = bad(); if (m) { setMsg(m); setMood('sad'); setTimeout(() => setMood('idle'), 900); return false; } saveIdentity({ id, name: cleanName(name), av }); return true; };
  const go = async () => { if (!keep()) return; setBusy(true); setMsg(''); markSeen(); try { await auth.google(); } catch (x: any) { setMsg(x.message); } setBusy(false); };
  const guest = () => { if (keep()) finish(); };
  if (me) return <Claimed finish={finish} />;
  return (
    <div className="wl-pane">
      <h2>Build your player card</h2>
      <p className="wl-sub">This is you in quizzes and on leaderboards.</p>
      <Card3D av={av} name={cleanName(name)} goal={g} mood={mood} />
      <div className="wl-pc-tools">
        <input className="wl-in" value={name} maxLength={20} aria-label="Your name" onChange={ev => { setName(ev.target.value); setMsg(''); setMood('happy'); }} onBlur={() => setMood('idle')} />
        <button className="wl-btn" onClick={shuffle} aria-label="Shuffle name and look">🎲</button>
        <button className={'wl-btn' + (look ? ' pri' : '')} onClick={() => setLook(v => !v)}>Look</button>
      </div>
      {look && <div className="wl-look" data-noswipe><AvatarPicker value={av} onChange={v => { setAv(v); setMood('happy'); }} /></div>}
      <div className="wl-row" role="group" aria-label="Daily goal">{[10, 20, 40].map(n => <button key={n} className={'wl-chip' + (g === n ? ' on' : '')} onClick={() => pickGoal(n)}>{n}/day</button>)}</div>
      {msg && <p className="wl-err" role="alert">{msg}</p>}
      <div className="wl-acct">
        <button className="wl-google" onClick={go} disabled={busy || !auth.configured()}><GIcon />{busy ? 'Opening Google…' : 'Save my card with Google'}</button>
        <p className="wl-hint">{auth.configured() ? 'Keeps your card, progress and game history on any device. Optional.' : 'Accounts turn on once this build is connected to Supabase.'}</p>
      </div>
      <button className="wl-skip" onClick={guest}>Play as a guest</button>
    </div>
  );
}
const GIcon = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" /></svg>;

/** The reveal after Google: the card flips to your photo, confetti, and your game history (one cached read). */
function Claimed({ finish }: { finish: () => void }) {
  const me = useMe(), [i, setI] = useState<Identity | null>(null), [st, setSt] = useState<Stats | null>(null), [goal] = useState(engine().O.dailyGoal || 20);
  useEffect(() => { loadIdentity().then(setI); profile.stats().then(setSt); }, []);
  const dots = Array.from({ length: 22 }, (_, k) => <i key={k} style={{ left: (k * 4.6 + (k % 3) * 2) + '%', background: ['var(--acc)', '#F5B301', '#1FA971', '#E5484D'][k % 4], animationDelay: (k % 7) * 0.08 + 's' }} />);
  return (
    <div className="wl-pane wl-claimed">
      <div className="wl-conf" aria-hidden>{dots}</div>
      <h2>You’re in{me ? `, ${me.name.split(' ')[0]}` : ''}!</h2>
      <p className="wl-sub">Your card is saved to your account.</p>
      <Card3D av={i?.av || ''} name={i?.name || me?.name || ''} goal={goal} photo={me?.pic} claimed />
      <div className="wl-stats" aria-live="polite">
        {[['Games', st?.games], ['Wins', st?.wins], ['Best streak', st?.streak]].map(([l, v]) => <div key={l as string}><b>{st ? v : '–'}</b><span>{l}</span></div>)}
      </div>
      <p className="wl-hint">Sign in on another device and this card, and your game history, come with you.</p>
      <button className="wl-go" onClick={finish}>Start studying</button>
    </div>
  );
}


/* ---------- the overlay ---------- */
export function Welcome() {
  const [open, setOpen] = useState(false), [ph, setPh] = useState<'splash' | 'tour' | 'try' | 'join'>('splash'), [i, setI] = useState(0), [first, setFirst] = useState(false);
  const sx = useRef<number | null>(null);
  useEffect(() => {
    auth.boot();
    const start = (replay: boolean) => { setFirst(!replay); setPh('tour'); setI(0); setOpen(true); };
    try {
      const u = new URL(location.href);
      if (!seen() && !EXEMPT.test(location.pathname) && !u.searchParams.has('sync') && !u.searchParams.has('ud_auth')) {
        if (localStorage.getItem('fr-progress-v1')) { markSeen(); gate(false); } else { gate(true); start(false); }
      } else { if (u.searchParams.has('ud_auth')) markSeen(); gate(false); }
    } catch { /* ignore */ }
    const on = () => start(true), cl = () => { setFirst(false); setPh('join'); setOpen(true); };
    addEventListener(TOUR_EVENT, on); addEventListener(CLAIM_EVENT, cl);
    return () => { removeEventListener(TOUR_EVENT, on); removeEventListener(CLAIM_EVENT, cl); };
  }, []);
  // returning from Google on the web: link the account once the session is ready
  useEffect(() => auth.subscribe(() => { if (auth.me() && sessionStorage.getItem('ud-link') !== auth.me()!.id) { try { sessionStorage.setItem('ud-link', auth.me()!.id); } catch { /* ignore */ } linkAccount(); } }), []);
  useEffect(() => { if (open && ph === 'splash') { const t = setTimeout(() => setPh('tour'), 2300); return () => clearTimeout(t); } }, [open, ph]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); if (ph === 'tour' && e.key === 'ArrowRight') next(); if (ph === 'tour' && e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1)); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const finish = () => { markSeen(); gate(false); setOpen(false); };
  const next = () => { if (i < TOUR.length - 1) setI(i + 1); else setPh('try'); };
  const down = (e: React.PointerEvent) => { sx.current = (e.target as HTMLElement).closest('[data-noswipe]') ? null : e.clientX; };
  const up = (e: React.PointerEvent) => { const s = sx.current; sx.current = null; if (s == null) return; const d = e.clientX - s; if (d < -50) next(); else if (d > 50) setI(v => Math.max(0, v - 1)); };

  return (
    <div className="wl" role="dialog" aria-modal="true" aria-label="Welcome to UrDeck">
      {ph === 'splash' && (
        <div className="wl-splash" onClick={() => setPh('tour')}>
          <Mark size={104} />
          <h1><span>Ur</span><span>Deck</span></h1>
          <p>Study anything. Remember it.</p>
        </div>
      )}
      {ph !== 'splash' && (<>
        <header className="wl-top">
          <div className="wl-dots" aria-hidden>{TOUR.map((_, k) => <i key={k} className={ph !== 'tour' || k <= i ? 'on' : ''} />)}<i className={ph === 'try' || ph === 'join' ? 'on' : ''} /><i className={ph === 'join' ? 'on' : ''} /></div>
          <button className="wl-x" onClick={finish}>{first ? 'Skip' : 'Close'}</button>
        </header>
        {ph === 'tour' && (
          <div className="wl-view" onPointerDown={down} onPointerUp={up}>
            <div className="wl-track" style={{ transform: `translateX(-${i * 100}%)` }}>
              {TOUR.map(([t, s, R], k) => (
                <section key={t} className="wl-pane" aria-hidden={k !== i} {...({ inert: k !== i ? '' : undefined } as any)}>
                  <h2>{t}</h2><p className="wl-sub">{s}</p>{R()}
                </section>
              ))}
            </div>
            <footer className="wl-foot">
              <button className="wl-back" onClick={() => setI(v => Math.max(0, v - 1))} disabled={i === 0}>Back</button>
              <button className="wl-go" onClick={next}>{i === TOUR.length - 1 ? 'Try it yourself' : 'Next'}</button>
            </footer>
          </div>
        )}
        {ph === 'try' && <Try done={() => setPh('join')} />}
        {ph === 'join' && <Join finish={finish} />}
      </>)}
    </div>
  );
}

/** Account block for Settings. */
export function AccountCard() {
  const me = useMe(), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  return (
    <section className="scard"><h4>Account</h4>
      {me ? (<div className="wl-who">{me.pic ? <img src={me.pic} alt="" referrerPolicy="no-referrer" /> : <span>{me.name[0]}</span>}<div><b>{me.name}</b><small>{me.email}</small></div>
        <button className="wl-btn" onClick={async () => { try { await sync().protect(false); } catch { /* ignore */ } auth.signOut(); }}>Sign out</button></div>)
        : (<><p className="wl-hint" style={{ textAlign: 'left' }}>Sign in with Google to back up progress and use it on any device. Optional.</p>
          <button className="wl-btn pri" disabled={busy || !auth.configured()} onClick={async () => { setBusy(true); setMsg(''); try { await auth.google(); } catch (x: any) { setMsg(x.message); } setBusy(false); }}>{busy ? 'Opening Google…' : 'Continue with Google'}</button></>)}
      {msg && <p className="wl-err">{msg}</p>}
    </section>
  );
}
