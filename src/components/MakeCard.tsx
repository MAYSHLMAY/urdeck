'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';
import { isOwner } from '@/lib/api';
import { clozeNums, clozeCards, distractors, withKind } from '@/lib/kind';

/** Highlight to card: turn text selected in the PDF into a cloze or flip card that remembers its page. */
export function MakeCard({ open, onClose, text, pdfId, page }: { open: boolean; onClose: () => void; text: string; pdfId: string; page: number }) {
  const e = useEngine(), own = isOwner();
  const [mode, setMode] = useState<'c' | 'f'>('c'), [body, setBody] = useState(''), [front, setFront] = useState(''), [set, setSet] = useState(''), [nw, setNw] = useState('');
  const [err, setErr] = useState(''), [done, setDone] = useState(false), ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) { setBody(text.replace(/\s+/g, ' ').trim()); setFront(''); setErr(''); setDone(false); setMode(text.trim().split(/\s+/).length > 4 ? 'c' : 'f'); } }, [open, text]);
  const sets = useMemo(() => open ? [...new Set(e.Q.map(x => x.s))].map(k => { const i = e.FT.secInfo.get(k); return { s: k, label: i ? (i.n ? i.n + ' · ' : '') + i.t : k }; }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) : [], [open, e.qver]); // eslint-disable-line
  useEffect(() => { if (open && !set && sets.length) setSet(sets[0].s); }, [open, sets]); // eslint-disable-line
  const hide = () => { const t = ta.current; if (!t || t.selectionStart === t.selectionEnd) { setErr('Select the words to hide inside the box first.'); return; }
    const a = t.selectionStart, b = t.selectionEnd, n = clozeNums(body).length + 1; setErr(''); setBody(body.slice(0, a) + '{{c' + n + '::' + body.slice(a, b) + '}}' + body.slice(b)); };
  const name = set === '__new' ? nw.trim() : set, src = '<!--src:' + pdfId + ':' + page + '-->';
  const ok = !!name && (mode === 'c' ? clozeNums(body).length > 0 : front.trim() && body.trim());
  async function save() {
    setErr(''); const pool = e.Q.filter(x => x.s === name);
    const list = mode === 'c' ? clozeCards(body) : [{ q: front.trim(), c: body.trim() }];
    let m: string | null = null;
    for (const it of list) {
      const row = { q: withKind(it.q, mode).slice(0, 3800) + src, c: it.c, w: distractors(it.c, pool), p: false };
      m = own ? await e.addOneCard({ s: name, ...row }) : e.myAddCard({ s: name, ...row }); if (m) break;
    }
    if (m) { setErr(m); return; }
    setDone(true); e.toast(list.length > 1 ? list.length + ' cards made' : 'Card made'); setTimeout(onClose, 500);
  }
  return (
    <Sheet open={open} onClose={onClose} className="sheet mkcard">
      <SheetFrame title={<span className="ttl"><Ic n="sparkle" /> Make a card · p. {page}</span>} onClose={onClose}>
        <div className="sc">
          <div className="kinds" role="tablist"><button type="button" role="tab" aria-selected={mode === 'c'} className={'kb' + (mode === 'c' ? ' on' : '')} onClick={() => setMode('c')}><b>Cloze</b><small>Hide words in the sentence</small></button>
            <button type="button" role="tab" aria-selected={mode === 'f'} className={'kb' + (mode === 'f' ? ' on' : '')} onClick={() => setMode('f')}><b>Flip</b><small>You write the question</small></button></div>
          {mode === 'f' && <><label className="cl">Front (question)</label><textarea rows={2} value={front} onChange={ev => setFront(ev.target.value)} placeholder="What does this passage answer?" autoFocus /></>}
          <label className="cl">{mode === 'c' ? 'Text' : 'Back (from the page)'}</label>
          <textarea ref={ta} rows={5} value={body} onChange={ev => setBody(ev.target.value)} maxLength={3800} />
          {mode === 'c' && <div className="clzbar"><button type="button" className="ghost" onClick={hide}>Hide selected words</button><small>{clozeNums(body).length ? clozeNums(body).length + ' hidden' : 'Select words in the box, then tap the button'}</small></div>}
          <label className="cl">Set</label>
          <select value={set} onChange={ev => setSet(ev.target.value)}>{sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}<option value="__new">New set…</option></select>
          {set === '__new' && <input type="text" value={nw} onChange={ev => setNw(ev.target.value)} placeholder="Name of the new set" />}
          {err && <p className="err" role="alert">{err}</p>}
          <p className="n">The card remembers this page, so you can jump back to it after a miss.</p>
          <div className="row"><button className="ghost" onClick={onClose}>Cancel</button><button className="solid" disabled={!ok || done} onClick={save}><Ic n="check" /> Make card</button></div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
