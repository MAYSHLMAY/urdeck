'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { NOTE_COLORS, type NoteColor } from '@/lib/notes';
import type { PendingSel } from './refHooks';
import { Ic } from './ui';

export interface SelActs { hl: () => void; ul: () => void; st: () => void; note: () => void; copy: () => void; define: () => void; find: () => void }

/**
 * Floating menu next to the selected text, like the one in WPS or Edge. On phones it opens by itself once the selection
 * settles (below the selection handles, so it never covers them); with a mouse it opens on right-click. It follows the page
 * while you scroll and never takes the selection away (pointer-down is cancelled on it).
 */
export function SelMenu({ sel, coarse, color, onColor, acts }: { sel: PendingSel; coarse: boolean; color: NoteColor; onColor: (c: NoteColor) => void; acts: SelActs }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    let raf = 0;
    const upd = () => {
      const pg = document.querySelector(`.pdf-page[data-page="${sel.page}"]`), sc = document.querySelector('.pdf-scroll'), me = ref.current;
      if (!pg || !sc || !me) { setPos(null); return; }
      const pr = pg.getBoundingClientRect(), sr = sc.getBoundingClientRect(), w = me.offsetWidth, h = me.offsetHeight;
      const bx = pr.left + sel.box.x * pr.width, by = pr.top + sel.box.y * pr.height, bw = sel.box.width * pr.width, bh = sel.box.height * pr.height;
      if (by + bh < sr.top || by > sr.bottom) { setPos(null); return; }
      const x = Math.max(sr.left + 6, Math.min(bx + bw / 2 - w / 2, sr.right - w - 6));
      const gapBelow = coarse ? 52 : 10, below = by + bh + gapBelow, above = by - h - (coarse ? 58 : 10);
      let y = below + h <= sr.bottom - 4 ? below : above >= sr.top + 4 ? above : Math.max(sr.top + 4, Math.min(below, sr.bottom - h - 4));
      setPos({ x, y });
    };
    const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(upd); };
    upd();
    const sc = document.querySelector('.pdf-scroll');
    sc?.addEventListener('scroll', tick, { passive: true }); addEventListener('resize', tick);
    return () => { cancelAnimationFrame(raf); sc?.removeEventListener('scroll', tick); removeEventListener('resize', tick); };
  }, [sel, coarse]);
  const B = ({ i, l, f }: { i: string; l: string; f: () => void }) => <button type="button" onClick={f}><Ic n={i} />{l}</button>;
  return (
    <div ref={ref} className="selmenu" role="menu" aria-label="Selected text" style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onPointerDown={ev => ev.preventDefault()} onContextMenu={ev => ev.preventDefault()}>
      <div className="smc" role="radiogroup" aria-label="Colour">
        {NOTE_COLORS.map(c => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={'cdot c-' + c + (color === c ? ' on' : '')} onClick={() => onColor(c)} />)}
      </div>
      <div className="sma">
        <B i="marker" l="Highlight" f={acts.hl} /><B i="underline" l="Underline" f={acts.ul} /><B i="strike" l="Strike" f={acts.st} />
        <B i="note" l="Note" f={acts.note} /><B i="copy" l="Copy" f={acts.copy} /><B i="book" l="Define" f={acts.define} /><B i="search" l="Find" f={acts.find} />
      </div>
    </div>
  );
}
