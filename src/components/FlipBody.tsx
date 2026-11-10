'use client';
import { useEffect, useRef, useState } from 'react';
import { useEngine } from './ui';
import { sameAnswer, clozeAnswer, activeCloze, stripKind } from '@/lib/kind';
import { qText } from '@/lib/cardimg';

/** Anki-style study body: show the answer (or type it), then grade yourself Again / Hard / Good / Easy. */
export function FlipBody({ kind, cur, c, rev, setRev }: { kind: string; cur: any; c: any; rev: boolean; setRev: (v: boolean) => void }) {
  const e = useEngine();
  const [typed, setTyped] = useState(''), inp = useRef<HTMLInputElement>(null);
  const ans = kind === 'c' ? clozeAnswer(stripKind(cur.q), activeCloze(cur.q)) || cur.c : cur.c;
  const hit = kind === 't' && rev && sameAnswer(typed, ans);
  const reveal = () => setRev(true);
  useEffect(() => { if (kind === 't' && !rev) inp.current?.focus(); }, []); // eslint-disable-line
  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('dialog[open]')) return;
      const tg = (ev.target as HTMLElement)?.tagName;
      if (tg === 'TEXTAREA' || tg === 'SELECT' || (tg === 'INPUT' && !(ev.target as HTMLElement).classList.contains('flipin'))) return;
      if (!rev) { if (ev.key === ' ' && tg !== 'INPUT' || ev.key === 'Enter') { ev.preventDefault(); reveal(); } return; }
      if (tg === 'INPUT') return;
      if (/^[1-4]$/.test(ev.key)) e.flipGrade(+ev.key - 1);
      else if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); e.flipGrade(hit || kind !== 't' ? 2 : 0); }
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [rev, hit, kind, cur.id]); // eslint-disable-line
  const sug = kind === 't' ? (hit ? 2 : 0) : -1;
  return (
    <div className="flip">
      {kind === 't' && <input ref={inp} className="flipin" type="text" value={typed} disabled={rev} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Type your answer" onChange={ev => setTyped(ev.target.value)} />}
      {!rev && <button className="solid wide" onClick={reveal}>{kind === 't' ? 'Check' : 'Show answer'}</button>}
      {rev && <>
        {kind === 't' && <p className={'say ' + (hit ? 'yes' : 'no')}>{hit ? 'Matches.' : typed.trim() ? 'Not the same:' : 'Skipped:'} <span className="flipyou">{typed}</span></p>}
        {kind !== 'c' && <div className="flipans" dangerouslySetInnerHTML={{ __html: ans }} />}
        <div className="grades g4">
          {([[0, 'Again'], [1, 'Hard'], [2, 'Good'], [3, 'Easy']] as [number, string][]).map(([g, n]) => (
            <button key={g} className={'g g' + g + (sug === g ? ' sug' : '')} onClick={() => e.flipGrade(g)}><b>{n}</b><small>{e.lab(cur.id, c, g)}</small></button>
          ))}
        </div>
      </>}
    </div>
  );
}
