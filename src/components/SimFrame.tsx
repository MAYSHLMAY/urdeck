'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { simDoc } from '@/lib/sim';
import { useStage, StageBar } from './useStage';

const RATIOS: [string, number, number][] = [['Fill', 0, 0], ['16:9', 1280, 720], ['4:3', 1024, 768], ['1:1', 800, 800], ['9:16', 540, 960]];

/** Runs a free-form 2D/3D simulation in a sandbox. "Fill" lets it fill the space; a ratio keeps a fixed design size and scales it to fit. */
export default function SimFrame({ code, name, kind }: { code: string; name: string; kind: '2D' | '3D' }) {
  const box = useRef<HTMLDivElement>(null), fr = useRef<HTMLIFrameElement>(null);
  const [mode, setMode] = useState(0), [n, setN] = useState(0), [sz, setSz] = useState({ w: 0, h: 0 });
  const st = useStage(box, { rotate: true });
  const doc = useMemo(() => simDoc(code, location.origin), [code, n]); // eslint-disable-line
  useEffect(() => {
    const el = box.current!; const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [, dw, dh] = RATIOS[mode];
  const sc = dw ? Math.min(sz.w / dw, sz.h / dh) : 1;
  const style: React.CSSProperties = dw
    ? { width: dw, height: dh, transform: `scale(${sc})`, transformOrigin: 'top left', position: 'absolute', left: (sz.w - dw * sc) / 2, top: (sz.h - dh * sc) / 2 }
    : { width: '100%', height: '100%' };
  return (
    <div className="simw">
      <div className="simbar">
        <b>{name}</b><span className="simk">{kind} simulation</span>
        <span className="simsp" />
        <div className="simr" role="group" aria-label="Size">
          {RATIOS.map((r, i) => <button key={r[0]} className={mode === i ? 'on' : ''} onClick={() => setMode(i)} title={i ? 'Keep ' + r[1] + '×' + r[2] + ' and scale to fit' : 'Let the simulation fill the space'}>{r[0]}</button>)}
        </div>
        <button onClick={() => setN(n + 1)} title="Restart">↻</button>
      </div>
      <div className={'simbox ' + st.cls} ref={box}>
        <iframe ref={fr} key={n} title={name} style={style} srcDoc={doc} sandbox="allow-scripts allow-pointer-lock allow-forms allow-modals" allow="fullscreen; accelerometer; gyroscope" />
        <StageBar st={st}><button type="button" onClick={() => setN(x => x + 1)} aria-label="Restart" title="Restart"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" /></svg></button></StageBar>
      </div>
    </div>
  );
}
