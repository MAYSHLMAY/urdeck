'use client';
import { useMemo, useRef, useState } from 'react';
import { chunks, kept, type Op, type Summary } from '@/lib/articles/diff';
import { ArticleFrame } from './ArticleFrame';

type Show = 'add' | 'del' | 'mod' | 'code';
const clip = (s: string, n = 260) => (s.length > n ? s.slice(0, n) + '…' : s);

/** Shows what changed between the article already here and the file just chosen. The person decides what happens next. */
export function ArticleDiff({ oldTitle, newTitle, ops, sum, newHtml, isPublic, byName, onReplace, onAddNew, onCancel }: {
  oldTitle: string; newTitle: string; ops: Op[]; sum: Summary; newHtml: string; isPublic: boolean; byName: boolean;
  onReplace: () => void; onAddNew: () => void; onCancel: () => void;
}) {
  const [tab, setTab] = useState<'changes' | 'preview'>('changes');
  const [on, setOn] = useState<Record<Show, boolean>>({ add: true, del: true, mod: true, code: false });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [cur, setCur] = useState(-1), list = useRef<HTMLDivElement>(null);
  const codeChanges = useMemo(() => ops.filter(o => o.t !== 'same' && o.k === 'code').length, [ops]);
  const textChanges = sum.add + sum.del + sum.mod - codeChanges;
  const vis = (o: Op) => o.t === 'same' || (o.k === 'code' ? on.code : on[o.t as Show]);
  const shown = useMemo(() => ops.filter(o => o.t === 'same' || vis(o)), [ops, on]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cks = useMemo(() => chunks(shown.map(o => (o.t !== 'same' && !vis(o) ? ({ ...o, t: 'same' } as Op) : o)), 1), [shown]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ids = cks.map((c, i) => (c.type === 'op' && c.change ? i : -1)).filter(i => i >= 0);
  const jump = (d: number) => { if (!ids.length) return; const n = ((cur < 0 ? (d > 0 ? -1 : 0) : ids.indexOf(cur)) + d + ids.length) % ids.length, id = ids[n]; setCur(id); list.current?.querySelector(`[data-c="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const pct = Math.round(kept(sum) * 100);
  const chip = (k: Show, label: string, n: number, cls: string) => (
    <button type="button" className={'ad-chip ' + cls + (on[k] ? ' on' : '')} aria-pressed={on[k]} disabled={!n} onClick={() => setOn(v => ({ ...v, [k]: !v[k] }))}><b>{n}</b> {label}</button>
  );
  return (
    <div className="ad" role="dialog" aria-modal="true" aria-label="Compare versions">
      <header className="ad-top">
        <div><b>{byName ? 'Update ' : 'This looks like an update of '}“{oldTitle}”</b><small>{pct}% of the old text is still there{newTitle !== oldTitle ? ' · new title: ' + newTitle : ''}</small></div>
        <button type="button" className="ad-x" onClick={onCancel} aria-label="Close">Close</button>
      </header>
      <div className="ad-tabs" role="tablist"><button role="tab" aria-selected={tab === 'changes'} className={tab === 'changes' ? 'on' : ''} onClick={() => setTab('changes')}>Changes</button><button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Preview new file</button></div>
      {tab === 'changes' ? (<>
        <div className="ad-chips">
          {chip('add', 'added', sum.add - ops.filter(o => o.t === 'add' && o.k === 'code').length, 'add')}
          {chip('mod', 'changed', sum.mod - ops.filter(o => o.t === 'mod' && o.k === 'code').length, 'mod')}
          {chip('del', 'removed', sum.del - ops.filter(o => o.t === 'del' && o.k === 'code').length, 'del')}
          {chip('code', 'in simulations and code', codeChanges, 'code')}
        </div>
        <div className="ad-nav"><span>{textChanges + (on.code ? codeChanges : 0)} to review · {sum.same} unchanged</span><span><button type="button" onClick={() => jump(-1)} disabled={!ids.length}>Previous</button><button type="button" onClick={() => jump(1)} disabled={!ids.length}>Next change</button></span></div>
        <div className="ad-list" ref={list}>
          {!ids.length && <p className="ad-empty">Nothing to show with these filters. Turn a filter on above.</p>}
          {cks.map((c, i) => c.type === 'fold'
            ? (open[c.first]
              ? shown.slice(c.first, c.first + c.n).map((o, k) => <p key={c.first + '-' + k} className="ad-l same">{clip((o as any).s)}</p>)
              : <button key={'f' + c.first} type="button" className="ad-fold" onClick={() => setOpen(v => ({ ...v, [c.first]: true }))}>Show {c.n} unchanged line{c.n === 1 ? '' : 's'}</button>)
            : <div key={i} data-c={i} className={'ad-l ' + c.op.t + (c.op.k === 'code' ? ' code' : '') + (cur === i ? ' cur' : '')}>
              {c.op.t === 'mod' ? (<><span className="ad-tag">Changed</span><p>{c.op.w.map((w, k) => w.t === 'same' ? <span key={k}>{w.s}</span> : w.t === 'add' ? <ins key={k}>{w.s}</ins> : <del key={k}>{w.s}</del>)}</p></>)
                : c.op.t === 'add' ? (<><span className="ad-tag">Added</span><p><ins>{clip(c.op.s)}</ins></p></>)
                : c.op.t === 'del' ? (<><span className="ad-tag">Removed</span><p><del>{clip(c.op.s)}</del></p></>)
                : <p>{clip(c.op.s)}</p>}
            </div>)}
        </div>
      </>) : (
        <div className="ad-prev"><ArticleFrame html={newHtml} title="New version preview" /></div>
      )}
      <footer className="ad-foot">
        {isPublic
          ? <><p>This is a public article, so it cannot be replaced from here. You can keep your newer file as your own private copy.</p><div><button type="button" className="ad-go" onClick={onAddNew}>Save as my own copy</button><button type="button" onClick={onCancel}>Cancel</button></div></>
          : <><p>Replacing keeps the old version. You can undo it later.</p><div><button type="button" className="ad-go" onClick={onReplace}>Replace the old one</button><button type="button" onClick={onAddNew}>Add as a new article</button><button type="button" onClick={onCancel}>Cancel</button></div></>}
      </footer>
    </div>
  );
}
