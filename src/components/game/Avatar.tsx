'use client';
import { useState } from 'react';

/* Avatars: "k:a.b.c.d.e.f" is a hand-drawn stick figure made on the device (no network). "d:style:seed" is a free DiceBear picture
 * (falls back to the stick figure if the picture cannot load). */
const SKIN = ['#f5cba7', '#e0ac69', '#c68642', '#8d5524', '#ffe0bd', '#d9c3f0'];
const BODY = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#7a3fd1', '#e8590c', '#0b7285', '#222222'];
const BG = ['#fde8ec', '#dfeafb', '#fff3cf', '#e0f2d9', '#ece2fb', '#ffe6d5', '#d7f0f4', '#e6e6e6'];
export const HATS = ['none', 'cap', 'top', 'party', 'crown', 'beanie', 'horns', 'halo'];
export const FACES = ['smile', 'grin', 'cool', 'wow', 'wink', 'sleepy'];
export const POSES = ['stand', 'wave', 'cheer', 'dance', 'run', 'think'];
export const DICE = ['adventurer', 'fun-emoji', 'bottts', 'thumbs', 'lorelei', 'big-smile', 'pixel-art', 'avataaars'];
const N = [SKIN.length, BODY.length, BG.length, HATS.length, FACES.length, POSES.length];

export const randomKid = () => 'k:' + N.map(n => Math.floor(Math.random() * n)).join('.');
export const parseK = (av: string) => { const p = (av.startsWith('k:') ? av.slice(2).split('.') : []).map(Number); return N.map((n, i) => ((p[i] >= 0 && p[i] < n) ? p[i] : (i * 3 + 1) % n)); };
export const mkK = (v: number[]) => 'k:' + v.join('.');

function Stick({ v }: { v: number[] }) {
  const [sk, bd, bg, hat, face, pose] = v, c = BODY[bd], skin = SKIN[sk], ink = '#1f1f1f';
  const arms: Record<number, string> = { 0: 'M50 66 L34 82 M50 66 L66 82', 1: 'M50 66 L32 52 M50 66 L66 82', 2: 'M50 66 L34 46 M50 66 L66 46', 3: 'M50 66 L32 76 M50 66 L68 52', 4: 'M50 66 L36 78 M50 66 L66 70', 5: 'M50 66 L36 84 M50 66 L58 52' };
  const legs: Record<number, string> = { 0: 'M50 92 L40 116 M50 92 L60 116', 1: 'M50 92 L40 116 M50 92 L60 116', 2: 'M50 92 L38 114 M50 92 L62 114', 3: 'M50 92 L36 112 M50 92 L66 108', 4: 'M50 92 L34 110 M50 92 L66 114', 5: 'M50 92 L42 116 M50 92 L60 116' };
  const f = FACES[face];
  return (
    <svg viewBox="0 0 100 124" width="100%" height="100%" role="img" aria-label="avatar">
      <rect width="100" height="124" fill={BG[bg]} />
      <ellipse cx="50" cy="119" rx="24" ry="3.5" fill="#0002" />
      <g stroke={c} strokeWidth="5.5" strokeLinecap="round" fill="none"><path d="M50 52 L50 92" /><path d={arms[pose]} /><path d={legs[pose]} /></g>
      <circle cx="50" cy="34" r="19" fill={skin} stroke={ink} strokeWidth="2.5" />
      <g fill={ink} stroke={ink} strokeWidth="2" strokeLinecap="round">
        {f === 'cool' ? <><rect x="34" y="28" width="14" height="8" rx="2" /><rect x="52" y="28" width="14" height="8" rx="2" /><path d="M48 31h4" /></> :
          f === 'sleepy' ? <><path d="M37 32h9M54 32h9" fill="none" /></> :
            f === 'wink' ? <><circle cx="41" cy="31" r="2.6" stroke="none" /><path d="M54 31q4-3 8 0" fill="none" /></> :
              <><circle cx="41" cy="31" r={f === 'wow' ? 3.2 : 2.6} stroke="none" /><circle cx="59" cy="31" r={f === 'wow' ? 3.2 : 2.6} stroke="none" /></>}
        {f === 'wow' ? <ellipse cx="50" cy="44" rx="4" ry="5" /> : f === 'grin' ? <path d="M39 40q11 12 22 0z" fill="#fff" /> : f === 'sleepy' ? <path d="M44 43h12" fill="none" /> : <path d="M40 40q10 9 20 0" fill="none" />}
      </g>
      {hat === 1 && <g><path d="M31 27a19 19 0 0 1 38 0z" fill={c} stroke={ink} strokeWidth="2" /><path d="M31 27h46" stroke={ink} strokeWidth="3" strokeLinecap="round" /></g>}
      {hat === 2 && <g fill="#222" stroke={ink} strokeWidth="2"><rect x="38" y="4" width="24" height="22" /><rect x="28" y="24" width="44" height="5" rx="2" /></g>}
      {hat === 3 && <g><path d="M50 2 36 26h28z" fill="#e8590c" stroke={ink} strokeWidth="2" /><circle cx="50" cy="3" r="3" fill="#ffd43b" /></g>}
      {hat === 4 && <path d="M32 24 34 8l8 9 8-12 8 12 8-9 2 16z" fill="#fcc419" stroke={ink} strokeWidth="2" strokeLinejoin="round" />}
      {hat === 5 && <g><path d="M31 25a19 17 0 0 1 38 0z" fill="#1368ce" stroke={ink} strokeWidth="2" /><circle cx="50" cy="8" r="4" fill="#fff" stroke={ink} strokeWidth="1.5" /></g>}
      {hat === 6 && <g fill="#e21b3c" stroke={ink} strokeWidth="2"><path d="M33 22 28 6l11 8z" /><path d="M67 22 72 6l-11 8z" /></g>}
      {hat === 7 && <ellipse cx="50" cy="9" rx="16" ry="4" fill="none" stroke="#fcc419" strokeWidth="3.5" />}
    </svg>
  );
}

export function Avatar({ av, size = 56, ring }: { av: string; size?: number; ring?: string }) {
  const [bad, setBad] = useState(false);
  const d = av && av.startsWith('d:') && !bad ? av.split(':') : null;
  return (
    <span className="av" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}>
      {d ? <img src={`https://api.dicebear.com/9.x/${encodeURIComponent(d[1])}/svg?seed=${encodeURIComponent(d.slice(2).join(':'))}`} alt="" loading="lazy" onError={() => setBad(true)} /> : <Stick v={parseK(av && av.startsWith('k:') ? av : 'k:' + av.length)} />}
    </span>
  );
}

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<'k' | 'd'>(value.startsWith('d:') ? 'd' : 'k');
  const v = parseK(value), set = (i: number, n: number) => { const w = v.slice(); w[i] = (w[i] + n + N[i]) % N[i]; onChange(mkK(w)); };
  const row = (i: number, label: string) => <div className="apr" key={i}><button type="button" onClick={() => set(i, -1)} aria-label={label + ' previous'}>‹</button><span>{label}</span><button type="button" onClick={() => set(i, 1)} aria-label={label + ' next'}>›</button></div>;
  const seed = value.startsWith('d:') ? value.split(':').slice(2).join(':') : Math.random().toString(36).slice(2, 8);
  return (
    <div className="apick">
      <div className="apv"><Avatar av={value} size={120} /></div>
      <div className="aptabs"><button type="button" className={tab === 'k' ? 'on' : ''} onClick={() => { setTab('k'); if (value.startsWith('d:')) onChange(randomKid()); }}>Stick figure</button><button type="button" className={tab === 'd' ? 'on' : ''} onClick={() => { setTab('d'); if (!value.startsWith('d:')) onChange('d:adventurer:' + seed); }}>Online avatars</button></div>
      {tab === 'k' ? <div className="apc">{row(0, 'Skin')}{row(1, 'Shirt')}{row(2, 'Backdrop')}{row(3, 'Hat')}{row(4, 'Face')}{row(5, 'Pose')}<button type="button" className="gbtn ghost" onClick={() => onChange(randomKid())}>🎲 Surprise me</button></div>
        : <div className="apc"><div className="dstyles">{DICE.map(s => <button type="button" key={s} className={value.split(':')[1] === s ? 'on' : ''} onClick={() => onChange(`d:${s}:${seed}`)}>{s}</button>)}</div><button type="button" className="gbtn ghost" onClick={() => onChange(`d:${value.split(':')[1] || 'adventurer'}:${Math.random().toString(36).slice(2, 8)}`)}>🎲 New look</button><small>Needs internet; if it fails, a stick figure is shown instead.</small></div>}
    </div>
  );
}
