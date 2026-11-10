'use client';
import { useRef, useState } from 'react';
import { parseImg } from '@/lib/cardimg';
import type { Box } from '@/lib/occ';
import { Ic } from './ui';

export type Mask = Box & { t: string };

/** Draw cover boxes on the picture (drag), then name what each one hides. */
export function OccEditor({ value, masks, setMasks, mode, setMode }: { value: string; masks: Mask[]; setMasks: (m: Mask[]) => void; mode: 'o' | 'a'; setMode: (m: 'o' | 'a') => void }) {
  const img = parseImg(value), box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Box | null>(null), st = useRef<{ x: number; y: number } | null>(null);
  if (!img) return <p className="n">Add a picture first, then drag on it to cover the parts you want to learn.</p>;
  const pt = (ev: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; };
  const down = (ev: React.PointerEvent) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); st.current = pt(ev); setDrag({ ...st.current, w: 0, h: 0 }); };
  const move = (ev: React.PointerEvent) => { const a = st.current; if (!a) return; const b = pt(ev); setDrag({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }); };
  const up = () => { const d = drag; st.current = null; setDrag(null); if (d && d.w > 0.02 && d.h > 0.02 && masks.length < 30) setMasks([...masks, { ...d, t: '' }]); };
  return (
    <div className="occed">
      <div className="occmode" role="group" aria-label="Mode">
        <button type="button" className={mode === 'o' ? 'on' : ''} onClick={() => setMode('o')}><b>Hide one</b><small>Only the asked box is covered</small></button>
        <button type="button" className={mode === 'a' ? 'on' : ''} onClick={() => setMode('a')}><b>Hide all</b><small>Every box covered, asked one highlighted</small></button>
      </div>
      <div className="occw edit" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { st.current = null; setDrag(null); }}>
        <img src={img.src} alt="" draggable={false} />
        {masks.map((m, i) => <span key={i} className="occm act" style={{ left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%' }}>{i + 1}</span>)}
        {drag && <span className="occm drag" style={{ left: drag.x * 100 + '%', top: drag.y * 100 + '%', width: drag.w * 100 + '%', height: drag.h * 100 + '%' }} />}
      </div>
      <p className="n">Drag on the picture to cover a part, then name it. One card is made per box.</p>
      {masks.map((m, i) => (
        <div className="wrow" key={i}>
          <b className="pinno">{i + 1}</b>
          <input type="text" value={m.t} maxLength={80} placeholder="What is under this box?" onChange={ev => setMasks(masks.map((y, k) => k === i ? { ...y, t: ev.target.value.replace(/[>|]/g, '') } : y))} />
          <button type="button" className="ghost" aria-label="Remove box" onClick={() => setMasks(masks.filter((_, k) => k !== i))}><Ic n="close" /></button>
        </div>
      ))}
    </div>
  );
}
