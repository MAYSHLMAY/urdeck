'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseImg, type CardImg } from '@/lib/cardimg';
import { parseOcc, parseOccBody, type Occ } from '@/lib/occ';

/** The cover boxes drawn over a picture. `reveal` uncovers the asked box (and, in hide-all mode, leaves the others covered). */
export function OccMasks({ occ, reveal }: { occ: Occ; reveal?: boolean }) {
  return <>{occ.boxes.map((b, i) => {
    const act = i === occ.idx; if (occ.mode === 'o' && !act) return null;
    return <span key={i} className={'occm' + (act ? ' act' : '') + (act && reveal ? ' rev' : '')} style={{ left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' }}>{act && !reveal ? '?' : ''}</span>;
  })}</>;
}
/** Picture for the live quiz: plain image, or with its cover boxes. */
export function QImg({ src, occ, className, style, reveal }: { src: string; occ?: string; className?: string; style?: React.CSSProperties; reveal?: boolean }) {
  const o = occ ? parseOccBody(occ) : null;
  if (!o) return <img className={className} style={style} src={src} alt="" />;
  return <span className="occw" style={style}><img className={className} src={src} alt="" draggable={false} /><OccMasks occ={o} reveal={reveal} /></span>;
}

/** A card's diagram with numbered pins. Tap a pin to reveal its name; after the answer every name is shown. */
export function CardFigure({ q, img, reveal, compact }: { q?: string; img?: CardImg | null; reveal?: boolean; compact?: boolean }) {
  const im = img ?? (q ? parseImg(q) : null), occ = q ? parseOcc(q) : null;
  const [open, setOpen] = useState<Record<number, 1>>({}), [zoom, setZoom] = useState(false), [z2, setZ2] = useState(false), sc = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!zoom) { setZ2(false); return; }
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setZoom(false); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [zoom]);
  useEffect(() => { const el = sc.current; if (el && z2) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; } }, [z2]);
  if (!im) return null;
  const shown = (i: number) => !!reveal || !!open[i];
  const fig = (big: boolean) => (
    <div className={'cfig' + (big ? ' big' : '') + (compact ? ' sm' : '')}>
      <div className="cfi">
        <img src={im.src} alt="Diagram for this question" draggable={false} style={big && z2 ? { maxWidth: 'none', maxHeight: 'none', width: 'min(230vw, 2200px)', cursor: 'zoom-out' } : big ? { cursor: 'zoom-in' } : undefined} onClick={() => big ? setZ2(v => !v) : setZoom(true)} />
        {occ && <OccMasks occ={occ} reveal={reveal} />}
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
      {zoom && typeof document !== 'undefined' && createPortal(
        <div className="clight" role="dialog" aria-modal="true" aria-label="Picture" onClick={() => setZoom(false)}>
          <div className={'clight-in' + (z2 ? ' z2' : '')} ref={sc} onClick={e => e.stopPropagation()}>{fig(true)}</div>
          <p className="clight-h">{z2 ? 'Scroll to look around. Tap the picture to fit the screen.' : 'Tap the picture to zoom in.'}</p>
          <button type="button" className="clight-x" onClick={() => setZoom(false)}>Close</button>
        </div>, document.body)}
    </>
  );
}
