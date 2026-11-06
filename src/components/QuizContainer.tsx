'use client';
import { Stage } from './Stage';
import { ReferenceDrawer } from './ReferenceDrawer';
import { useEngine } from './ui';

/**
 * The quiz card plus its reference drawer. The quiz state lives in the study engine and the drawer state in the
 * reference store, so toggling the PDF never remounts or resets the question you are answering.
 */
export function QuizContainer({ onInfo }: { onInfo: (id: string) => void }) {
  const e = useEngine();
  return (
    <>
      <Stage onInfo={onInfo} />
      <ReferenceDrawer q={e.cur} />
    </>
  );
}
