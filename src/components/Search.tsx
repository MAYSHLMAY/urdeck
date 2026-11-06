'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { plain } from '@/lib/engine';
import { fpath } from '@/lib/tree';
import type { QCard } from '@/lib/types';
import { Sheet, SheetFrame, esc, useEngine } from './ui';

const BF: [string, string][] = [['all', 'All'], ['new', 'New'], ['learn', 'Learning'], ['due', 'Due'], ['mature', 'Mastered'], ['susp', 'Suspended'], ['mark', 'Marked'], ['leech', 'Leech']];
const HAY = new WeakMap<QCard, string>();

function hl(html: string, toks: string[]) {
  if (!toks.length) return html;
  const rx = new RegExp('(' + toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, txt) => tag ? tag : txt.replace(rx, '<mark>$1</mark>'));
}

export function Search({ open, onClose, onStudy, onOpenFolder }: { open: boolean; onClose: () => void; onStudy: () => void; onOpenFolder: () => void }) {
  const e = useEngine();
  const [f, setF] = useState('all'), [sel, setSel] = useState(false), [n, setN] = useState(40), [txt, setTxt] = useState(''), [openId, setOpenId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const sc = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => { setTxt(typed); setN(40); setOpenId(null); }, 120); return () => clearTimeout(t); }, [typed]);
  useEffect(() => { if (open && matchMedia('(pointer:fine)').matches) setTimeout(() => (document.getElementById('qin') as HTMLInputElement)?.focus(), 30); }, [open]);

  const toks = txt.toLowerCase().split(/\s+/).filter(Boolean), ptoks = toks.map(t => t.replace(/^#/, '')).filter(Boolean);
  const { rows, more } = useMemo(() => {
    if (!open) return { rows: [] as QCard[], more: false };
    const S = e.S, FT = e.FT, pool = sel ? new Set(e.pool().map(q => q.id)) : null, CM = new Map<string, string>(), out: QCard[] = [];
    for (const q of e.Q) {
      if (pool && !pool.has(q.id)) continue;
      const c = S.cards[q.id], st = e.stateOf(q)[0];
      if (f === 'new' && st !== 'new') continue; if (f === 'learn' && st !== 'learn') continue; if (f === 'due' && st !== 'due') continue;
      if (f === 'mature' && st !== 'mature') continue; if (f === 'susp' && st !== 'susp') continue;
      if (f === 'mark' && !(c && c.mark)) continue; if (f === 'leech' && !e.isLeech(c)) continue;
      if (toks.length) {
        let cat = CM.get(q.s);
        if (cat === undefined) { cat = (e.secPath(q.s).join(' ') + ' ' + q.s + ' ' + (FT.tags.get(q.s) || []).join(' ')).toLowerCase(); CM.set(q.s, cat); }
        let hb = HAY.get(q);
        if (hb === undefined) { hb = (plain(q.q) + ' ' + plain(q.c) + ' ' + q.w.map(plain).join(' ') + ' ' + q.s + ' ' + q.n).toLowerCase(); HAY.set(q, hb); }
        const hay = hb + ' ' + cat;
        if (!toks.every(t => t[0] === '#' ? (t.length < 2 || cat!.includes(t.slice(1))) : hay.includes(t))) continue;
      }
      out.push(q); if (out.length >= n + 1 && !openId) break;
    }
    return { rows: out.slice(0, n), more: out.length > n };
    // eslint-disable-next-line
  }, [open, e.ver, f, sel, n, txt, openId]);

  const FT = e.FT, S = e.S;
  const mt = (a: string) => { const s = a.toLowerCase(); return ptoks.every(t => s.includes(t)); };
  const fo: string[] = [], se: string[] = [];
  if (open && ptoks.length) {
    FT.name.forEach((nm, id) => { if (id !== 'root' && mt(nm)) fo.push(id); });
    FT.secOf.forEach((_, s) => { const inf = FT.secInfo.get(s) || { t: s, n: '' }; if (mt(inf.t + ' ' + (FT.tags.get(s) || []).join(' '))) se.push(s); });
  }
  const pathText = (id: string) => e.secPath(id).join(' › ');

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title="Search questions" onClose={onClose}>
        <div className="sbar"><input id="qin" type="search" placeholder="Search questions, folders, or #tags" autoComplete="off" value={typed} onChange={ev => setTyped(ev.target.value)} /></div>
        <div className="chips" id="bf">
          {BF.map(([v, l]) => <button key={v} className={'chip' + (f === v ? ' on' : '')} onClick={() => { setF(v); setN(40); }}>{l}</button>)}
          <button className={'chip' + (sel ? ' on' : '')} onClick={() => { setSel(!sel); setN(40); }}>Only “{e.selLabel().replace(/ \(\d+\)$/, '')}”</button>
        </div>
        <div className="sc" id="bres" ref={sc}>
          {(fo.length || se.length) ? <>
            <div className="sres"><div className="sh">Folders, sets and tags</div>
              {fo.slice(0, 6).map(id => (
                <div key={id} className="frow" role="button" tabIndex={0} onClick={() => { e.BR = id; e.BH = []; e.BW = []; onOpenFolder(); }}>
                  <span className="ic">📁</span><span className="tx"><b>{FT.name.get(id)}</b><small>{fpath(FT, FT.parent.get(id) || 'root').join(' › ') || 'Library'}</small></span>
                </div>))}
              {se.slice(0, 6).map(s => {
                const inf = FT.secInfo.get(s) || { t: s, n: '' };
                return (
                  <div key={s} className="frow" role="button" tabIndex={0} onClick={() => { e.setSel(s); onStudy(); }}>
                    <span className="ic">📄</span><span className="tx"><b>{(inf.n ? inf.n + ' · ' : '') + inf.t}</b><small>{pathText(s)}</small>
                      {(FT.tags.get(s) || []).map(t => <span className="tg" key={t}>#{t}</span>)}</span>
                  </div>);
              })}
            </div><div className="sh">Questions</div>
          </> : null}
          <div className="gm" style={{ margin: '0 2px 8px' }}>{toks.length || f !== 'all' || sel ? 'Showing ' + rows.length + (more ? '+' : '') + ' matches' : 'Type to search all ' + e.Q.length + ' questions'}</div>
          {rows.map(q => {
            const [s, sl] = e.stateOf(q), o = openId === String(q.id), c = S.cards[q.id], ht = ptoks;
            return (
              <div key={q.id} className={'res' + (o ? ' open' : '')}>
                <button className="rh" onClick={() => setOpenId(o ? null : String(q.id))}>
                  <span className="num">{q.n || ''}</span>
                  <span className="rq"><span dangerouslySetInnerHTML={{ __html: hl(q.q, ht) }} />
                    <span className="rpath">{pathText(q.s)}{(FT.tags.get(q.s) || []).map(t => ' #' + t).join('')}</span></span>
                  <span className={'st st-' + s}>{sl}</span>
                </button>
                {o && <div className="rd">
                  <ul><li className="c" dangerouslySetInnerHTML={{ __html: '✓ ' + hl(q.c, ht) }} />{q.w.map((w, k) => <li key={k} dangerouslySetInnerHTML={{ __html: hl(w, ht) }} />)}</ul>
                  <div className="info">{q.t}<br />{e.infoText(q)}</div>
                  <div className="row">
                    <button className="solid" onClick={() => { e.forced = String(q.id); e.cram = false; onStudy(); e.show(); }}>Study now</button>
                    <button className="ghost" onClick={() => e.toggleFlag(q.id, 'mark')}>{c && c.mark ? '★ Unmark' : '☆ Mark'}</button>
                    <button className="ghost" onClick={() => e.toggleFlag(q.id, 'susp')}>{c && c.susp ? 'Unsuspend' : 'Suspend'}</button>
                    {c && !e.isNew(c) ? <button className="ghost" onClick={() => { if (confirm('Reset this card to new?')) e.resetCard(q.id); }}>Reset card</button> : null}
                  </div>
                </div>}
              </div>
            );
          })}
          {more && <div className="row"><button className="ghost wide" onClick={() => setN(n + 40)}>Show more</button></div>}
          {!rows.length && <p className="info">No questions match.</p>}
        </div>
      </SheetFrame>
    </Sheet>
  );
}

export { esc };
