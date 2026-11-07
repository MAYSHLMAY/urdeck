'use client';
import { Stage, type CardAct } from './Stage';
import { ReferenceDrawer } from './ReferenceDrawer';
import { useEngine } from './ui';
import { useEffect } from 'react';
import { refs } from '@/lib/refs';

/**
 * The quiz card plus its reference drawer. The quiz state lives in the study engine and the drawer state in the
 * reference store, so toggling the PDF never remounts or resets the question you are answering.
 */
export function QuizContainer({ onInfo, onCard }: { onInfo: (id: string) => void; onCard: CardAct }) {
  const e = useEngine();
  /* get the reference ready in the background for whichever card is on screen (cards with no PDF are skipped) */
  useEffect(() => { refs().prepare(e.cur); }, [e.cur?.id]); // eslint-disable-line
  return (
    <>
      <Stage onInfo={onInfo} onCard={onCard} />
      <ReferenceDrawer q={e.cur} />
    </>
  );
}
