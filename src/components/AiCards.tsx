'use client';
import { useState } from 'react';
import { useEngine } from './ui';
import { useAI } from './AiConnect';
import { importToPack } from '@/lib/exchange';
import { generate, type Gen, type GenKind } from '@/lib/ai/gen';

const KINDS: [GenKind, string][] = [['F', 'Flip'], ['T', 'Type-in'], ['C', 'Fill the blank'], ['Q', 'Multiple choice']];

/** Paste notes, get cards. Review the list, untick what you don't want, add. Needs a connected AI key (Settings). */
export function AiCards({ where, tags, onMsg }: { where: string; tags: string; onMsg: (t: string, c: string) => void }) {
  const e = useEngine(), ai = useAI();
  const [text, setText] = useState(''), [kind, setKind] = useState<GenKind>('F'), [n, setN] = useState(10), [set, setSet] = useState('');
  const [busy, setBusy] = useState(false), [prog, setProg] = useState(''), [list, setList] = useState<Gen[]>([]);
  if (!ai) return <div className="aigen"><p className="n">Turn notes into cards with AI. Connect a free Groq key or an xAI key in Settings → AI helper first.</p></div>;
  const go = async () => {
    if (text.trim().length < 80) { onMsg('Paste a bit more text (at least a few sentences).', 'err'); return; }
    setBusy(true); setList([]); onMsg('', '');
    const r = await generate(text, kind, n, (d, t) => setProg(t > 1 ? 'Reading part ' + Math.min(d + 1, t) + ' of ' + t + '…' : 'Writing cards…'));
    setBusy(false); setProg(''); setList(r.cards);
    if (r.error) onMsg((r.cards.length ? 'Stopped early: ' : '') + r.error, 'err');
    else if (!r.cards.length) onMsg('No cards came back. Try more text or another card type.', 'err');
  };
  const on = list.filter(x => x.on), name = set.trim() || 'AI cards';
  const add = async () => {
    if (!on.length) return; setBusy(true);
    const fname = 'ai-' + Date.now() + '.txt', raw = '#' + name.replace(/[|#]/g, ' ') + '\n' + on.map(x => x.line).join('\n'), cv = importToPack(fname, raw, name);
    const r = cv.n ? await e.addPack(fname, cv.text, where, tags) : { ok: false, msg: cv.note || 'Nothing could be added.' };
    setBusy(false); onMsg(r.ok ? 'Added ' + on.length + ' cards to "' + name + '".' : r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { setList([]); setText(''); }
  };
  return (
    <div className="aigen">
      <textarea value={text} onChange={ev => setText(ev.target.value)} placeholder="Paste notes or a chapter here. Cards are made only from this text." disabled={busy} />
      <div className="row">
        <select value={kind} onChange={ev => setKind(ev.target.value as GenKind)} disabled={busy} aria-label="Card type">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={n} onChange={ev => setN(+ev.target.value)} disabled={busy} aria-label="How many">{[5, 10, 20, 30].map(x => <option key={x} value={x}>about {x}</option>)}</select>
        <input type="text" value={set} onChange={ev => setSet(ev.target.value)} placeholder="Set name" maxLength={60} disabled={busy} />
      </div>
      <div className="row"><button className="solid" type="button" disabled={busy || !text.trim()} onClick={go}>{busy ? prog || 'Working…' : 'Make cards'}</button></div>
      {list.length > 0 && <>
        <p className="n"><b>{on.length}</b> of {list.length} selected. Check them before adding; AI can be wrong.</p>
        <ul className="agl">{list.map((g, i) => <li key={i}><label><input type="checkbox" checked={g.on} onChange={() => setList(l => l.map((x, j) => j === i ? { ...x, on: !x.on } : x))} /> <span>{g.label}{g.back ? <small> → {g.back}</small> : null}</span></label></li>)}</ul>
        <div className="row"><button className="solid" type="button" disabled={busy || !on.length} onClick={add}>Add {on.length} cards</button><button className="ghost" type="button" onClick={() => setList([])}>Discard</button></div>
      </>}
    </div>
  );
}
