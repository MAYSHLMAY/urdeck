'use client';
import { useEffect, useRef, useState } from 'react';
import { foldList, gOrder2, isField } from '@/lib/tree';
import { Mono, openFields } from './Fields';
import { useRouter } from 'next/navigation';
import { useRefs } from './refHooks';
import { readerStore } from '@/lib/reader';
import { isOwner } from '@/lib/api';
import { splitPath } from '@/lib/engine';
import { ask, askPassword, esc, Sheet, SheetFrame, useEngine, Ic } from './ui';
import { KGlyph, TYPES } from './TypePicker';
import { kindOf, type Kind } from '@/lib/kind';
import type { EditorState } from './CardEditor';

const KC: Record<string, string> = Object.fromEntries(TYPES.map(t => [t.k, t.c]));
const PDF_C = '#D6453D', MDL_C = '#8250DF';
const KN: Record<string, string> = { mc: 'Multiple choice', f: 'Flashcards', c: 'Cloze', t: 'Type-in', o: 'Image occlusion' };
type KM = Partial<Record<Kind, number>>;
let _kv = -1, _km = new Map<string, KM>();
/** How many cards of each type every set holds (cached until the cards change). */
function kindMap(e: any): Map<string, KM> {
  if (_kv === e.qver && _km.size) return _km;
  const m = new Map<string, KM>(); e.Q.forEach((q: any) => { const k = kindOf(q.q) as Kind, r = m.get(q.s) || {}; r[k] = (r[k] || 0) + 1; m.set(q.s, r); });
  _kv = e.qver; _km = m; return m;
}
const Items = ({ c }: { c?: { p: number; m: number } }) => c && (c.p || c.m) ? <span className="kchips">{c.p ? <span className="kchip" style={{ ['--c' as any]: PDF_C }} title="PDFs"><KGlyph k="pdf" />{c.p}</span> : null}{c.m ? <span className="kchip" style={{ ['--c' as any]: MDL_C }} title="3D models"><KGlyph k="model" />{c.m}</span> : null}</span> : null;
const addKm = (a: KM, b: KM) => { (Object.keys(b) as Kind[]).forEach(k => { a[k] = (a[k] || 0) + (b[k] || 0); }); return a; };
const main = (r: KM): Kind | 'all' => { const ks = (Object.keys(r) as Kind[]).filter(k => r[k]); return ks.length === 1 ? ks[0] : 'all'; };
const Kinds = ({ r }: { r: KM }) => <span className="kchips">{(Object.keys(r) as Kind[]).filter(k => r[k]).map(k => <span key={k} className="kchip" style={{ ['--c' as any]: KC[k] }} title={KN[k]}><KGlyph k={k} />{r[k]}</span>)}</span>;

export function LibraryMenu({ open, onClose, onNew }: { open: boolean; onClose: () => void; onNew?: (st: EditorState) => void }) {
  const e = useEngine(), R = useRefs(), router = useRouter();
  useEffect(() => { if (open) R.load(); }, [open]); // eslint-disable-line
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
  const KM = kindMap(e), kindsOf = (id: string) => { const r: KM = {}; (FT.secs.get(id) || new Set<string>()).forEach(x => { if (KM.get(x)) addKm(r, KM.get(x)!); }); return r; };
  const sum = (id: string) => { let c = 0, d = 0, m = 0; (FT.secs.get(id) || new Set<string>()).forEach(s => { const u = U.get(s); if (u) { c += u.c; d += u.d; m += u.m; } }); return { c, d, m }; };
  const nPE = e.Q.filter(q => q.p).length, nHard = e.Q.filter(q => q.g === 'hard').length, nNew = e.Q.filter(q => e.isNewPE(q)).length;

  /* PDFs and 3D models live in the same tree as the card sets */
  const docs = [...R.pdfs, ...R.localPdfs], mods: { id: string; name: string; sub?: string | null }[] = []; // 3D models stay in the 3D lab, not in the folder tree
  const pdfsHere = docs.filter(p => e.itemAt('pdf:' + p.id) === BR), modsHere = mods.filter(m => e.itemAt('mdl:' + m.id) === BR);
  const itemCnt = new Map<string, { p: number; m: number }>();
  const bump = (tok: string, k: 'p' | 'm') => { let c: string | undefined = e.itemAt(tok), n = 0; while (c && c !== 'root' && n++ < 30) { const r = itemCnt.get(c) || { p: 0, m: 0 }; r[k]++; itemCnt.set(c, r); c = FT.parent.get(c); } };
  docs.forEach(p => bump('pdf:' + p.id, 'p')); mods.forEach(m => bump('mdl:' + m.id, 'm'));
  const openDoc = (id: string) => { onClose(); setTimeout(() => router.push('/read?pdf=' + encodeURIComponent(id)), 120); };
  const openModel = (id: string) => { onClose(); setTimeout(() => router.push('/lab#' + encodeURIComponent(id)), 120); };
  async function itemMenu(token: string, title: string) {
    const r = await ask({ title, acts: [{ k: 'mov', l: 'Move into a field or folder' }] });
    if (!r) return;
    const x = await ask({ title: 'Move “' + title + '” to', sel: foldList(e.FT), selv: e.itemAt(token), ok: 'Move' });
    if (x && x.sel) { e.moveInto([token], x.sel); e.toast('Moved'); }
  }
  const study = (v: string) => { e.setSel(v); onClose(); };
  const Chip = ({ v, l, n }: { v: string; l: string; n: number }) => <button className={'chip' + (S.sec === v ? ' on' : '')} onClick={() => study(v)}>{l}<small>{n}</small></button>;

  const trail: string[] = []; { let c: string | undefined = BR, n = 0; while (c && n++ < 30) { trail.unshift(c); if (c === 'root') break; c = FT.parent.get(c) || 'root'; } }
  const allKids = (FT.kids.get(BR) || []).slice().sort(cmp), atRoot = BR === 'root', fl = atRoot ? e.fields() : [];
  const kids = atRoot ? allKids.filter(k => !isField(k)) : allKids;
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
    const mine = isOwner() || V || e.LF.folders.some(f => f.id === id);
    const r = await ask({ title: nm, acts: ([] as { k: string; l: string }[]).concat(mine ? [{ k: 'ren', l: 'Rename' }] : [], [{ k: 'mov', l: 'Move into a field or folder' }], V || !mine ? [] : [{ k: 'del', l: 'Delete folder (keeps its contents)' }]) });
    if (!r) return;
    if (r.act === 'ren') {
      const x = await ask({ title: 'Rename folder', text: nm, ok: 'Save' });
      if (x && x.text) { if (V) e.foldOp([{ t: 'setPlace', key: 'name:' + id, value: x.text }]); else if (e.LF.folders.some(f => f.id === id)) e.foldOpLocal([{ t: 'renameFolder', id, name: x.text }]); else e.foldOp([{ t: 'renameFolder', id, name: x.text }]); e.toast('Renamed'); }
    } else if (r.act === 'mov') {
      const x = await ask({ title: 'Move “' + nm + '” to', sel: foldList(e.FT, id), selv: e.FT.parent.get(id) || 'root', ok: 'Move' });
      if (x && x.sel && x.sel !== id) { e.moveInto([id], x.sel); e.toast('Moved'); }
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
    const r = await ask({ title: inf.t, acts: [{ k: 'mov', l: 'Move into a field or folder' }, { k: 'tag', l: 'Edit tags' }] });
    if (!r) return;
    if (r.act === 'mov') {
      const x = await ask({ title: 'Move “' + inf.t + '” to', sel: foldList(e.FT), selv: e.FT.secOf.get(s) || 'root', ok: 'Move' });
      if (x && x.sel) { e.moveInto([s], x.sel); e.toast('Moved'); }
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
            <Chip v="all" l={e.fieldOk() ? 'All in ' + (FT.name.get(e.field) || 'field') : 'All cards'} n={e.QF.length} />
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
          {onNew && <div className="newrow" aria-label="Create here"><span>New here</span>
            {(['mc', 'f', 'c', 't', 'o'] as Kind[]).map(k => <button key={k} type="button" style={{ ['--c' as any]: KC[k] }} onClick={() => onNew({ mode: 'add', kind: k, folder: BR === 'root' ? undefined : BR, section: secs[0] })}><KGlyph k={k} />{KN[k]}</button>)}
          </div>}
          {atRoot && <>
            <div className="fd-sec"><span>Fields of study</span><button type="button" onClick={() => openFields('new')}>New field</button></div>
            {!fl.length && <div className="fd-first"><b>Start with a field</b><p>A field is the big container for a subject, like Aeronautics or Biology. Your folders and sets live inside it, and Home, Study and Search can focus on one field at a time.</p><button type="button" className="solid" onClick={() => openFields('new')}>Create your first field</button></div>}
            {fl.map(f => (
              <div key={f.id} className={'fd-tile' + (e.field === f.id ? ' on' : '')} style={{ ['--c' as any]: f.color }} role="button" tabIndex={0}
                onClick={() => { e.navTo(f.id); const b = document.getElementById('mbody'); if (b) b.scrollTop = 0; }} onKeyDown={ev => { if (ev.key === 'Enter') e.navTo(f.id); }}>
                <Mono name={f.name} color={f.color} />
                <span className="tx"><b><span className="fd-nm">{f.name}</span>{e.field === f.id && <span className="fd-act">Active</span>}</b><small>{f.cards} cards{f.due ? <> · <span style={{ color: 'var(--warm)' }}>{f.due} due</span></> : null} · {f.folders} item{f.folders === 1 ? '' : 's'}</small></span>
                <button className="go" onClick={ev => { ev.stopPropagation(); study('f:' + f.id); }}>Study</button>
                {e.canEditField(f.id) && <button className="go mgr" aria-label={'Edit ' + f.name} onClick={ev => { ev.stopPropagation(); openFields('edit', f.id); }}><Ic n="dots" /></button>}
              </div>
            ))}
            {(kids.length > 0 || secs.length > 0 || pdfsHere.length > 0 || modsHere.length > 0) && <div className="fd-sec"><span>Unsorted</span>{fl.length > 0 && <button type="button" onClick={() => openFields('sort')}>Sort into a field</button>}</div>}
          </>}
          {kids.map(id => {
            const s = sum(id), nk = (FT.kids.get(id) || []).length, ns = (FT.direct.get(id) || []).length;
            return (
              <div key={id} className={'frow' + (S.sec === 'f:' + id ? ' on' : '')} role="button" tabIndex={0}
                onClick={() => { e.navTo(id); const b = document.getElementById('mbody'); if (b) b.scrollTop = 0; }}
                onKeyDown={ev => { if (ev.key === 'Enter') e.navTo(id); }}>
                <span className="ic"><Ic n="folder" /></span>
                <span className="tx"><b>{FT.name.get(id) || '?'}</b>
                  <small>{nk ? nk + ' folder' + (nk > 1 ? 's' : '') + ' · ' : ''}{ns ? ns + ' set' + (ns > 1 ? 's' : '') + ' · ' : ''}{s.c} cards{s.d ? <> · <span style={{ color: 'var(--warm)' }}>{s.d} due</span></> : null}</small><Kinds r={kindsOf(id)} /><Items c={itemCnt.get(id)} /></span>
                <button className="go" onClick={ev => { ev.stopPropagation(); study('f:' + id); }}>Study</button>
                {<button className="go mgr" aria-label="Folder options" onClick={ev => { ev.stopPropagation(); folderMenu(id); }}><Ic n="dots" /></button>}
              </div>
            );
          })}
          {secs.map(s => {
            const u = U.get(s) || { c: 0, d: 0 }, inf = FT.secInfo.get(s) || { t: s, n: '' };
            return (
              <div key={s} className={'frow' + (S.sec === s ? ' on' : '')} role="button" tabIndex={0} onClick={() => study(s)} onKeyDown={ev => { if (ev.key === 'Enter') study(s); }}>
                <span className="ic kt" style={{ ['--c' as any]: KC[main(KM.get(s) || {})] }}><KGlyph k={main(KM.get(s) || {})} /></span>
                <span className="tx"><b>{(inf.n ? inf.n + ' · ' : '') + inf.t}</b>
                  <small>{u.c} cards{u.d ? <> · <span style={{ color: 'var(--warm)' }}>{u.d} due</span></> : null}</small>
                  <Kinds r={KM.get(s) || {}} />
                  {(FT.tags.get(s) || []).map(t => <span className="tg" key={t}>#{t}</span>)}</span>
                {<button className="go mgr" aria-label="Set options" onClick={ev => { ev.stopPropagation(); setMenu(s); }}><Ic n="dots" /></button>}
              </div>
            );
          })}
          {pdfsHere.map(p => { const pr = readerStore().prog(p.id); return (
            <div key={p.id} className="frow" role="button" tabIndex={0} onClick={() => openDoc(p.id)} onKeyDown={ev => { if (ev.key === 'Enter') openDoc(p.id); }}>
              <span className="ic kt" style={{ ['--c' as any]: PDF_C }}><KGlyph k="pdf" /></span>
              <span className="tx"><b>{p.title}</b><small>PDF{p.file_size ? ' · ' + (p.file_size / 1048576 < 10 ? (p.file_size / 1048576).toFixed(1) : Math.round(p.file_size / 1048576)) + ' MB' : ''}{p.local ? ' · on this device' : ''}{pr ? ' · page ' + pr.page + (pr.total ? ' of ' + pr.total : '') : ''}</small></span>
              <button className="go" onClick={ev => { ev.stopPropagation(); openDoc(p.id); }}>Read</button>
              <button className="go mgr" aria-label="PDF options" onClick={ev => { ev.stopPropagation(); itemMenu('pdf:' + p.id, p.title); }}><Ic n="dots" /></button>
            </div>); })}
          {modsHere.map(m => (
            <div key={m.id} className="frow" role="button" tabIndex={0} onClick={() => openModel(m.id)} onKeyDown={ev => { if (ev.key === 'Enter') openModel(m.id); }}>
              <span className="ic kt" style={{ ['--c' as any]: MDL_C }}><KGlyph k="model" /></span>
              <span className="tx"><b>{m.name}</b><small>3D model{m.sub ? ' · ' + m.sub : ''}</small></span>
              <button className="go" onClick={ev => { ev.stopPropagation(); openModel(m.id); }}>Open</button>
              <button className="go mgr" aria-label="Model options" onClick={ev => { ev.stopPropagation(); itemMenu('mdl:' + m.id, m.name); }}><Ic n="dots" /></button>
            </div>))}
          {!kids.length && !secs.length && !pdfsHere.length && !modsHere.length && !fl.length && <p className="empty">This folder is empty.<br />Use the + button on the main screen to add a folder or cards here.</p>}
        </div>
      </SheetFrame>
    </Sheet>
  );
}

export { esc };
