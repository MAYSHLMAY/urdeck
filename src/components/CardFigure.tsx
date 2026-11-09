'use client';
import { useState } from 'react';
import { parseImg, type CardImg } from '@/lib/cardimg';

/** A card's diagram with numbered pins. Tap a pin to reveal its name; after the answer every name is shown. */
export function CardFigure({ q, img, reveal, compact }: { q?: string; img?: CardImg | null; reveal?: boolean; compact?: boolean }) {
  const im = img ?? (q ? parseImg(q) : null);
  const [open, setOpen] = useState<Record<number, 1>>({}), [zoom, setZoom] = useState(false);
  if (!im) return null;
  const shown = (i: number) => !!reveal || !!open[i];
  const fig = (big: boolean) => (
    <div className={'cfig' + (big ? ' big' : '') + (compact ? ' sm' : '')}>
      <div className="cfi">
        <img src={im.src} alt="Diagram for this question" draggable={false} onClick={() => !big && setZoom(true)} />
        {im.pins.map((p, i) => (
          <button key={i} type="button" className={'cpin' + (shown(i) ? ' on' : '')} style={{ left: p.x * 100 + '%', top: p.y * 100 + '%' }} aria-label={shown(i) ? p.t : 'Pin ' + (i + 1) + ', tap to reveal'}
            onClick={ev => { ev.stopPropagation(); setOpen(o => { const n = { ...o }; if (n[i]) delete n[i]; else n[i] = 1; return n; }); }}>
            <b>{i + 1}</b>{shown(i) && <span className={p.x > 0.6 ? 'l' : ''}>{p.t}</span>}
          </button>
        ))}
      </div>
      {im.pins.length > 0 && !compact && <p className="cfh">{reveal ? im.pins.map((p, i) => i + 1 + '. ' + p.t).join('  ·  ') : 'Tap a pin to reveal its name · tap the picture to enlarge'}</p>}
    </div>
  );
  return (
    <>
      {fig(false)}
      {zoom && <div className="clight" role="dialog" aria-modal onClick={() => setZoom(false)}><div onClick={e => e.stopPropagation()}>{fig(true)}</div><button className="ghost" onClick={() => setZoom(false)}>Close</button></div>}
    </>
  );
}
