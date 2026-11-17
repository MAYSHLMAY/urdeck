'use client';
import { useEngine } from './ui';
import type { Kind } from '@/lib/kind';

type K = 'all' | Kind;
const GL: Record<K, JSX.Element> = {
  mc: <><circle cx="6" cy="7" r="2.2" /><circle cx="6" cy="17" r="2.2" /><path d="M11 7h9M11 17h9" /></>,
  f: <><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="M12 5v14" /></>,
  c: <><path d="M4 8h5M15 8h5M4 16h16" /><rect x="9.5" y="5.5" width="5" height="5" rx="1.4" /></>,
  t: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 12h6M7 15h3" /></>,
  o: <><rect x="3" y="4" width="18" height="16" rx="3" /><rect x="8" y="9" width="8" height="5" rx="1.2" /></>,
  all: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>
};
export const KGlyph = ({ k }: { k: K }) => <svg viewBox="0 0 24 24" aria-hidden>{GL[k]}</svg>;
export const TYPES: { k: K; t: string; d: string; c: string }[] = [
  { k: 'mc', t: 'Multiple choice', d: 'Pick the right answer from options.', c: '#5B5BD6' },
  { k: 'f', t: 'Flashcards', d: 'Flip the card, then grade yourself.', c: '#E5533C' },
  { k: 'c', t: 'Cloze', d: 'Fill in the hidden words in a sentence.', c: '#16A064' },
  { k: 't', t: 'Type-in', d: 'Type the answer from memory.', c: '#E2A21B' },
  { k: 'o', t: 'Image occlusion', d: 'Reveal the hidden parts of a picture.', c: '#0B7BC4' },
  { k: 'all', t: 'All types', d: 'Mix every card type together.', c: '#8250DF' }
];
export const typeName = (k: K) => TYPES.find(x => x.k === k)?.t || 'All types';

/** Shown when you open Study: pick which kind of card to study. Counts follow the folder you are studying. */
export function TypePicker() {
  const e = useEngine(), kc = e.kindCounts();
  return (
    <section className="tp" aria-label="Choose a card type">
      <header className="tp-h"><h2>What do you want to study?</h2><p>{e.selLabel()}. Pick a card type to start.</p></header>
      <div className="tp-g">
        {TYPES.map(x => {
          const n = kc[x.k]; const off = !n.n;
          return (
            <button key={x.k} type="button" className="uc tp-c" disabled={off} style={{ ['--c' as any]: x.c }} onClick={() => e.setKind(x.k)}>
              <span className="uc-i"><svg viewBox="0 0 24 24" aria-hidden>{GL[x.k]}</svg></span>
              <span className="uc-t">{x.t}</span>
              <span className="uc-d">{off ? 'No cards of this type here.' : x.d}</span>
              <span className="uc-r">
                <span className="uc-b n">{n.n} card{n.n === 1 ? '' : 's'}</span>
                {n.due + n.fresh > 0 && <span className="uc-b n hot">{n.due + n.fresh} to do</span>}
              </span>
              <svg className="uc-wm" viewBox="0 0 24 24" aria-hidden>{GL[x.k]}</svg>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function TypeChip() {
  const e = useEngine();
  const c = TYPES.find(x => x.k === e.kindSel)?.c;
  return <button type="button" className="tp-chip" style={{ ['--c' as any]: c }} onClick={() => { e.resetType(); e.emit(); }}><span className="tp-g2"><KGlyph k={e.kindSel} /></span><b>{typeName(e.kindSel)}</b><span className="tp-x">Change</span></button>;
}
