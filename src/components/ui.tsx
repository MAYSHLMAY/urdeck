'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { engine, type Engine } from '@/lib/engine';

/** Subscribe a component to the study engine. */
export function useEngine(): Engine {
  const e = engine();
  useSyncExternalStore(e.subscribe, e.getVer, e.getVer);
  return e;
}

export const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const IC: Record<string, ReactNode> = {
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  chart: <path d="M4 20V11M10 20V4M16 20v-6M22 20H2" />,
  set: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  cube: <><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>
};
const P: Record<string, ReactNode> = {
  fire: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3M14 9l2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  book: <path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13" />,
  cap: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>,
  cube: <><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  marker: <><path d="m4 20 4-1 10-10-3-3L5 16z" /><path d="m14 6 3 3M4 20h6" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17v4M17 19h4" /></>,
  pin: <path d="M6 3h12v18l-6-4-6 4z" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 5 5 9-10" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  cloud: <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18z" />,
  pencil: <><path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" /><path d="m14 7 3 3" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  chevD: <path d="m6 9 6 6 6-6" />, chevL: <path d="m15 6-6 6 6 6" />, chevR: <path d="m9 6 6 6-6 6" />,
  arrowL: <path d="M19 12H5M11 6l-6 6 6 6" />, arrowR: <path d="M5 12h14M13 6l6 6-6 6" />, arrowU: <path d="M12 19V5M6 11l6-6 6 6" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  clip: <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7L9.2 17.2a1.7 1.7 0 0 1-2.4-2.4L14.5 7" />,
  mappin: <><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z" /><circle cx="8" cy="11" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="11" r="1" /></>,
  data: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3 3 7 3s7-1.3 7-3" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  dots: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  note: <><path d="M5 4h14v12l-4 4H5z" /><path d="M15 20v-4h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  list: <path d="M4 6h16M4 12h16M4 18h16" />
};
const FILLED = new Set(['play', 'dots']);
/** Small line icon that follows the text colour and size. `fill` fills it (e.g. a pinned star). */
export const Ic = ({ n, fill, className = '' }: { n: string; fill?: boolean; className?: string }) => (
  <svg className={'i ' + className} viewBox="0 0 24 24" aria-hidden="true" data-fill={fill || FILLED.has(n) ? 1 : undefined}>{P[n]}</svg>
);

export const Icon = ({ n }: { n: string }) => <svg viewBox="0 0 24 24">{IC[n]}</svg>;

/** A native <dialog> that opens and closes from a boolean and only renders its content while open. */
export function Sheet({ open, onClose, className = 'sheet', children }: { open: boolean; onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} onClose={onClose} onClick={ev => { if (ev.target === ref.current) onClose(); }}>
      {open ? children : null}
    </dialog>
  );
}

export function SheetFrame({ title, onClose, header, children }: { title?: ReactNode; onClose: () => void; header?: ReactNode; children: ReactNode }) {
  return (
    <div className="in">
      <header>{header || <h3>{title}</h3>}<button className="ico" onClick={onClose} aria-label="Close"><Ic n="close" /></button></header>
      {children}
    </div>
  );
}

/* ---------- small prompt dialog: ask({title, text, sel, acts}) -> Promise ---------- */
export interface AskOpts { title: string; msg?: string; text?: string | null; sel?: { id: string; label: string }[]; selv?: string; acts?: { k: string; l: string }[]; ok?: string; password?: boolean }
export interface AskRes { text?: string; sel?: string | null; act?: string }
let _ask: ((o: AskOpts) => Promise<AskRes | null>) | null = null;
export const ask = (o: AskOpts) => new Promise<AskRes | null>(r => setTimeout(() => (_ask ? _ask(o).then(r) : r(null)), 70));

/** Ask for the owner password before a delete. Returns the typed password, or null if cancelled. */
export async function askPassword(title: string, msg: string): Promise<string | null> {
  const r = await ask({ title, msg, text: '', password: true, ok: 'Delete' });
  return r && r.text ? r.text : null;
}

const INP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', font: 'inherit', padding: '9px 10px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', marginTop: 8 };

export function AskHost() {
  const [st, setSt] = useState<{ o: AskOpts; res: (v: AskRes | null) => void } | null>(null);
  const tx = useRef<HTMLInputElement>(null), sl = useRef<HTMLSelectElement>(null), done = useRef(false);
  useEffect(() => { _ask = o => new Promise(res => { done.current = false; setSt({ o, res }); }); return () => { _ask = null; }; }, []);
  useEffect(() => { if (st && tx.current) { tx.current.focus(); tx.current.select(); } }, [st]);
  const fin = (v: AskRes | null) => { if (done.current || !st) return; done.current = true; st.res(v); setSt(null); };
  const o = st?.o;
  return (
    <Sheet open={!!st} onClose={() => fin(null)} className="mini2">
      {o && <div>
        <h3 style={{ margin: '0 0 6px' }}>{o.title}</h3>
        {o.msg && <p className="n">{o.msg}</p>}
        {o.text != null && <input ref={tx} type={o.password ? 'password' : 'text'} autoComplete={o.password ? 'current-password' : 'off'} defaultValue={o.text} maxLength={o.password ? 200 : 60} style={INP} onKeyDown={ev => { if (ev.key === 'Enter') fin({ text: tx.current!.value.trim(), sel: null }); }} />}
        {o.sel && <select ref={sl} defaultValue={o.selv} style={INP}>{o.sel.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>}
        {o.acts && o.acts.map(a => <button key={a.k} className="ghost wide" style={{ marginTop: 8, width: '100%' }} onClick={() => fin({ act: a.k })}>{a.l}</button>)}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" type="button" onClick={() => fin(null)}>Cancel</button>
          {!o.acts && <button className="solid" type="button" onClick={() => fin({ text: tx.current ? tx.current.value.trim() : '', sel: sl.current ? sl.current.value : null })}>{o.ok || 'OK'}</button>}
        </div>
      </div>}
    </Sheet>
  );
}

export function Toast() {
  const e = useEngine();
  return <div id="toast" className={e.toastOn ? 'on' : ''}>{e.toastMsg}</div>;
}

export const dl = (name: string, text: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
};
