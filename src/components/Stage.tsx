'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { qText } from '@/lib/cardimg';
import { M, D } from '@/lib/srs';
import { useEngine, esc, Ic, ask } from './ui';
import { useRefs } from './refHooks';
import { renderQuestion } from './Highlights';
import { isOwner } from '@/lib/api';
import { CardFigure } from './CardFigure';
import { FlipBody } from './FlipBody';
import { Related } from './Related';
import { AiExplain } from './AiConnect';
import { parseSrc } from '@/lib/src';
import { kindOf, stripKind, clozeFront, clozeBack, activeCloze } from '@/lib/kind';

export type CardAct = (mode: 'edit' | 'add', id: string, section: string) => void;

export function Stage({ onInfo, onCard }: { onInfo: (id: string) => void; onCard: CardAct }) {
  const e = useEngine();
  if (e.loadErr && !e.Q.length)
    return <section id="stage"><div className="card"><div className="q">Could not load the cards</div>
      <p className="info">{e.loadErr}</p><div className="row"><button className="solid" onClick={() => e.init()}>Try again</button></div></div></section>;
  if (!e.ready) return <section id="stage"><p className="info">Loading cards…</p></section>;
  if (!e.cur) return <section id="stage">{e.phase === 'done' ? <Done /> : <p className="info">Loading cards…</p>}</section>;
  return <section id="stage"><Question onInfo={onInfo} onCard={onCard} /></section>;
}

function Question({ onInfo, onCard }: { onInfo: (id: string) => void; onCard: CardAct }) {
  const e = useEngine(), R = useRefs(), cur = e.cur!, c = e.get(cur.id), x = e.O, ph = e.phase, i = e.chosen;
  const kind = kindOf(cur.q), flipK = kind !== 'mc', [rev, setRev] = useState(false);
  const [menu, setMenu] = useState(false), [dx, setDx] = useState(0), sw = useRef<{ x: number; y: number; h: boolean | null } | null>(null);
  const swipe = (dir: 1 | -1) => {
    if (dir === 1) { if (ph === 'ok') e.grade(2); else if (ph === 'bad' || ph === 'cr') e.show(); }
    else if (ph === 'q') e.laterQ(); else if (ph === 'ok' && !e.O.autoGood) e.grade(1);
  };
  const qRef = useRef<HTMLHeadingElement>(null), fbRef = useRef<HTMLDivElement>(null);
  const flag = e.S.cards[cur.id];
  const mark = !!(flag && flag.mark);

  useEffect(() => { setRev(false); }, [cur.id, e.showN]);
  const shown = kind === 'c' ? (rev ? clozeBack : clozeFront)(stripKind(cur.q), activeCloze(cur.q)) : cur.q;
  useLayoutEffect(() => { if (qRef.current) renderQuestion(qRef.current, shown, e.NOTES[cur.id] || []); }, [cur.id, e.showN, e.notesVer, shown]);
  useEffect(() => { setMenu(false); }, [cur.id, e.showN]);
  useEffect(() => {
    if (!menu) return;
    const f = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest('#more,#cm')) setMenu(false); };
    document.addEventListener('click', f); return () => document.removeEventListener('click', f);
  }, [menu]);
  useEffect(() => { if (ph !== 'q' && fbRef.current) fbRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [ph]);

  const badge = ({ new: 'New', learn: 'Learning', review: 'Review', relearn: 'Relearning' } as any)[c.t];
  const answered = ph !== 'q';
  const good = i != null && i >= 0 && !!e.curOpts[i]?.ok;
  const wm = x.wrongMin === x.wrongMax ? x.wrongMin : x.wrongMin + '–' + x.wrongMax;

  return (
    <div className="card pop" key={e.showN}
      onTouchStart={ev => { const t = ev.touches[0]; sw.current = { x: t.clientX, y: t.clientY, h: null }; }}
      onTouchMove={ev => {
        const g = sw.current; if (!g) return; const t = ev.touches[0], mx = t.clientX - g.x, my = t.clientY - g.y;
        if (g.h === null && (Math.abs(mx) > 12 || Math.abs(my) > 12)) g.h = Math.abs(mx) > Math.abs(my) * 1.6 && !window.getSelection()?.toString();
        if (g.h) setDx(Math.max(-140, Math.min(140, mx)));
      }}
      onTouchEnd={() => { const g = sw.current; sw.current = null; if (g?.h) { if (dx > 90) swipe(1); else if (dx < -90) swipe(-1); } setDx(0); }}
      onTouchCancel={() => { sw.current = null; setDx(0); }}
      style={dx ? { transform: `translateX(${dx * 0.5}px) rotate(${dx / 50}deg)`, transition: 'none' } : { transition: 'transform .3s cubic-bezier(.2,.8,.2,1)' }}>
      <div className="qhead">
        <span className="l">
          {cur.p ? <><b className="tag">PAST EXAM</b> </> : null}
          {e.isNewPE(cur) ? <><b className="tag nw">NEW</b> </> : null}
          {(cur.n ? cur.n + ' · ' : '') + cur.t}
        </span>
        <span className="r">
          <b className={'badge ' + c.t}>{badge}</b>
          <button className={'mini' + (mark ? ' on' : '')} id="mark" aria-label="Mark card" title="Mark (M)" onClick={() => e.toggleFlag(cur.id, 'mark')}><Ic n="star" fill={mark} /></button>
          <button className="mini" id="more" aria-label="More" onClick={ev => { ev.stopPropagation(); setMenu(m => !m); }}><Ic n="dots" /></button>
          <div className={'menu' + (menu ? ' on' : '')} id="cm">
            <button onClick={() => { setMenu(false); e.toggleFlag(cur.id, 'susp'); }}>Suspend this card</button>
            <button onClick={() => { setMenu(false); e.buryCard(cur.id); }}>Bury until tomorrow</button>
            <button onClick={() => { setMenu(false); e.setShaky(cur.id, !e.isShaky(cur.id)); e.toast(e.isShaky(cur.id) ? 'Moved to your Shaky pile' : 'Moved back to Study'); }}><Ic n="flag" /> {e.isShaky(cur.id) ? 'Move back to Study' : 'Mark as unsure'}</button>
            <button onClick={() => { setMenu(false); onInfo(cur.id); }}>Card info</button>
            <button onClick={() => { setMenu(false); if (ph !== 'q') { e.toast('Finish this card first, then edit it.'); return; } onCard('edit', cur.id, cur.s); }}><Ic n="pencil" /> {isOwner() || e.isMine(cur.id) ? 'Edit card' : 'Edit card (only me)'}</button>
            <button onClick={() => { setMenu(false); onCard('add', '', cur.s); }}><Ic n="plus" /> {isOwner() ? 'Add a card to this set' : 'Add my own card'}</button>
          </div>
        </span>
      </div>
      <h2 className="q" ref={qRef} />
      <CardFigure key={cur.id} q={cur.q} reveal={answered || rev} />
      {flipK && <FlipBody key={cur.id + ':' + e.showN} kind={kind} cur={cur} c={c} rev={rev} setRev={setRev} />}
      {!flipK && x.conf && ph === 'q' && <div className="conf" role="group" aria-label="How sure are you?"><small>How sure?</small>
        {([[1, 'Guess'], [2, 'Think so'], [3, 'Sure']] as [number, string][]).map(([n, l]) => <button key={n} className={e.conf === n ? 'on' : ''} aria-pressed={e.conf === n} onClick={() => e.setConf(n)}>{l}</button>)}</div>}
      {!flipK && <div className="opts">
        {e.curOpts.map((o, k) => (
          <button key={k} className={'opt' + (answered ? (o.ok ? ' right' : k === i ? ' wrong' : '') : '')} disabled={answered} onClick={() => e.answer(k)}>
            <kbd>{k + 1}</kbd><span dangerouslySetInnerHTML={{ __html: o.t }} />
          </button>
        ))}
      </div>}
      {(answered || (flipK && rev)) && <Mnemonic id={String(cur.id)} />}
      {(answered || (flipK && rev)) && <TeachBack key={cur.id + ':' + e.showN} q={cur.q} c={cur.c} />}
      <div className="row refrow">
        {parseSrc(cur.q) && <button className={'ghost srcbtn' + (answered && ph === 'bad' ? ' hot' : '')} title="Open the PDF page this card came from" onClick={async () => { const sr = parseSrc(cur.q)!; if (!R.open) await R.toggle(cur); R.openPdf(sr.pdfId, sr.page); }}><Ic n="mappin" /> Source p. {parseSrc(cur.q)!.page}</button>}
        <button className={'ghost refbtn' + (R.open ? ' on' : '')} onClick={() => R.toggle(cur)} aria-expanded={R.open} title="Reference PDF (R)">
          <Ic n="clip" /> {R.open ? 'Hide Reference PDF' : 'Open Reference PDF'}
          {!R.open && R.auto && R.auto.qid === String(cur.id) && R.auto.state === 'ready' && R.auto.matches.length > 0 && <span className="refready"><Ic n="sparkle" /> p. {R.auto.matches[0].page}</span>}
          {!R.open && R.auto && R.auto.qid === String(cur.id) && R.auto.state === 'working' && <span className="refready soft"> …</span>}
        </button>
      </div>
      {!answered && !flipK && <div className="row"><button className="ghost" onClick={() => e.laterQ()}>Ask me later</button><button className="ghost" onClick={() => e.answer(-1)}>I don’t know</button></div>}
      {!answered && flipK && !rev && <div className="row"><button className="ghost" onClick={() => e.laterQ()}>Ask me later</button></div>}
      {(answered || rev) && <><AiExplain q={cur} /><Related id={cur.id} /></>}
      <p className="swh">{!answered ? '← swipe left: ask me later' : ph === 'ok' && !x.autoGood ? '→ swipe right: Good · ← Hard' : '→ swipe right: continue'}</p>
      <div id="fb" ref={fbRef}>
        {ph === 'cr' && <>
          <p className={'say ' + (good ? 'yes' : 'no')}>{good ? 'Correct.' : (i! < 0 ? 'No problem.' : 'Not quite.')} Practice mode: nothing is rescheduled.</p>
          <button className="g g2 wide" onClick={() => e.show()}><b>Continue</b></button>
        </>}
        {ph === 'ok' && (x.autoGood ? <>
          <p className="say yes">Correct.</p>
          <button className="g g2 wide" onClick={() => e.grade(2)}><b>Continue</b><small>Good · {e.lab(cur.id, c, 2)}</small></button>
          <div className="row"><button className="ghost" onClick={() => e.grade(1)}>Hard · {e.lab(cur.id, c, 1)}</button><button className="ghost" onClick={() => e.grade(3)}>Easy · {e.lab(cur.id, c, 3)}</button></div>
        </> : <>
          <p className="say yes">Correct. How easy was it?</p>
          <div className="grades">
            {([[1, 'Hard'], [2, 'Good'], [3, 'Easy']] as [number, string][]).map(([g, n]) => (
              <button key={g} className={'g g' + g} onClick={() => e.grade(g)}><b>{n}</b><small>{e.lab(cur.id, c, g)}</small></button>
            ))}
          </div>
        </>)}
        {ph === 'bad' && <>
          <p className="say no">{i! < 0 ? 'No problem.' : 'Not quite.'} The right answer is highlighted. This card comes back in {wm} minutes.</p>
          <button className="g g0 wide" onClick={() => e.show()}><b>Continue</b></button>
        </>}
      </div>
    </div>
  );
}

/** "Check again": a warning, then the learner picks which cards to bring back. Nothing is locked and nothing is rescheduled. */
async function checkAgainFlow(e: ReturnType<typeof useEngine>) {
  const c = e.practiceCounts(); if (!c.all) { e.toast('There are no cards in this selection.'); return; }
  const acts = [{ k: 'all', l: `All ${c.all} card${c.all > 1 ? 's' : ''} in this selection` }];
  if (c.weak) acts.push({ k: 'weak', l: `Weak cards only (${c.weak})` });
  if (c.fresh) acts.push({ k: 'fresh', l: `Cards I have not studied yet (${c.fresh})` });
  if (c.marked) acts.push({ k: 'marked', l: `Marked cards (${c.marked})` });
  const r = await ask({
    title: 'Study these cards again?',
    msg: 'Warning: you have finished today’s plan, so this is extra practice. Every card you pick is brought back once, in random order. Your schedule, progress and statistics are not changed.',
    acts
  });
  if (r && r.act) e.startPractice(r.act as any);
}

function Done() {
  const e = useEngine(), S = e.S, info = e.doneInfo(), [tk, setTk] = useState(0);
  const checkAgain = () => checkAgainFlow(e);
  const first = info.first;
  useEffect(() => {
    if (e.phase !== 'done') return;
    if (first && Date.now() >= first - e.O.learnAhead * M) { e.show(); return; }
    if (first && first - Date.now() <= 3600e3) { const id = setTimeout(() => setTk(t => t + 1), 1000); return () => clearTimeout(id); }
  }, [tk, first, e.ver]);
  const t = Date.now();
  let msg = e.cram ? `You went through ${e.practiced} card${e.practiced === 1 ? '' : 's'}. Nothing was rescheduled.` : `${S.done} answered today${S.done ? ', ' + Math.round(S.ok / S.done * 100) + '% right' : ''}.`;
  if (e.cram) { /* no schedule text in practice */ }
  else if (first) { const sec = Math.max(0, Math.round((first - t) / 1000)); msg += ` Next learning card in ${sec >= 3600 ? Math.round(sec / 3600) + ' h' : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')}.`; }
  else if (info.nxtRev.length) { const d = Math.max(1, Math.ceil((info.nxtRev[0] - t) / D)); msg += ` Next review in about ${d} day${d > 1 ? 's' : ''}.`; }
  return (
    <div className="card">
      <h2 className="q" style={{ marginTop: 4 }}>{info.waiting && !e.cram ? 'Waiting for the next card' : e.cram ? 'Practice finished' : 'You’re clear for now.'}</h2>
      <p className="say">{msg}</p>
      <div className="row">
        {info.c.n && S.newToday >= S.limit ? <button className="ghost" onClick={() => e.learnMore()}>Learn 10 more new cards</button> : null}
        {info.tomorrow ? <button className="ghost" onClick={() => e.reviewAhead()}>Review {info.tomorrow} card{info.tomorrow > 1 ? 's' : ''} due tomorrow</button> : null}
        {e.cram && <button className="ghost" onClick={() => e.exitPractice()}>Exit practice</button>}
        <button className="solid" disabled={!info.P} onClick={checkAgain}>{e.cram ? 'Practice again' : 'Check again'}</button>
      </div>
    </div>
  );
}

export { esc };

function Mnemonic({ id }: { id: string }) {
  const e = useEngine(), t = e.AUX.mn[id] || '', [ed, setEd] = useState(false), [v, setV] = useState(t);
  if (ed) return <div className="mnem"><textarea rows={2} autoFocus maxLength={300} value={v} onChange={ev => setV(ev.target.value)} placeholder="A picture, rhyme or trick that makes it stick…" />
    <button className="solid" onClick={() => { e.setMnemonic(id, v); setEd(false); }}>Save</button></div>;
  return t ? <div className="mnem"><Ic n="sparkle" /><p>{t}</p><button className="ghost" aria-label="Edit memory trick" onClick={() => { setV(t); setEd(true); }}><Ic n="pencil" /></button></div>
    : <div className="row"><button className="ghost" onClick={() => { setV(''); setEd(true); }}><Ic n="sparkle" /> Add a memory trick</button></div>;
}

const STOP = new Set('the and for are was were with that this from into than then they them their there which when what where while have has had been being will would should could can not but its it\'s also such each both more most other some any all only over under about after before between because'.split(' '));
const terms = (t: string) => [...new Set(String(t).replace(/<[^>]+>/g, ' ').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{3,}/gu) || [])].filter(w => !STOP.has(w)).slice(0, 12);

/** Teach it back: say it in your own words, then see which key ideas you covered. */
function TeachBack({ q, c }: { q: string; c: string }) {
  const [open, setOpen] = useState(false), [t, setT] = useState(''), [done, setDone] = useState(false);
  const key = useMemo(() => { const k = terms(c); return k.length >= 2 ? k : [...k, ...terms(qText(q))].slice(0, 8); }, [q, c]);
  if (!open) return <div className="row"><button className="ghost" onClick={() => setOpen(true)}><Ic n="note" /> Teach it back</button></div>;
  const mine = t.toLowerCase();
  return (
    <div className="teach">
      <label className="cl">Explain it in your own words</label>
      <textarea rows={3} value={t} onChange={ev => { setT(ev.target.value); setDone(false); }} placeholder="As if you were teaching a friend…" />
      {!done ? <div className="row"><button className="ghost" onClick={() => setOpen(false)}>Close</button><button className="solid" disabled={t.trim().length < 8} onClick={() => setDone(true)}>Compare</button></div>
        : <><p className="n">Key ideas from the answer:</p>
          <div className="tchips">{key.map(k => <span key={k} className={mine.includes(k.slice(0, Math.max(4, k.length - 2))) ? 'yes' : 'no'}>{mine.includes(k.slice(0, Math.max(4, k.length - 2))) ? '✓ ' : '✗ '}{k}</span>)}</div>
          <div className="flipans" dangerouslySetInnerHTML={{ __html: c }} /></>}
    </div>
  );
}
