'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';
import { CardEditor, type EditorState } from './CardEditor';
import { CardFigure } from './CardFigure';
import { shuf } from '@/lib/engine';
import { clozeFront, activeCloze, stripKind, kindOf } from '@/lib/kind';
import { fmtIv } from '@/lib/srs';
import type { QCard } from '@/lib/types';

const strip = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const front = (q: QCard) => strip(kindOf(q.q) === 'c' ? clozeFront(stripKind(q.q), activeCloze(q.q), '____') : stripKind(q.q)) || 'Picture card';
const back = (q: QCard) => strip(q.c) || 'See the card';
const level = (lapses: number, th: number) => { const r = lapses / Math.max(1, th); return r >= 2 ? 'severe' : r >= 1.5 ? 'stuck' : 'mild'; };
const LV: Record<string, { n: string; c: string }> = { mild: { n: 'Mild', c: '#E2A21B' }, stuck: { n: 'Stuck', c: '#F07B2B' }, severe: { n: 'Severe', c: '#E5533C' } };
const STEPS = ['Diagnose', 'Fix', 'Drill', 'Decide'];

/** Why a card keeps failing: simple, honest checks on the card itself and on how it has been answered. */
function tips(q: QCard, lapses: number, ease: number, confused: number): string[] {
  const t: string[] = [], k = kindOf(q.q), f = front(q), a = back(q);
  if (f.length > 160) t.push('The question is long. Split it into two or three smaller cards.');
  if (a.length > 90) t.push('The answer is long. Keep one fact per card and move the rest to its own card.');
  if (k === 'c' && (q.q.match(/\{\{c\d+::/g) || []).length > 2) t.push('Many blanks in one sentence. Hide one idea per card.');
  if (q.w.length && q.w.some(w => w.length > 0 && Math.abs(w.length - q.c.length) < 4 && w[0] === q.c[0])) t.push('Some wrong options look almost the same as the answer. Make them clearly different, or add a hint.');
  if (confused > 0) t.push('You have mixed this card up with another answer before. A memory hook that separates the two usually fixes it.');
  if (ease <= 1.5) t.push('Its ease is at the floor, so it keeps coming back too soon. A fresh start usually works better than more repeats.');
  if (!t.length) t.push('Nothing looks wrong with the card itself. A short mnemonic, then the drill, is the best next step.');
  if (lapses >= 12) t.push('Missed many times. Consider retiring it and learning the idea from another angle first.');
  return t;
}

function Drill({ q, onPass }: { q: QCard; onPass: () => void }) {
  const NEED = 3, kind = kindOf(q.q), flip = kind !== 'mc';
  const [streak, setStreak] = useState(0), [round, setRound] = useState(0), [rev, setRev] = useState(false), [pick, setPick] = useState(-1), [fb, setFb] = useState<'' | 'ok' | 'bad'>('');
  const opts = useMemo(() => shuf([q.c, ...q.w].map((t, i) => ({ t: strip(t), ok: i === 0 }))), [q.id, round]); // eslint-disable-line
  const grade = (ok: boolean) => { setFb(ok ? 'ok' : 'bad'); setStreak(s => ok ? s + 1 : 0); };
  const next = () => { setRound(r => r + 1); setRev(false); setPick(-1); setFb(''); };
  const done = streak >= NEED;
  return (
    <div className="ll-drill">
      <div className="ll-heal" role="progressbar" aria-valuemin={0} aria-valuemax={NEED} aria-valuenow={Math.min(streak, NEED)} aria-label="Correct in a row">
        {Array.from({ length: NEED }, (_, i) => <i key={i} className={i < streak ? 'on' : ''} />)}
        <span>{done ? 'Healed in practice' : streak + ' of ' + NEED + ' in a row'}</span>
      </div>
      <div className="ll-q"><b>{front(q)}</b><CardFigure q={q.q} reveal={rev || fb !== ''} compact /></div>
      {!flip && (
        <div className="ll-opts">{opts.map((o, i) => (
          <button key={i} type="button" disabled={fb !== ''} className={(fb && o.ok ? 'ok ' : '') + (fb && pick === i && !o.ok ? 'bad' : '')} onClick={() => { setPick(i); grade(o.ok); }}>{o.t}</button>
        ))}</div>
      )}
      {flip && !rev && fb === '' && <button type="button" className="solid ll-wide" onClick={() => setRev(true)}>Show answer</button>}
      {flip && rev && fb === '' && (<><p className="ll-ans">{back(q)}</p><div className="ll-two"><button type="button" className="ghost" onClick={() => grade(false)}>Missed it</button><button type="button" className="solid" onClick={() => grade(true)}>Knew it</button></div></>)}
      {fb !== '' && (
        <div className={'ll-fb ' + fb}><b>{fb === 'ok' ? 'Correct' : 'Not yet'}</b>{fb === 'bad' || flip ? <span>Answer: {back(q)}</span> : null}
          {done ? <button type="button" className="solid ll-wide" onClick={onPass}>Continue to decide</button> : <button type="button" className="solid ll-wide" onClick={next}>{fb === 'ok' ? 'Next round' : 'Try again'}</button>}
        </div>
      )}
    </div>
  );
}

function Treat({ id, pos, total, onDone, onEdit }: { id: string; pos: number; total: number; onDone: () => void; onEdit: (q: QCard) => void }) {
  const e = useEngine(), q = e.qById(id), c = e.get(id), [step, setStep] = useState(0), [mn, setMn] = useState(e.AUX.mn[id] || ''), [saved, setSaved] = useState(false);
  if (!q) return null;
  const th = e.O.leech, lv = LV[level(c.lapses || 0, th)], acc = c.a ? Math.round(((c.k || 0) / c.a) * 100) : 0;
  const conf = e.MIS[id] ? e.MIS[id].w : 0;
  return (
    <div className="ll-t">
      <ol className="ll-steps" aria-label="Treatment steps">{STEPS.map((s, i) => <li key={s}><button type="button" className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)}><i>{i < step ? <Ic n="check" /> : i + 1}</i><span>{s}</span></button></li>)}</ol>
      {total > 1 && <p className="ll-pos">Card {pos + 1} of {total}</p>}

      {step === 0 && (<>
        <div className="ll-q"><b>{front(q)}</b><CardFigure q={q.q} reveal compact /><p className="ll-ans">{back(q)}</p></div>
        <div className="ll-stats">
          <div><b>{c.lapses || 0}</b><span>times missed</span></div><div><b>{acc}%</b><span>correct overall</span></div>
          <div><b>{(c.ease || 0).toFixed(2)}</b><span>ease</span></div><div><b>{c.t === 'review' ? fmtIv(c.iv) : 'learning'}</b><span>interval</span></div>
        </div>
        <p className="ll-lv" style={{ ['--c' as any]: lv.c }}><i />{lv.n}: leech after {th} misses{c.susp ? ', currently suspended' : ''}{c.hl ? ', healed ' + c.hl + 'x before' : ''}</p>
        <h4 className="ll-h">What is going wrong</h4>
        <ul className="ll-tips">{tips(q, c.lapses || 0, c.ease || 2.5, conf).map(t => <li key={t}>{t}</li>)}</ul>
      </>)}

      {step === 1 && (<>
        <h4 className="ll-h">Make it easier to remember</h4>
        <label className="ll-f">Memory hook<small>A picture, a rhyme or a short story that links the question to the answer</small>
          <textarea rows={3} value={mn} maxLength={300} placeholder="e.g. Lima is a bean you can count on" onChange={ev => { setMn(ev.target.value); setSaved(false); }} />
        </label>
        <div className="ll-two"><button type="button" className="ghost" onClick={() => onEdit(q)}>Edit the card</button><button type="button" className="solid" onClick={() => { e.setMnemonic(id, mn); setSaved(true); }}>{saved ? 'Saved' : 'Save hook'}</button></div>
        <p className="ll-note">Your hook shows on the card after you answer, every time it comes back.</p>
      </>)}

      {step === 2 && <Drill key={id} q={q} onPass={() => setStep(3)} />}

      {step === 3 && (<>
        <h4 className="ll-h">Decide what happens next</h4>
        <div className="ll-dec">
          <button type="button" className="ll-pick" style={{ ['--c' as any]: '#16A064' }} onClick={() => { e.healLeech(id); onDone(); }}><b>Heal and bring it back</b><span>Clears the misses, starts again from the first learning step in 10 minutes.</span></button>
          <button type="button" className="ll-pick" style={{ ['--c' as any]: '#5B5BD6' }} onClick={() => { if (c.susp) e.toggleFlag(id, 'susp'); onDone(); }}><b>Keep it as it is</b><span>Leave its schedule alone{c.susp ? ' and unsuspend it' : ''}.</span></button>
          <button type="button" className="ll-pick" style={{ ['--c' as any]: '#E2A21B' }} onClick={() => { if (!c.susp) e.toggleFlag(id, 'susp'); onDone(); }}><b>Retire it for now</b><span>Suspend it so it stops coming up. You can bring it back any time.</span></button>
          <button type="button" className="ll-pick" style={{ ['--c' as any]: '#E5533C' }} onClick={() => { e.resetCard(id); onDone(); }}><b>Start over as a new card</b><span>Forget its history completely.</span></button>
        </div>
      </>)}
      <div className="ll-nav">
        <button type="button" className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {step < 3 && <button type="button" className="solid" onClick={() => setStep(step + 1)}>{step === 2 ? 'Skip the drill' : 'Next'}</button>}
      </div>
    </div>
  );
}

export default function LeechLab() {
  const e = useEngine();
  const [flt, setFlt] = useState<'all' | 'act' | 'sus'>('all'), [queue, setQueue] = useState<string[]>([]), [pos, setPos] = useState(0), [open, setOpen] = useState(false), [editor, setEditor] = useState<EditorState>(null);
  useEffect(() => { e.init(); }, []); // eslint-disable-line
  const all = e.ready ? e.leeches() : [], th = e.O.leech;
  const sus = all.filter(q => e.S.cards[q.id].susp).length, act = all.length - sus;
  const list = all.filter(q => flt === 'all' || (flt === 'sus') === !!e.S.cards[q.id].susp);
  const start = (ids: string[]) => { if (!ids.length) return; setQueue(ids); setPos(0); setOpen(true); };
  const done = () => { if (pos + 1 < queue.length) setPos(pos + 1); else { setOpen(false); setQueue([]); } };
  const setTh = (v: number) => { e.O.leech = Math.min(30, Math.max(2, v)); e.later = {}; e.save(); e.emit(); };
  const healed = e.ready ? e.Q.filter(q => (e.S.cards[q.id]?.hl || 0) > 0).length : 0;
  return (
    <div className="ll">
      <header className="ll-top"><Link href="/" className="ll-back" aria-label="Back to home"><Ic n="arrowL" /></Link><h1>Leech Lab</h1></header>
      <section className="ll-hero">
        <div className="ll-ring" style={{ ['--p' as any]: all.length ? Math.round((act / all.length) * 100) : 0 }} aria-hidden><b>{act}</b><span>stuck</span></div>
        <div className="ll-hi">
          <h2>{all.length ? (act ? 'These cards keep slipping away.' : 'Every leech is under control.') : 'No leeches. Nothing is stuck.'}</h2>
          <p>A leech is a card you have missed {th} times or more. Reviewing it again and again does not help. Diagnose it, fix it, drill it, then decide.</p>
          <div className="ll-thr"><span>Leech after</span><button type="button" aria-label="Lower the threshold" onClick={() => setTh(th - 1)}>-</button><b>{th}</b><button type="button" aria-label="Raise the threshold" onClick={() => setTh(th + 1)}>+</button><span>misses</span></div>
        </div>
        <div className="ll-mini"><div><b>{all.length}</b><span>leeches</span></div><div><b>{sus}</b><span>retired</span></div><div><b>{healed}</b><span>healed</span></div></div>
        <button type="button" className="solid ll-wide" disabled={!list.length} onClick={() => start(list.map(q => q.id))}>Treat {flt === 'all' ? 'them all' : 'this list'}{list.length ? ' (' + list.length + ')' : ''}</button>
      </section>

      {all.length > 0 && <div className="ll-flt" role="tablist">{([['all', 'All'], ['act', 'Stuck'], ['sus', 'Retired']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={flt === k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{l}</button>)}</div>}

      <ul className="ll-list">
        {list.map(q => {
          const c = e.S.cards[q.id], lv = LV[level(c.lapses || 0, th)];
          return (
            <li key={q.id}><button type="button" className={'uc ll-c' + (c.susp ? ' off' : '')} style={{ ['--c' as any]: lv.c }} onClick={() => start([q.id])}>
              <span className="uc-i"><Ic n="flag" /></span><span className="uc-b">{c.susp ? 'Retired' : lv.n}</span>
              <b className="uc-t">{front(q)}</b>
              <span className="uc-d">{q.s || 'Card'} - missed {c.lapses || 0} times - ease {(c.ease || 0).toFixed(1)}</span>
              <span className="ll-bar"><i style={{ width: Math.min(100, ((c.lapses || 0) / (th * 2)) * 100) + '%' }} /></span>
              <Ic n="flag" className="uc-wm" />
            </button></li>
          );
        })}
      </ul>
      {e.ready && !all.length && (
        <div className="ll-empty"><Ic n="check" /><p>When a card is missed {th} times, it lands here with tools to fix it. Keep studying and check back.</p><Link href="/study" className="solid" style={{ textDecoration: 'none', textAlign: 'center' }}>Go study</Link></div>
      )}

      <Sheet open={open} onClose={() => { setOpen(false); setQueue([]); }} className="sheet ll-sheet">
        <SheetFrame title="Treat a leech" onClose={() => { setOpen(false); setQueue([]); }}>
          {open && queue[pos] && <Treat key={queue[pos]} id={queue[pos]} pos={pos} total={queue.length} onDone={done} onEdit={q => setEditor({ mode: 'edit', id: q.id, section: q.s })} />}
        </SheetFrame>
      </Sheet>
      <CardEditor state={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
