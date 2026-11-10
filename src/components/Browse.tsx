'use client';
import { qText } from '@/lib/cardimg';
import { CardFigure } from './CardFigure';
import { useEffect, useMemo, useState } from 'react';
import { fnv } from '@/lib/fnv';
import type { QCard } from '@/lib/types';
import { Sheet, SheetFrame, useEngine, Ic, ask } from './ui';

type Mode = 'study' | 'shaky' | 'miss';
type Show = 'q' | 'qa' | 'full';
type Dens = 'few' | 'some' | 'many';
const K = 'fr-browse-v1', PAGE = 60;
const load = () => { try { return JSON.parse(localStorage.getItem(K) || 'null') || {}; } catch { return {}; } };

/**
 * Browse: see many cards at once instead of one at a time.
 *  - Study pile and Shaky pile are separate: marking a card "unsure" moves it out of Study into Shaky (and "Got it" moves it back).
 *  - Show only the questions, question + answer, or question + choices; tap a card to reveal its answer.
 *  - Density controls how many cards fit on screen. Nothing here touches the schedule.
 */
export function Browse({ open, onClose, onEdit, onPick, onManage }: { onManage?: () => void; open: boolean; onClose: () => void; onEdit: (id: string) => void; onPick: () => void }) {
  const e = useEngine();
  const [mode, setMode] = useState<Mode>('study'), [show, setShow] = useState<Show>('q'), [dens, setDens] = useState<Dens>('some');
  const [all, setAll] = useState(false), [rev, setRev] = useState<Set<string>>(new Set()), [limit, setLimit] = useState(PAGE), [shut, setShut] = useState<Set<string>>(new Set());

  useEffect(() => { if (!open) return; const p = load(); if (p.show) setShow(p.show); if (p.dens) setDens(p.dens); setMode('study'); setAll(false); setRev(new Set()); setLimit(PAGE); setShut(new Set()); }, [open]);
  const pref = (o: { show?: Show; dens?: Dens }) => { try { localStorage.setItem(K, JSON.stringify({ show, dens, ...o })); } catch { /* ignore */ } };

  const pool = open ? e.pool() : [];
  const groups = useMemo(() => {
    const m = new Map<string, { s: string; label: string; study: QCard[]; shaky: QCard[]; miss: QCard[] }>();
    pool.forEach(q => {
      let g = m.get(q.s);
      if (!g) { g = { s: q.s, label: (q.n ? q.n + ' · ' : '') + q.t, study: [], shaky: [], miss: [] }; m.set(q.s, g); }
      (e.isShaky(q.id) ? g.shaky : g.study).push(q);
      if (e.isMissed(q.id)) g.miss.push(q);
    });
    return [...m.values()];
  }, [open, e.ver, e.qver, e.S.sec]); // eslint-disable-line
  const nStudy = groups.reduce((a, g) => a + g.study.length, 0), nShaky = groups.reduce((a, g) => a + g.shaky.length, 0), nMiss = groups.reduce((a, g) => a + g.miss.length, 0);
  const pile = (g: { study: QCard[]; shaky: QCard[]; miss: QCard[] }) => (mode === 'study' ? g.study : mode === 'shaky' ? g.shaky : g.miss);
  const vis = groups.filter(g => pile(g).length);
  const flat = vis.flatMap(pile);

  const toggle = (id: string) => setRev(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const practice = (ids: string[]) => { onClose(); e.startPracticeIds(ids); };
  const speedRound = async () => {
    const r = await ask({ title: 'Speed round', msg: `${flat.length} card${flat.length === 1 ? '' : 's'} in a random order. Answer as many as you can before time runs out. Cards you miss go into your Mistakes list, and nothing is rescheduled.`, acts: [{ k: '60', l: '1 minute' }, { k: '120', l: '2 minutes' }, { k: '300', l: '5 minutes' }, { k: '600', l: '10 minutes' }] });
    if (r && r.act) { onClose(); e.startSpeed(flat.map(q => q.id), +r.act); }
  };
  let left = limit;

  return (
    <Sheet open={open} onClose={onClose} className="sheet browse">
      <SheetFrame title={<span className="ttl"><Ic n="grid" /> Browse</span>} onClose={onClose}>
        <div className="bhead">
          <p className="bsel"><span>{e.selLabel()}</span><button className="ghost" onClick={() => { onClose(); onPick(); }}>Change</button>{onManage && <button className="ghost" onClick={() => { onClose(); onManage(); }}><Ic n="pencil" /> Manage</button>}</p>
          <div className="btabs t3" role="tablist">
            <button role="tab" aria-selected={mode === 'study'} className={mode === 'study' ? 'on' : ''} onClick={() => { setMode('study'); setLimit(PAGE); }}><Ic n="book" /> Study <b>{nStudy}</b></button>
            <button role="tab" aria-selected={mode === 'shaky'} className={'sh' + (mode === 'shaky' ? ' on' : '')} onClick={() => { setMode('shaky'); setLimit(PAGE); }}><Ic n="flag" /> Shaky <b>{nShaky}</b></button>
            <button role="tab" aria-selected={mode === 'miss'} className={'ms' + (mode === 'miss' ? ' on' : '')} onClick={() => { setMode('miss'); setLimit(PAGE); }}><Ic n="target" /> Mistakes <b>{nMiss}</b></button>
          </div>
          <div className="bopts">
            <div className="seg" aria-label="What to show">
              {([['q', 'Questions'], ['qa', 'With answers'], ['full', 'With choices']] as [Show, string][]).map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => { setShow(k); pref({ show: k }); }}>{l}</button>)}
            </div>
            <div className="seg" aria-label="How many at a time">
              {([['few', 'Few'], ['some', 'More'], ['many', 'Most']] as [Dens, string][]).map(([k, l]) => <button key={k} className={dens === k ? 'on' : ''} onClick={() => { setDens(k); pref({ dens: k }); }}>{l}</button>)}
            </div>
            {show !== 'qa' && <button className="ghost" onClick={() => { setAll(a => !a); setRev(new Set()); }}><Ic n={all ? 'eyeOff' : 'eye'} /> {all ? 'Hide answers' : 'Reveal all'}</button>}
          </div>
          {mode === 'shaky'
            ? <p className="n">Cards you were unsure about. They stay out of the Study pile until you tap <b>Got it</b>.</p>
            : mode === 'miss'
            ? <p className="n">Cards you answered wrong or skipped. Answer one right twice in a row and it leaves this list by itself.</p>
            : <p className="n">Tap a card to see its answer. Tap <b>Unsure</b> to move it to the Shaky pile so you can come back to it.</p>}
        </div>
        <div className="sc bscroll">
          {!flat.length && <p className="info">{mode === 'miss' ? 'No mistakes logged here. Wrong answers will show up in this list.' : mode === 'study' ? (nShaky ? 'Everything here is in your Shaky pile.' : 'No cards in this selection.') : 'Nothing is marked unsure here. Mark cards in the Study pile and they will show up here.'}</p>}
          {vis.map(g => {
            const list = pile(g);
            if (left <= 0) return null;
            const part = list.slice(0, left); left -= part.length;
            const closed = shut.has(g.s);
            return (
              <section className="bgrp" key={g.s}>
                <div className="bgh">
                  <button className="bgt" onClick={() => setShut(s => { const n = new Set(s); n.has(g.s) ? n.delete(g.s) : n.add(g.s); return n; })} aria-expanded={!closed}>
                    <Ic n={closed ? 'chevR' : 'chevD'} /><b>{g.label}</b>
                    <small>{g.study.length} study · {g.shaky.length} shaky · {g.miss.length} missed</small>
                  </button>
                  <button className="ghost" onClick={() => practice(list.map(q => q.id))}><Ic n="play" /> {mode === 'study' ? 'Practice' : 'Drill'} {list.length}</button>
                </div>
                {!closed && <div className={'bgrid ' + dens}>
                  {part.map(q => <Tile key={q.id} q={q} mode={mode} show={show} open={show === 'qa' || all || rev.has(q.id)} onToggle={() => toggle(q.id)} onEdit={() => { onClose(); onEdit(q.id); }} />)}
                </div>}
              </section>
            );
          })}
          {flat.length > limit && <div className="row"><button className="ghost" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, flat.length - limit)} more</button></div>}
        </div>
        {flat.length > 0 && <div className="bfoot">
          <button className="solid" onClick={() => practice(flat.map(q => q.id))}><Ic n="play" /> {mode === 'shaky' ? 'Drill shaky' : mode === 'miss' ? 'Drill mistakes' : 'Practice'} ({flat.length})</button>
          <button className="ghost" onClick={speedRound}><Ic n="clock" /> Speed round</button>
        </div>}
      </SheetFrame>
    </Sheet>
  );
}

function Tile({ q, mode, show, open, onToggle, onEdit }: { q: QCard; mode: Mode; show: Show; open: boolean; onToggle: () => void; onEdit: () => void }) {
  const e = useEngine();
  const opts = useMemo(() => [q.c, ...q.w].map((t, i) => ({ t, ok: i === 0, k: fnv(q.id + '|' + i + '|' + t) })).sort((a, b) => (a.k < b.k ? -1 : 1)), [q.id, q.c, q.w]);
  return (
    <article className={'btile' + (open ? ' open' : '') + (mode === 'shaky' ? ' sh' : '')}>
      {e.isMissed(q.id) && <small className="bmiss">missed {e.MIS[q.id].w}×</small>}
      <button className="bq" onClick={onToggle} aria-expanded={open}>
        <span>{qText(q.q)}</span>
      </button>
      {open && <CardFigure q={q.q} reveal compact />}
      {show === 'full' && <ul className="bopt">{opts.map((o, i) => <li key={i} className={open && o.ok ? 'ok' : ''}><kbd>{i + 1}</kbd>{o.t}</li>)}</ul>}
      {show !== 'full' && open && <p className="ba"><Ic n="check" /> {q.c}</p>}
      <div className="bact">
        {e.isShaky(q.id)
          ? <button className="ghost" onClick={() => e.setShaky(q.id, false)}><Ic n="check" /> Got it</button>
          : <button className="ghost" onClick={() => e.setShaky(q.id, true)}><Ic n="flag" /> Unsure</button>}
        {mode === 'miss' && <button className="ghost" onClick={() => e.clearMissed(q.id)} title="Remove from the Mistakes list">Clear</button>}
        <button className="ghost" onClick={onEdit} aria-label="Edit this card" title="Edit"><Ic n="pencil" /></button>
      </div>
    </article>
  );
}
