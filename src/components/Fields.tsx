'use client';
import { useEffect, useState } from 'react';
import { ACCENTS } from '@/lib/look';
import { isOwner } from '@/lib/api';
import { askPassword, ask, Sheet, SheetFrame, useEngine, Ic } from './ui';
import { refs } from '@/lib/refs';

/* Fields of study: the top-level containers. One host (mounted once in the layout) shows every sheet; any button opens them by event. */
type Ui = { type: 'switch' | 'new' | 'edit' | 'sort'; id?: string } | null;
export const openFields = (type: 'switch' | 'new' | 'edit' | 'sort', id?: string) => { try { dispatchEvent(new CustomEvent('ud-fields-ui', { detail: { type, id } })); } catch { /* ignore */ } };

export const Mono = ({ name, color, size = 44 }: { name: string; color: string; size?: number }) => (
  <span className="fd-mono" style={{ ['--c' as any]: color, width: size, height: size, fontSize: size * .42 }} aria-hidden>{(name.trim()[0] || '?').toUpperCase()}</span>
);

/** The small "Field: X" button shown on Home and Study. */
export function FieldPill({ className = '' }: { className?: string }) {
  const e = useEngine();
  if (!e.ready) return null;
  const on = e.fieldOk(), name = on ? e.FT.name.get(e.field) || '' : 'All fields', col = on ? e.FT.fcol.get(e.field) || '#5B5BD6' : 'var(--mute)';
  return (
    <button type="button" className={'fd-pill ' + className} onClick={() => openFields('switch')} aria-haspopup="dialog" aria-label={'Field of study: ' + name + '. Change'}>
      <i style={{ background: col }} /><span className="fd-k">Field</span><b>{name}</b><Ic n="chevD" />
    </button>
  );
}

export function FieldHost() {
  const e = useEngine(), [ui, setUi] = useState<Ui>(null);
  useEffect(() => { const f = (ev: Event) => setUi((ev as CustomEvent).detail || null); addEventListener('ud-fields-ui', f); return () => removeEventListener('ud-fields-ui', f); }, []);
  const close = () => setUi(null);
  return (<>
    <Switcher open={ui?.type === 'switch'} onClose={close} />
    <FieldForm open={ui?.type === 'new' || ui?.type === 'edit'} id={ui?.type === 'edit' ? ui.id : undefined} onClose={close} />
    <Sorter open={ui?.type === 'sort'} pre={ui?.id} onClose={close} />
  </>);
}

function Switcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const e = useEngine();
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const list = e.fields(), un = e.unsorted(), R = refs(), nUn = un.folders.length + un.sets.length + [...R.pdfs, ...R.localPdfs].filter(p => e.itemAt('pdf:' + p.id) === 'root').length;
  const pick = (id: string) => { e.setField(id); onClose(); };
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title="Fields of study" onClose={onClose}>
        <div className="sc fd-sheet">
          <p className="fd-n">A field is the big container for a subject, like Aeronautics or Biology. Pick one and Home, Study, Search, Statistics and the Leech Lab show only its cards.</p>
          <button type="button" className={'fd-row' + (!e.fieldOk() ? ' on' : '')} onClick={() => pick('')}>
            <span className="fd-mono all" aria-hidden><Ic n="layers" /></span>
            <span className="fd-tx"><b>All fields</b><small>{e.Q.length} cards</small></span>
          </button>
          {list.map(f => (
            <div key={f.id} className={'fd-row' + (e.field === f.id ? ' on' : '')}>
              <button type="button" className="fd-pick" onClick={() => pick(f.id)}>
                <Mono name={f.name} color={f.color} />
                <span className="fd-tx"><b>{f.name}</b><small>{f.cards} cards{f.due ? ' · ' + f.due + ' due' : ''} · {f.folders} item{f.folders === 1 ? '' : 's'}</small></span>
              </button>
              {e.canEditField(f.id) && <button type="button" className="fd-dots" aria-label={'Edit ' + f.name} onClick={() => openFields('edit', f.id)}><Ic n="dots" /></button>}
            </div>
          ))}
          {!list.length && <p className="fd-n">No fields yet. Create your first one below.</p>}
          <div className="fd-two">
            <button type="button" className="solid" onClick={() => openFields('new')}>New field</button>
            <button type="button" className="ghost" disabled={!nUn || !list.length} onClick={() => openFields('sort')}>Sort {nUn} unsorted</button>
          </div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}

function FieldForm({ open, id, onClose }: { open: boolean; id?: string; onClose: () => void }) {
  const e = useEngine(), [name, setName] = useState(''), [col, setCol] = useState(ACCENTS[0][2]), [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; if (id) { setName(e.FT.name.get(id) || ''); setCol(e.FT.fcol.get(id) || ACCENTS[0][2]); } else { setName(''); setCol(ACCENTS[(e.fields().length) % ACCENTS.length][2]); } }, [open, id]); // eslint-disable-line
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const own = isOwner();
  const save = () => {
    if (!name.trim()) return;
    if (id) { e.editField(id, name, col); e.toast('Saved'); onClose(); return; }
    const nid = e.addField(name, col); e.setField(nid); e.toast('Field created');
    const un = e.unsorted(); onClose();
    if (un.folders.length + un.sets.length + refs().pdfs.length + refs().localPdfs.length) setTimeout(() => openFields('sort', nid), 160);
  };
  const del = async () => {
    const nm = e.FT.name.get(id!) || 'this field';
    const okk = await ask({ title: 'Delete “' + nm + '”?', msg: 'Only the field is deleted. Its folders and sets go back to Unsorted and no cards are lost.', ok: 'Delete field' });
    if (!okk) return;
    const local = e.LF.folders.some(f => f.id === id);
    const pw = !local && own ? await askPassword('Delete “' + nm + '”?', 'Enter the owner password to delete this shared field.') : 'local';
    if (!pw) return; setBusy(true);
    const err = await e.deleteField(id!, pw); setBusy(false);
    if (err) { e.toast(err); return; }
    e.toast('Field deleted'); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title={id ? 'Edit field' : 'New field of study'} onClose={onClose}>
        <div className="sc fd-sheet">
          <div className="fd-prev"><Mono name={name || '?'} color={col} size={56} /><b>{name.trim() || 'Name your field'}</b></div>
          <label className="cl" htmlFor="fd-name">Name</label>
          <input id="fd-name" type="text" value={name} maxLength={60} autoFocus placeholder="Aeronautics, Biology, Law" onChange={ev => setName(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') save(); }} />
          <label className="cl">Color</label>
          <div className="fd-sw" role="radiogroup" aria-label="Color">{ACCENTS.map(a => <button key={a[0]} type="button" role="radio" aria-checked={col === a[2]} aria-label={a[1]} className={col === a[2] ? 'on' : ''} style={{ background: a[2] }} onClick={() => setCol(a[2])} />)}</div>
          {!id && <p className="fd-n">{own ? 'As owner, a new field is shared with everyone who uses the app.' : 'This field is yours. It follows your account to every device.'}</p>}
          <div className="fd-two"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="button" className="solid" disabled={!name.trim() || busy} onClick={save}>{id ? 'Save' : 'Create field'}</button></div>
          {id && <button type="button" className="fd-del" disabled={busy} onClick={del}>Delete field (keeps its contents)</button>}
        </div>
      </SheetFrame>
    </Sheet>
  );
}

function Sorter({ open, pre, onClose }: { open: boolean; pre?: string; onClose: () => void }) {
  const e = useEngine(), [sel, setSel] = useState<Set<string>>(new Set()), [to, setTo] = useState('');
  useEffect(() => { if (open) { setSel(new Set()); setTo(pre || e.field || e.fields()[0]?.id || ''); } }, [open, pre]); // eslint-disable-line
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const FT = e.FT, un = e.unsorted(), fl = e.fields(), R = refs();
  const docs = [...R.pdfs, ...R.localPdfs].filter(p => e.itemAt('pdf:' + p.id) === 'root'), mods: { id: string; name: string }[] = [];
  const rows = [...un.folders.map(id => ({ id, n: FT.name.get(id) || '?', k: 'Folder', c: [...(FT.secs.get(id) || [])].length })),
    ...docs.map(p => ({ id: 'pdf:' + p.id, n: p.title, k: 'PDF', c: 0 })), ...mods.map(m => ({ id: 'mdl:' + m.id, n: m.name, k: '3D model', c: 0 })), ...un.sets.map(id => { const i = FT.secInfo.get(id) || { t: id, n: '' }; return { id, n: (i.n ? i.n + ' · ' : '') + i.t, k: 'Set', c: 0 }; })];
  const tog = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = sel.size === rows.length && rows.length > 0;
  const go = () => { if (!sel.size || !to) return; e.moveInto([...sel], to); e.toast(sel.size + ' moved into ' + (FT.name.get(to) || 'field')); onClose(); };
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title="Sort into a field" onClose={onClose}>
        <div className="sc fd-sheet">
          <p className="fd-n">These are not in any field yet. Tick what belongs together and move it in one go. Nothing is deleted and you can move things again later.</p>
          <label className="cl" htmlFor="fd-to">Move into</label>
          <select id="fd-to" value={to} onChange={ev => setTo(ev.target.value)}>{fl.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <button type="button" className="ghost fd-all" onClick={() => setSel(all ? new Set() : new Set(rows.map(r => r.id)))}>{all ? 'Clear selection' : 'Select all ' + rows.length}</button>
          {rows.map(r => (
            <label key={r.id} className={'fd-chk' + (sel.has(r.id) ? ' on' : '')}>
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => tog(r.id)} />
              <span className="fd-tx"><b>{r.n}</b><small>{r.k}{r.c ? ' · ' + r.c + (r.c === 1 ? ' set' : ' sets') : ''}</small></span>
            </label>
          ))}
          {!rows.length && <p className="fd-n">Everything is already in a field.</p>}
          <button type="button" className="solid fd-wide" disabled={!sel.size || !to} onClick={go}>Move {sel.size || ''} into {FT.name.get(to) || 'field'}</button>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
