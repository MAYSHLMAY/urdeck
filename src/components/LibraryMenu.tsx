'use client';
import { useEffect, useRef, useState } from 'react';
import { foldList, gOrder2 } from '@/lib/tree';
import { isOwner } from '@/lib/api';
import { splitPath } from '@/lib/engine';
import { ask, askPassword, esc, Sheet, SheetFrame, useEngine, Ic } from './ui';

export function LibraryMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const e = useEngine();
  const pushed = useRef(false), skipPop = useRef(false);
  const prev = useRef({ br: 'root', n: 0 });
  const [dir, setDir] = useState(0);
  const touch = useRef({ x: 0, y: 0 });
  const [gop, setGop] = useState('');

  /* Android back button / swipe-back walks up the folders before closing the sheet */
  useEffect(() => {
    if (!open) return;
    try { history.pushState({ frm: 1 }, ''); pushed.current = true; } catch { /* ignore */ }
    const onPop = () => {
      if (skipPop.current) { skipPop.current = false; return; }
      if (e.navBack()) history.pushState({ frm: 1 }, ''); else { pushed.current = false; onClose(); }
    };
    addEventListener('popstate', onPop);
    return () => {
      removeEventListener('popstate', onPop);
      if (pushed.current) { pushed.current = false; if (history.state && history.state.frm) { skipPop.current = true; history.back(); } }
    };
    // eslint-disable-next-line
  }, [open]);

  useEffect(() => {
    if (e.BR !== prev.current.br) setDir(e.BH.length >= prev.current.n ? 1 : -1);
    prev.current = { br: e.BR, n: e.BH.length };
  }, [e.BR, e.BH.length]);

  useEffect(() => {
    if (!open) return;
    const on = document.querySelector('#mbody .frow.on'); if (on) on.scrollIntoView({ block: 'center' });
  }, [open]);

  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const S = e.S, FT = e.FT, BR = e.BR, own = isOwner(), cmp = gOrder2(FT);
  const U = e.menuStats(), cnt = { weak: 0, marked: 0, leech: 0 };
  e.Q.forEach(q => { const c = S.cards[q.id]; if (c) { if (e.inSel(q, 'weak', c)) cnt.weak++; if (c.mark) cnt.marked++; if (e.isLeech(c)) cnt.leech++; } });
  const sum = (id: string) => { let c = 0, d = 0, m = 0; (FT.secs.get(id) || new Set<string>()).forEach(s => { const u = U.get(s); if (u) { c += u.c; d += u.d; m += u.m; } }); return { c, d, m }; };
  const nPE = e.Q.filter(q => q.p).length, nHard = e.Q.filter(q => q.g === 'hard').length, nNew = e.Q.filter(q => e.isNewPE(q)).length;

  const study = (v: string) => { e.setSel(v); onClose(); };
  const Chip = ({ v, l, n }: { v: string; l: string; n: number }) => <button className={'chip' + (S.sec === v ? ' on' : '')} onClick={() => study(v)}>{l}<small>{n}</small></button>;

  const trail: string[] = []; { let c: string | undefined = BR, n = 0; while (c && n++ < 30) { trail.unshift(c); if (c === 'root') break; c = FT.parent.get(c) || 'root'; } }
  const kids = (FT.kids.get(BR) || []).slice().sort(cmp);
  const secs = (FT.direct.get(BR) || []).slice().sort((a, b) => String((FT.secInfo.get(a) || {} as any).n || a).localeCompare(String((FT.secInfo.get(b) || {} as any).n || b), undefined, { numeric: true }));
  const paths: string[] = []; const walk = (id: string, pre: string) => { (FT.kids.get(id) || []).forEach(k => { const pt = pre + (FT.name.get(k) || '?'); paths.push(pt); walk(k, pt + '/'); }); }; walk('root', '');

  const go = () => {
    const t = gop.trim(); if (!t) return;
    const rel = t.startsWith('./'), segs = splitPath(rel ? t.slice(2) : t), r = e.resolvePath(rel ? BR : 'root', segs);
    if (!r.plan.length) { e.navTo(r.id); return; }
    if (!isOwner()) { e.toast('No such folder. Tap + and unlock to create folders.'); return; }
    const x = e.ensurePath(rel ? BR : 'root', rel ? t.slice(2) : t);
    e.toast('Created ' + segs.join(' / ')); e.navTo(x.id); setGop('');
  };

  async function folderMenu(id: string) {
    const nm = e.FT.name.get(id)!, V = e.FT.virt.has(id);
    const r = await ask({ title: nm, acts: [{ k: 'ren', l: 'Rename' }, { k: 'mov', l: 'Move to another folder' }].concat(V ? [] : [{ k: 'del', l: 'Delete folder (keeps its contents)' }]) });
    if (!r) return;
    if (r.act === 'ren') {
      const x = await ask({ title: 'Rename folder', text: nm, ok: 'Save' });
      if (x && x.text) { e.foldOp([V ? { t: 'setPlace', key: 'name:' + id, value: x.text } : { t: 'renameFolder', id, name: x.text }]); e.toast('Renamed'); }
    } else if (r.act === 'mov') {
      const x = await ask({ title: 'Move “' + nm + '” to', sel: foldList(e.FT, id), selv: e.FT.parent.get(id) || 'root', ok: 'Move' });
      if (x && x.sel && x.sel !== id) { e.foldOp([V ? { t: 'setPlace', key: 'dir:' + id, value: x.sel } : { t: 'moveFolder', id, parent: x.sel }]); e.toast('Moved'); }
    } else if (r.act === 'del') {
      const own = isOwner();
      const pw = own ? await askPassword('Delete “' + nm + '”?', 'Enter the owner password to delete this folder. Sub-folders and card sets move up one level; no cards are deleted.') : 'local';
      if (pw) {
        const up = e.FT.parent.get(id) || 'root';
        const err = await e.deleteFolder(id, up, pw);
        if (err) { e.toast(err); return; }
        if (e.BR === id) e.BR = up;
        if (e.S.sec === 'f:' + id) { e.S.sec = 'all'; e.save(); }
        e.toast('Deleted'); e.show();
      }
    }
  }
  async function setMenu(s: string) {
    const inf = e.FT.secInfo.get(s) || { t: s, n: '' };
    const r = await ask({ title: inf.t, acts: [{ k: 'mov', l: 'Move to another folder' }, { k: 'tag', l: 'Edit tags' }] });
    if (!r) return;
    if (r.act === 'mov') {
      const x = await ask({ title: 'Move “' + inf.t + '” to', sel: foldList(e.FT), selv: e.FT.secOf.get(s) || 'root', ok: 'Move' });
      if (x && x.sel) { e.foldOp([{ t: 'setPlace', key: s, value: x.sel }]); e.toast('Moved'); }
    } else {
      const x = await ask({ title: 'Tags for “' + inf.t + '”', msg: 'Separate with commas. Search finds them with #tag.', text: (e.FT.tags.get(s) || []).join(', '), ok: 'Save' });
      if (x) { e.foldOp([x.text ? { t: 'setPlace', key: 'tags:' + s, value: x.text } : { t: 'delPlace', key: 'tags:' + s }]); e.toast('Tags saved'); }
    }
  }

  const header = (
    <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <button className="ico" disabled={!e.BH.length} onClick={() => e.navBack()} aria-label="Back" title="Back"><Ic n="arrowL" /></button>
      <button className="ico" disabled={!e.BW.length} onClick={() => e.navFwd()} aria-label="Forward" title="Forward"><Ic n="arrowR" /></button>
      <button className="ico" disabled={BR === 'root'} onClick={() => e.navUp()} aria-label="Up one folder" title="Up one folder"><Ic n="arrowU" /></button>
      <h3 style={{ marginLeft: 6 }}>Library</h3>
    </span>
  );

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame header={header} onClose={onClose}>
        <div className={'sc'} id="mbody" key={BR + ':' + dir}
          style={dir ? { animationName: dir > 0 ? 'slL' : 'slR' } : undefined}
          onTouchStart={ev => { const t = ev.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }}
          onTouchEnd={ev => {
            const t = ev.changedTouches[0], dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
            if (Math.abs(dy) < 45 && Math.abs(dx) > 85) { if (dx > 0) { if (!e.navBack()) e.navUp(); } else e.navFwd(); }
          }}>
          <div className="chips">
            <Chip v="all" l="All cards" n={e.Q.length} />
            {nHard ? <Chip v="hard" l="Hard only" n={nHard} /> : null}
            {nPE ? <Chip v="pe" l="Past exam" n={nPE} /> : null}
            {nNew ? <Chip v="penew" l="Unseen exam" n={nNew} /> : null}
            {cnt.weak ? <Chip v="weak" l="Weak spots" n={cnt.weak} /> : null}
            {cnt.marked ? <Chip v="marked" l="Marked" n={cnt.marked} /> : null}
            {cnt.leech ? <Chip v="leech" l="Leeches" n={cnt.leech} /> : null}
          </div>
          <div className="crumbs">
            {trail.map((id, i) => <span key={id} style={{ display: 'contents' }}>{i ? <span>›</span> : null}<button onClick={() => { e.navTo(id); }}>{i ? (FT.name.get(id) || '?') : 'Library'}</button></span>)}
          </div>
          <div className="pathbar">
            <input type="text" value={gop} list="paths" onChange={ev => setGop(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } }}
              placeholder="Go to or create a path: Materials/Chapter 1" autoComplete="off" autoCapitalize="off" spellCheck={false} />
            <button type="button" onClick={go}>Go</button>
            <datalist id="paths">{paths.map(x => <option key={x} value={x} />)}</datalist>
          </div>
          {BR !== 'root' && (() => { const s = sum(BR); return (
            <button className={'frow' + (S.sec === 'f:' + BR ? ' on' : '')} onClick={() => study('f:' + BR)}>
              <span className="ic"><Ic n="play" /></span><span className="tx"><b>Study this whole folder</b><small>{s.c} cards{s.d ? ' · ' + s.d + ' due' : ''}</small></span>
            </button>); })()}
          {kids.map(id => {
            const s = sum(id), nk = (FT.kids.get(id) || []).length, ns = (FT.direct.get(id) || []).length;
            return (
              <div key={id} className={'frow' + (S.sec === 'f:' + id ? ' on' : '')} role="button" tabIndex={0}
                onClick={() => { e.navTo(id); const b = document.getElementById('mbody'); if (b) b.scrollTop = 0; }}
                onKeyDown={ev => { if (ev.key === 'Enter') e.navTo(id); }}>
                <span className="ic"><Ic n="folder" /></span>
                <span className="tx"><b>{FT.name.get(id) || '?'}</b>
                  <small>{nk ? nk + ' folder' + (nk > 1 ? 's' : '') + ' · ' : ''}{ns ? ns + ' set' + (ns > 1 ? 's' : '') + ' · ' : ''}{s.c} cards{s.d ? <> · <span style={{ color: 'var(--warm)' }}>{s.d} due</span></> : null}</small></span>
                <button className="go" onClick={ev => { ev.stopPropagation(); study('f:' + id); }}>Study</button>
                {own && <button className="go mgr" aria-label="Folder options" onClick={ev => { ev.stopPropagation(); folderMenu(id); }}><Ic n="dots" /></button>}
              </div>
            );
          })}
          {secs.map(s => {
            const u = U.get(s) || { c: 0, d: 0 }, inf = FT.secInfo.get(s) || { t: s, n: '' };
            return (
              <div key={s} className={'frow' + (S.sec === s ? ' on' : '')} role="button" tabIndex={0} onClick={() => study(s)} onKeyDown={ev => { if (ev.key === 'Enter') study(s); }}>
                <span className="ic"><Ic n="file" /></span>
                <span className="tx"><b>{(inf.n ? inf.n + ' · ' : '') + inf.t}</b>
                  <small>{u.c} cards{u.d ? <> · <span style={{ color: 'var(--warm)' }}>{u.d} due</span></> : null}</small>
                  {(FT.tags.get(s) || []).map(t => <span className="tg" key={t}>#{t}</span>)}</span>
                {own && <button className="go mgr" aria-label="Set options" onClick={ev => { ev.stopPropagation(); setMenu(s); }}><Ic n="dots" /></button>}
              </div>
            );
          })}
          {!kids.length && !secs.length && <p className="empty">This folder is empty.<br />Use the + button on the main screen to add a folder or cards here.</p>}
        </div>
      </SheetFrame>
    </Sheet>
  );
}

export { esc };
