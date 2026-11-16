'use client';
import { useState } from 'react';
import { FONTS, applyLook, getLook, type Look } from '@/lib/look';

const SEG = (id: keyof Look, opts: [string, string][], v: string, set: (k: keyof Look, v: string) => void) => (
  <div className="ap-seg" role="radiogroup">{opts.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={v === k} className={v === k ? 'on' : ''} onClick={() => set(id, k)}>{l}</button>)}</div>
);

/** Fonts, density, corners and home layout. Saved on this device and applied instantly on every screen. */
export function Appearance({ onArrange }: { onArrange: () => void }) {
  const [lk, setLk] = useState<Look>(getLook());
  const set = (k: keyof Look, v: string) => { applyLook({ [k]: v } as Partial<Look>); setLk(getLook()); };
  return (
    <section className="scard ap"><h4>Look and layout</h4>
      <label className="ap-l">Font</label>
      <div className="ap-fonts" role="radiogroup" aria-label="Font">
        {FONTS.map(([id, name, fam]) => (
          <button key={id} type="button" role="radio" aria-checked={lk.f === id} className={lk.f === id ? 'on' : ''} onClick={() => set('f', id)}>
            <span style={{ fontFamily: fam + ',system-ui,sans-serif' }}>Aa</span><small>{name}</small>
          </button>
        ))}
      </div>
      <label className="ap-l">Spacing</label>
      {SEG('d', [['cozy', 'Cozy'], ['compact', 'Compact']], lk.d, set)}
      <label className="ap-l">Corners</label>
      {SEG('c', [['round', 'Round'], ['soft', 'Soft'], ['sharp', 'Sharp']], lk.c, set)}
      <label className="ap-l">Shortcuts</label>
      {SEG('q', [['grid', 'Grid'], ['row', 'Scroll row']], lk.q, set)}
      <label className="ap-l">Home on wide screens</label>
      {SEG('h', [['stack', 'One column'], ['grid', 'Dashboard']], lk.h, set)}
      <button type="button" className="wl-btn" style={{ marginTop: 14, width: '100%' }} onClick={() => { onArrange(); setTimeout(() => dispatchEvent(new Event('ud-arrange')), 250); }}>Arrange home sections</button>
    </section>
  );
}
