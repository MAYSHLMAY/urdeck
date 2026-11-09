'use client';
import { useRef, useState } from 'react';
import { compressImage, parseImg, withImg, type CardImg } from '@/lib/cardimg';
import { api, isOwner } from '@/lib/api';
import { Ic } from './ui';

/** Picture + pins editor. `value` is the whole question string (text + picture token); `onChange` gets the new one. */
export function ImageField({ value, onChange, forceLocal }: { value: string; onChange: (q: string) => void; forceLocal?: boolean }) {
  const img = parseImg(value), file = useRef<HTMLInputElement>(null), box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const set = (n: CardImg | null) => onChange(withImg(value, n));

  async function pick(f?: File | null) {
    if (!f) return; setErr('');
    if (!/^image\//.test(f.type)) { setErr('Choose an image file.'); return; }
    try {
      const owner = isOwner() && !forceLocal;
      setBusy('Shrinking…');
      const data = await compressImage(f, owner ? 1400 : 1000, owner ? 600_000 : 140_000);
      let src = data;
      if (owner) { setBusy('Uploading…'); const r = await api<{ url: string }>('/api/cardimg', { data }); src = r.url; }
      set({ src, pins: img?.pins || [] });
    } catch (x: any) { setErr(x?.message || 'Could not use that picture.'); }
    setBusy('');
  }
  function addPin(ev: React.MouseEvent) {
    if (!img || !box.current) return;
    const r = box.current.getBoundingClientRect();
    if (img.pins.length >= 12) { setErr('Up to 12 pins.'); return; }
    set({ ...img, pins: [...img.pins, { t: '', x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height }] });
  }
  return (
    <div className="imgf">
      <label className="cl">Picture <small>(optional diagram)</small></label>
      <input ref={file} type="file" accept="image/*" hidden onChange={ev => { const t = ev.target; pick(t.files?.[0]); t.value = ''; }} />
      {!img && <button type="button" className="ghost imgadd" disabled={!!busy} onClick={() => file.current?.click()}><Ic n="plus" /> {busy || 'Add a picture'}</button>}
      {img && <>
        <div className="imgprev" ref={box} onClick={addPin} title="Tap the picture to add a pin">
          <img src={img.src} alt="" draggable={false} />
          {img.pins.map((p, i) => <span key={i} className="cpin on" style={{ left: p.x * 100 + '%', top: p.y * 100 + '%' }}><b>{i + 1}</b></span>)}
        </div>
        <p className="n">Tap the picture to drop a numbered pin, then name it. Names are hidden until the learner taps a pin or answers.</p>
        {img.pins.map((p, i) => (
          <div className="wrow" key={i}>
            <b className="pinno">{i + 1}</b>
            <input type="text" value={p.t} maxLength={60} placeholder="Name of this part" onChange={ev => set({ ...img, pins: img.pins.map((y, k) => k === i ? { ...y, t: ev.target.value.replace(/[>|]/g, '') } : y) })} />
            <button type="button" className="ghost" aria-label="Remove pin" onClick={() => set({ ...img, pins: img.pins.filter((_, k) => k !== i) })}><Ic n="close" /></button>
          </div>
        ))}
        <div className="row"><button type="button" className="ghost" disabled={!!busy} onClick={() => file.current?.click()}>{busy || 'Replace picture'}</button><button type="button" className="ghost danger" onClick={() => set(null)}><Ic n="trash" /> Remove picture</button></div>
      </>}
      {err && <p className="n err" role="alert">{err}</p>}
    </div>
  );
}
