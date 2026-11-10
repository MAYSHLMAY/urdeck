'use client';
import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetFrame, useEngine, Ic, ask, askPassword } from './ui';
import { isOwner } from '@/lib/api';
import { qText } from '@/lib/cardimg';
import { kindOf, type Kind } from '@/lib/kind';
import { importToPack, isCardsFile } from '@/lib/exchange';
import type { BatchOp } from '@/lib/batch';

const PAGE = 100, KN: Record<Kind, string> = { mc: 'Choice', f: 'Flip', t: 'Type', c: 'Cloze', o: 'Occlusion' };
const plain = (t: string) => qText(t).replace(/<[^>]+>/g, '');

/** Manage cards: select many, then move / delete / mark past-exam / find & replace in one go. Batch add as text. */
export function Manage({ open, onClose, onEdit }: { open: boolean; onClose: () => void; onEdit: (id: string) => void }) {
  const e = useEngine(), own = isOwner();
  const [tab, setTab] = useState<'list' | 'add'>('list');
  const [set, setSet] = useState(''), [kind, setKind] = useState<'' | Kind>(''), [txt, setTxt] = useState(''), [past, setPast] = useState(false), [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ t: string; err?: boolean }>({ t: '' });
  const [panel, setPanel] = useState<'' | 'move' | 'rep'>(''), [dest, setDest] = useState(''), [newSet, setNewSet] = useState('');
  const [find, setFind] = useState(''), [repl, setRepl] = useState(''), [scope, setScope] = useState<'all' | 'q' | 'c' | 'w'>('all'), [cs, setCs] = useState(false);
  const [bset, setBset] = useState(''), [bnew, setBnew] = useState(''), [btext, setBtext] = useState('');

  useEffect(() => { if (open) { setSel(new Set()); setMsg({ t: '' }); setPanel(''); setLimit(PAGE); } }, [open]);
  const sets = useMemo(() => {
    if (!open) return [] as { s: string; label: string }[];
    return [...new Set(e.Q.map(x => x.s))].map(k => { const i = e.FT.secInfo.get(k); return { s: k, label: i ? (i.n ? i.n + ' · ' : '') + i.t : k }; }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [open, e.qver]); // eslint-disable-line
  const rows = useMemo(() => {
    if (!open) return [];
    const t = txt.trim().toLowerCase();
    return e.Q.filter(q => (!set || q.s === set) && (!kind || kindOf(q.q) === kind) && (!past || q.p) && (!t || (plain(q.q) + ' ' + q.c + ' ' + q.w.join(' ')).toLowerCase().includes(t)));
  }, [open, e.qver, set, kind, txt, past]); // eslint-disable-line
  const ids = rows.map(r => r.id), allSel = ids.length > 0 && ids.every(i => sel.has(i));
  const chosen = [...sel].filter(i => e.qById(i));
  const say = (t: string, err = false) => setMsg({ t, err });
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function run(op: BatchOp, label?: string) {
    if (!chosen.length || busy) return;
    let pw: string | undefined;
    if (op.op === 'delete') {
      if (own) { const p = await askPassword('Delete ' + chosen.length + ' card' + (chosen.length === 1 ? '' : 's') + '?', 'They are removed for everyone and cannot be undone. Enter the owner password.'); if (!p) return; pw = p; }
      else { const r = await ask({ title: 'Remove ' + chosen.length + ' cards for you?', msg: 'Shared cards are hidden only on this device (restorable in Settings); your own cards are deleted for good.', ok: 'Remove' } as any); if (!r || !r.act) return; }
    }
    setBusy(true); const r = await e.batchCards(chosen, op, pw); setBusy(false);
    say(label ? label + ' ' + r.msg : r.msg, !r.ok);
    if (r.ok) { setSel(new Set()); setPanel(''); }
  }
  async function batchAdd() {
    const name = bset === '__new' ? bnew.trim() : bset;
    if (!btext.trim()) return; if (!name) { say('Choose or name the set first.', true); return; }
    let text = btext;
    if (!isCardsFile(text)) {
      const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
      const pipes = lines.length && lines.every(l => (l.match(/\|/g) || []).length >= 2);
      if (!pipes) { const r = importToPack('batch.txt', text, name, true); if (!r.n) { say(r.note || 'No cards found.', true); return; } text = r.text; }
      else text = '#' + name + '\n' + lines.join('\n');
    } else { const r = importToPack('batch.txt', text, name, true); if (!r.n) { say(r.note || 'No cards found.', true); return; } text = r.text; }
    setBusy(true); const r = await e.addPack('batch-' + Date.now() + '.txt', text, 'root', ''); setBusy(false);
    say(r.msg, !r.ok); if (r.ok) setBtext('');
  }

  return (
    <Sheet open={open} onClose={onClose} className="sheet manage">
      <SheetFrame title={<span className="ttl"><Ic n="pencil" /> Manage cards</span>} onClose={onClose}>
        <div className="btabs t3" role="tablist" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Select &amp; edit <b>{e.Q.length}</b></button>
          <button role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')}>Batch add</button>
        </div>
        {msg.t && <p className={'n mgmsg' + (msg.err ? ' err' : '')} role="status">{msg.t}</p>}
        {tab === 'list' && <>
          <div className="mgf">
            <select value={set} onChange={ev => { setSet(ev.target.value); setLimit(PAGE); }} aria-label="Set"><option value="">All sets</option>{sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}</select>
            <select value={kind} onChange={ev => { setKind(ev.target.value as any); setLimit(PAGE); }} aria-label="Card type"><option value="">All types</option>{(Object.keys(KN) as Kind[]).map(k => <option key={k} value={k}>{KN[k]}</option>)}</select>
            <input type="search" value={txt} onChange={ev => { setTxt(ev.target.value); setLimit(PAGE); }} placeholder="Search text…" />
            <label className="pickr"><input type="checkbox" checked={past} onChange={ev => setPast(ev.target.checked)} /><span>Past exam only</span></label>
          </div>
          <div className="mgsel">
            <label className="pickr"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(ids))} /><span>Select all {ids.length} shown</span></label>
            <b>{chosen.length} selected</b>
          </div>
          <div className="sc bscroll mglist">
            {!rows.length && <p className="info">No cards match.</p>}
            {rows.slice(0, limit).map(q => (
              <div key={q.id} className={'mgrow' + (sel.has(q.id) ? ' on' : '')}>
                <input type="checkbox" checked={sel.has(q.id)} onChange={() => toggle(q.id)} aria-label="Select card" />
                <button className="mgtx" onClick={() => toggle(q.id)}><span>{plain(q.q) || '(picture)'}</span><small>{q.c}</small></button>
                <span className="mgk">{KN[kindOf(q.q)]}{q.p ? ' · exam' : ''}</span>
                <button className="ghost" aria-label="Edit card" onClick={() => { onClose(); onEdit(q.id); }}><Ic n="pencil" /></button>
              </div>
            ))}
            {rows.length > limit && <div className="row"><button className="ghost" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button></div>}
          </div>
          {panel === 'move' && <div className="mgpanel">
            <select value={dest} onChange={ev => setDest(ev.target.value)}><option value="">Move to which set?</option>{sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}<option value="__new">New set…</option></select>
            {dest === '__new' && <input type="text" value={newSet} onChange={ev => setNewSet(ev.target.value)} placeholder="Name of the new set" />}
            <button className="solid" disabled={busy || !(dest === '__new' ? newSet.trim() : dest)} onClick={() => run({ op: 'move', s: dest === '__new' ? newSet.trim() : dest }, 'Moved:')}>Move {chosen.length}</button>
          </div>}
          {panel === 'rep' && <div className="mgpanel">
            <input type="text" value={find} onChange={ev => setFind(ev.target.value)} placeholder="Find" />
            <input type="text" value={repl} onChange={ev => setRepl(ev.target.value)} placeholder="Replace with" />
            <select value={scope} onChange={ev => setScope(ev.target.value as any)}><option value="all">Everywhere</option><option value="q">Questions only</option><option value="c">Correct answers only</option><option value="w">Wrong answers only</option></select>
            <label className="pickr"><input type="checkbox" checked={cs} onChange={ev => setCs(ev.target.checked)} /><span>Match case</span></label>
            <button className="solid" disabled={busy || !find} onClick={() => run({ op: 'replace', find, repl, scope, cs })}>Replace in {chosen.length}</button>
          </div>}
          <div className="bfoot mgact">
            {own && <button className="ghost" disabled={!chosen.length || busy} onClick={() => setPanel(panel === 'move' ? '' : 'move')}>Move…</button>}
            <button className="ghost" disabled={!chosen.length || busy} onClick={() => setPanel(panel === 'rep' ? '' : 'rep')}>Find &amp; replace…</button>
            <button className="ghost" disabled={!chosen.length || busy} onClick={() => run({ op: 'past', past: true })}>Mark past exam</button>
            <button className="ghost" disabled={!chosen.length || busy} onClick={() => run({ op: 'past', past: false })}>Unmark</button>
            <button className="ghost danger" disabled={!chosen.length || busy} onClick={() => run({ op: 'delete' })}><Ic n="trash" /> Delete</button>
          </div>
          {!own && <p className="n">You are not the owner: changes here are private to this device (moving cards needs the owner).</p>}
        </>}
        {tab === 'add' && <div className="sc">
          <label className="cl">Add to set</label>
          <select value={bset} onChange={ev => setBset(ev.target.value)}><option value="">Choose a set…</option>{sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}<option value="__new">New set…</option></select>
          {bset === '__new' && <input type="text" value={bnew} onChange={ev => setBnew(ev.target.value)} placeholder="Name of the new set" />}
          <label className="cl">Paste cards, one per line</label>
          <textarea rows={9} value={btext} onChange={ev => setBtext(ev.target.value)} spellCheck={false} style={{ fontFamily: 'monospace', fontSize: 13 }}
            placeholder={'front <TAB or ,> back            (flip card; paste straight from a spreadsheet)\nF: front | back      R: both ways      T: type-in\nC: The {{c1::heart}} pumps blood.\nquestion | right | wrong | wrong | wrong'} />
          <p className="n">{btext.trim() ? btext.split(/\r?\n/).filter(l => l.trim()).length + ' line(s)' : 'Tip: copy two columns from Excel or Google Sheets and paste them here.'}</p>
          <div className="row"><button className="solid" disabled={busy || !btext.trim()} onClick={batchAdd}>{busy ? 'Adding…' : 'Add all'}</button></div>
        </div>}
      </SheetFrame>
    </Sheet>
  );
}
