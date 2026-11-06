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
      <header>{header || <h3>{title}</h3>}<button className="ico" onClick={onClose} aria-label="Close">✕</button></header>
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
