'use client';
import { useEffect, useMemo, useState } from 'react';
import { askPassword, Sheet, SheetFrame, useEngine } from './ui';

export type EditorState = { mode: 'edit' | 'add'; id?: string; section?: string } | null;

/** Owner-only: edit a card's question and choices, remove it, or add one new card to an existing set. */
export function CardEditor({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const e = useEngine();
  const open = !!state, edit = state?.mode === 'edit';
  const [s, setS] = useState(''), [q, setQ] = useState(''), [c, setC] = useState(''), [w, setW] = useState<string[]>(['', '', '']), [p, setP] = useState(false);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);

  const sets = useMemo(() => {
    if (!open) return [] as { s: string; label: string }[];
    const all = [...new Set(e.Q.map(x => x.s))];
    return all.map(k => { const i = e.FT.secInfo.get(k); return { s: k, label: i ? (i.n ? i.n + ' · ' : '') + i.t : k }; }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [open, e.qver]); // eslint-disable-line

  useEffect(() => {
    if (!state) return;
    setErr(''); setBusy(false);
    if (state.mode === 'edit') {
      const card = state.id ? e.qById(state.id) : null;
      if (card) { setS(card.s); setQ(card.q); setC(card.c); setW(card.w.length ? [...card.w] : ['']); setP(!!card.p); }
    } else { setS(state.section && e.Q.some(x => x.s === state.section) ? state.section : (e.cur ? e.cur.s : '')); setQ(''); setC(''); setW(['', '', '']); setP(false); }
    // eslint-disable-next-line
  }, [state]);

  const wrong = w.map(x => x.trim()).filter(Boolean);
  const ok = q.trim() && c.trim() && wrong.length >= 1 && (edit || s);

  async function save() {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    const m = edit ? await e.editCard(state!.id!, { q: q.trim(), c: c.trim(), w: wrong, p }) : await e.addOneCard({ s, q: q.trim(), c: c.trim(), w: wrong, p });
    setBusy(false);
    if (m) { setErr(m); return; }
    e.toast(edit ? 'Card saved' : 'Card added'); onClose();
  }
  async function remove() {
    if (!state?.id || busy) return;
    const pw = await askPassword('Delete this card?', 'It is removed for everyone and cannot be undone. Enter the owner password.');
    if (!pw) return;
    setBusy(true); setErr('');
    const m = await e.removeCard(state.id, pw);
    setBusy(false);
    if (m) { setErr(m); return; }
    e.toast('Card deleted'); onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} className="sheet cedit">
      <SheetFrame title={edit ? 'Edit card' : 'Add a card'} onClose={onClose}>
        <div className="sc">
          {edit
            ? <p className="n">Set: <b>{(() => { const i = e.FT.secInfo.get(s); return i ? (i.n ? i.n + ' · ' : '') + i.t : s; })()}</b>. Progress, notes and PDF links of this card are kept.</p>
            : <>
              <label className="cl">Add to card set</label>
              <select value={s} onChange={ev => setS(ev.target.value)}>
                {!sets.length && <option value="">No card sets yet</option>}
                {sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}
              </select>
            </>}
          <label className="cl">Question</label>
          <textarea className="cx" value={q} onChange={ev => setQ(ev.target.value)} rows={3} maxLength={3900} placeholder="Type the question" />
          <label className="cl">Correct answer</label>
          <input type="text" value={c} onChange={ev => setC(ev.target.value)} maxLength={3900} placeholder="The right choice" />
          <label className="cl">Wrong answers <small>({wrong.length} of 5)</small></label>
          {w.map((x, i) => (
            <div className="wrow" key={i}>
              <input type="text" value={x} maxLength={3900} placeholder={'Wrong choice ' + (i + 1)} onChange={ev => setW(w.map((y, k) => (k === i ? ev.target.value : y)))} />
              {w.length > 1 && <button type="button" className="ghost" aria-label="Remove this choice" onClick={() => setW(w.filter((_, k) => k !== i))}>✕</button>}
            </div>
          ))}
          {w.length < 5 && <button type="button" className="ghost" onClick={() => setW([...w, ''])}>＋ Add a wrong choice</button>}
          <label className="pickr" style={{ marginTop: 10 }}><input type="checkbox" checked={p} onChange={ev => setP(ev.target.checked)} /><span>Past exam question</span></label>
          {err && <p className="n err" role="alert">{err}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            {edit && <button type="button" className="ghost danger" disabled={busy} onClick={remove}>🗑 Delete card</button>}
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="solid" disabled={!ok || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Add card'}</button>
          </div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
