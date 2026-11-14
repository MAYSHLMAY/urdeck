'use client';
import { useMemo } from 'react';
import { useEngine } from './ui';
import { related } from '@/lib/ai/smart';
import { plain } from '@/lib/ai/text';
import { qText } from '@/lib/cardimg';

/** Cards that talk about the same thing, found by similarity. Tap one to peek at its answer, or practice them together. */
export function Related({ id }: { id: string }) {
  const e = useEngine();
  const r = useMemo(() => (e.O.smart === false ? [] : related(e, id, 3)), [id, e.qver, e.O.smart]); // eslint-disable-line
  if (!r.length) return null;
  const cut = (t: string) => { const p = plain(qText(t)); return p.length > 46 ? p.slice(0, 44) + '…' : p; };
  return (
    <div className="rel" aria-label="Related cards">
      <div>{r.map(x => <button key={x.q.id} className="ghost" onClick={() => e.toast(cut(x.q.q) + ' → ' + plain(x.q.c))}>{cut(x.q.q)}</button>)}</div>
      <button className="ghost" onClick={() => e.startPracticeIds([id, ...r.map(x => x.q.id)])}>Practice these together</button>
    </div>
  );
}
