'use client';
import { useEffect, useMemo, useState } from 'react';
import { ask, askPassword, Sheet, SheetFrame, useEngine, Ic } from './ui';
import { isOwner } from '@/lib/api';
import { qText, withImg, parseImg } from '@/lib/cardimg';
import { ImageField } from './ImageField';
import { OccEditor, type Mask } from './OccEditor';
import { occToken } from '@/lib/occ';
import { kindOf, withKind, clozeCards, clozeNums, distractors, type Kind } from '@/lib/kind';

const raw = (q: string) => String(q || '').replace(/<!--(?:img|k|occ):[^>]*-->/g, '');
const KINDS: [Kind | 'r', string, string][] = [['mc', 'Multiple choice', 'Pick the right answer'], ['f', 'Flip card', 'Front and back, like Anki'], ['r', 'Reversed', 'Two flip cards, both directions'], ['t', 'Type answer', 'You type it, then compare'], ['c', 'Cloze', 'Hide words in a sentence'], ['o', 'Image occlusion', 'Cover parts of a picture']];

export type EditorState = { mode: 'edit' | 'add'; id?: string; section?: string } | null;

/** Owner: changes are saved for everyone. Everyone else: changes are private, kept on this device only. */
export function CardEditor({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const e = useEngine();
  const open = !!state, edit = state?.mode === 'edit';
  const [s, setS] = useState(''), [q, setQ] = useState(''), [c, setC] = useState(''), [w, setW] = useState<string[]>(['', '', '']), [p, setP] = useState(false);
  const [kind, setKind] = useState<Kind | 'r'>('mc');
  const [masks, setMasks] = useState<Mask[]>([]), [omode, setOmode] = useState<'o' | 'a'>('o');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [ns, setNs] = useState('');
  // private mode: not the owner, or the card is one of my own
  const mine = !!(state?.id && e.isMine(state.id));
  const priv = !isOwner() || mine;

  const sets = useMemo(() => {
    if (!open) return [] as { s: string; label: string }[];
    const all = [...new Set(e.Q.map(x => x.s))];
    return all.map(k => { const i = e.FT.secInfo.get(k); return { s: k, label: i ? (i.n ? i.n + ' · ' : '') + i.t : k }; }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [open, e.qver]); // eslint-disable-line

  useEffect(() => {
    if (!state) return;
    setErr(''); setBusy(false); setNs('');
    if (state.mode === 'edit') {
      const card = state.id ? e.qById(state.id) : null;
      if (card) { setS(card.s); setQ(card.q); setC(card.c); setW(card.w.length ? [...card.w] : ['']); setP(!!card.p); setKind(kindOf(card.q)); }
    } else { setS(state.section && e.Q.some(x => x.s === state.section) ? state.section : (e.cur ? e.cur.s : '')); setQ(''); setC(''); setW(['', '', '']); setP(false); setKind('mc'); setMasks([]); setOmode('o'); }
    // eslint-disable-next-line
  }, [state]);

  const wrong = w.map(x => x.trim()).filter(Boolean);
  const setName = s === '__new' ? ns.trim() : s;
  const flip = kind !== 'mc', occNew = kind === 'o' && !edit, hasImg = /<!--img:/.test(q);
  const nums = clozeNums(raw(q));
  const ok = (kind === 'o' && !edit ? hasImg && masks.length > 0 && masks.every(m => m.t.trim()) : raw(q).trim() && (kind === 'c' ? nums.length > 0 : c.trim())) && (flip || wrong.length >= 1) && (edit || setName);

  async function save() {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    if (flip || kind === 'mc' && kindOf(q) !== 'mc') {
      const pool = e.Q.filter(x => x.s === (edit ? s : setName) && x.id !== state?.id);
      const img = (q.match(/<!--img:[^>]*-->/) || [''])[0], txt = raw(q).trim();
      let list: { q: string; c: string }[];
      if (occNew) {
        const imgTok = (q.match(/<!--img:[^>]*-->/) || [''])[0], boxes = masks.map(({ x, y, w, h }) => ({ x, y, w, h })), txt0 = raw(q).trim() || 'What is hidden under the box?';
        list = masks.map((m, i) => ({ q: txt0 + imgTok + occToken({ mode: omode, idx: i, boxes }), c: m.t.trim() }));
      } else if (kind === 'c') { const all = clozeCards(txt); list = edit ? [all[0]] : all; }
      else if (kind === 'r' && !edit) list = [{ q: txt + img, c: c.trim() }, { q: c.trim(), c: txt }];
      else list = [{ q: txt + img, c: c.trim() }];
      const k: Kind = kind === 'r' ? 'f' : kind;
      let m: string | null = null;
      for (let i = 0; i < list.length && !m; i++) {
        const sib = occNew ? masks.filter((_, j) => j !== i).map(m => ({ c: m.t.trim() })) : [];
        const w3 = distractors(list[i].c, sib, 3).filter(x => sib.some(y => y.c === x)).concat();
        const row = { q: withKind(list[i].q, k), c: list[i].c, w: [...w3, ...distractors(list[i].c, [...pool, ...sib], 3).filter(x => !w3.includes(x))].slice(0, 3), p };
        m = priv ? (edit ? e.myEditCard(state!.id!, row) : e.myAddCard({ s: setName, ...row })) : edit ? await e.editCard(state!.id!, row) : await e.addOneCard({ s, ...row });
      }
      setBusy(false); if (m) { setErr(m); return; }
      e.toast(list.length > 1 ? list.length + ' cards added' : edit ? 'Card saved' : 'Card added'); onClose(); return;
    }
    if (priv) {
      const m = edit ? e.myEditCard(state!.id!, { q: q.trim(), c: c.trim(), w: wrong, p }) : e.myAddCard({ s: setName, q: q.trim(), c: c.trim(), w: wrong, p });
      setBusy(false); if (m) { setErr(m); return; }
      e.toast(edit ? 'Saved for you' : 'Card added for you'); onClose(); return;
    }
    const m = edit ? await e.editCard(state!.id!, { q: q.trim(), c: c.trim(), w: wrong, p }) : await e.addOneCard({ s, q: q.trim(), c: c.trim(), w: wrong, p });
    setBusy(false);
    if (m) { setErr(m); return; }
    e.toast(edit ? 'Card saved' : 'Card added'); onClose();
  }
  async function remove() {
    if (!state?.id || busy) return;
    if (priv) {
      const r = await ask({ title: mine ? 'Delete your card?' : 'Remove this card for you?', msg: mine ? 'This card exists only on this device, so it will be gone for good.' : 'It is hidden only on this device. Everyone else still sees it, and you can bring it back in Settings.', acts: [{ k: 'ok', l: mine ? 'Delete my card' : 'Remove for me' }] });
      if (r && r.act) { e.myRemoveCard(state.id); e.toast(mine ? 'Card deleted' : 'Card removed for you'); onClose(); }
      return;
    }
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
      <SheetFrame title={edit ? (priv ? 'Edit card (only for you)' : 'Edit card') : (priv ? 'Add your own card' : 'Add a card')} onClose={onClose}>
        <div className="sc">
          {edit
            ? <p className="n">Set: <b>{(() => { const i = e.FT.secInfo.get(s); return i ? (i.n ? i.n + ' · ' : '') + i.t : s; })()}</b>. Progress, notes and PDF links of this card are kept.{priv && !mine ? ' Your version is saved only on this device; the original is untouched.' : ''}</p>
            : <>
              <label className="cl">Add to card set</label>
              <select value={s} onChange={ev => setS(ev.target.value)}>
                {!sets.length && !priv && <option value="">No card sets yet</option>}
                {sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}
                {priv && <option value="__new">New set of my own…</option>}
              </select>
              {s === '__new' && <input type="text" value={ns} onChange={ev => setNs(ev.target.value)} maxLength={80} placeholder="Name of your set, e.g. My weak spots" />}
              {priv && <p className="n">Private: stays on this device and is never uploaded.</p>}
            </>}
          {!edit && <div className="kinds" role="tablist" aria-label="Card type">
            {KINDS.map(([k, l, d]) => <button key={k} type="button" role="tab" aria-selected={kind === k} className={'kb' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}><b>{l}</b><small>{d}</small></button>)}
          </div>}
          {!occNew && <label className="cl">{kind === 'c' ? 'Text (wrap hidden words like {{c1::this}})' : flip ? 'Front' : 'Question'}</label>}
          <textarea value={raw(q)} onChange={ev => setQ(ev.target.value + ((q.match(/<!--(?:img|k|occ):[^>]*-->/g) || []).join('')))} rows={3} maxLength={3900} placeholder={kind === 'c' ? 'The {{c1::heart}} pumps {{c2::blood}}.' : 'Type the question'} />
          {kind === 'c' && <div className="clzbar">
            <button type="button" className="ghost" onClick={() => { const t = raw(q), n = clozeNums(t).length + 1; setQ(t + ' {{c' + n + '::answer}}' + (q.match(/<!--(?:img|k|occ):[^>]*-->/g) || []).join('')); }}>+ Add a hidden word</button>
            <small>{nums.length ? nums.length + ' card' + (nums.length > 1 ? 's' : '') + ' will be made (one per number)' : 'Add at least one {{c1::…}}'}</small>
          </div>}
          {kind !== 'c' && <div className={occNew ? 'nopins' : ''}><ImageField value={q} onChange={setQ} forceLocal={priv} /></div>}
          {occNew && <OccEditor value={q} masks={masks} setMasks={setMasks} mode={omode} setMode={setOmode} />}
          {kind !== 'c' && !occNew && <><label className="cl">{flip ? 'Back' : 'Correct answer'}</label>
          <input type="text" value={c} onChange={ev => setC(ev.target.value)} maxLength={3900} placeholder={flip ? 'The answer' : 'The right choice'} /></>}
          {flip && <p className="n">Quiz, exam and browse use this card too: wrong choices are borrowed from other cards in the set automatically.</p>}
          {!flip && <label className="cl">Wrong answers <small>({wrong.length} of 5)</small></label>}
          {!flip && w.map((x, i) => (
            <div className="wrow" key={i}>
              <input type="text" value={x} maxLength={3900} placeholder={'Wrong choice ' + (i + 1)} onChange={ev => setW(w.map((y, k) => (k === i ? ev.target.value : y)))} />
              {w.length > 1 && <button type="button" className="ghost" aria-label="Remove this choice" onClick={() => setW(w.filter((_, k) => k !== i))}><Ic n="close" /></button>}
            </div>
          ))}
          {!flip && w.length < 5 && <button type="button" className="ghost" onClick={() => setW([...w, ''])}><Ic n="plus" /> Add a wrong choice</button>}
          <label className="pickr" style={{ marginTop: 10 }}><input type="checkbox" checked={p} onChange={ev => setP(ev.target.checked)} /><span>Past exam question</span></label>
          {err && <p className="n err" role="alert">{err}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            {edit && <button type="button" className="ghost danger" disabled={busy} onClick={remove}><Ic n="trash" /> {priv && !mine ? 'Remove for me' : 'Delete card'}</button>}
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="solid" disabled={!ok || busy} onClick={save}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Add card'}</button>
          </div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
