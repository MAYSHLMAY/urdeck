'use client';
import { useState } from 'react';

/* Characters: "k:a.b.c.d.e.f" is a little blob character drawn on the device (no network) with a face that shows moods.
 * "d:style:seed" is a free DiceBear picture (falls back to the character if it cannot load). Older stick-figure codes still work. */
export type Mood = 'idle' | 'happy' | 'angry' | 'sad' | 'wow';
const BODY = ['#6C63FF', '#FF5C7A', '#FFB020', '#22C55E', '#14B8E6', '#FF7A3D', '#A855F7', '#2D3748'];
const BG = ['#E9E7FF', '#FFE3E9', '#FFF1CF', '#DDF7E6', '#D8F1FB', '#FFE6D6', '#F1E2FD', '#E4E8EF'];
export const SHAPES_N = ['Blob', 'Square', 'Drop', 'Bumpy', 'Cone', 'Kitty'];
export const HATS = ['none', 'cap', 'top', 'party', 'crown', 'beanie', 'antenna', 'halo'];
export const EYES = ['round', 'sparkle', 'sleepy', 'glasses'];
export const EXTRA = ['none', 'blush', 'freckles', 'mustache'];
export const DICE = ['adventurer', 'fun-emoji', 'bottts', 'thumbs', 'lorelei', 'big-smile', 'pixel-art', 'avataaars'];
const N = [6, BODY.length, BG.length, HATS.length, EYES.length, EXTRA.length];
const TOP = [22, 24, 12, 22, 18, 26], FY = [68, 68, 82, 68, 80, 70];

export const randomKid = () => 'k:' + N.map(n => Math.floor(Math.random() * n)).join('.');
export const parseK = (av: string) => { const p = (av.startsWith('k:') ? av.slice(2).split('.') : []).map(Number); return N.map((n, i) => ((p[i] >= 0 && p[i] < n) ? p[i] : (i * 3 + 1) % n)); };
export const mkK = (v: number[]) => 'k:' + v.join('.');

const BODYP = [
  'M60 22C90 22 106 44 106 70C106 96 88 108 60 108C32 108 14 96 14 70C14 44 30 22 60 22Z',
  'M44 24H76C96 24 106 36 106 56V76C106 98 96 108 76 108H44C24 108 14 98 14 76V56C14 36 24 24 44 24Z',
  'M60 12C60 12 102 54 102 80C102 99 84 110 60 110C36 110 18 99 18 80C18 54 60 12 60 12Z',
  'M34 40C34 28 50 24 60 30C70 24 86 28 86 40C102 42 108 62 100 78C104 96 88 108 60 108C32 108 16 96 20 78C12 62 18 42 34 40Z',
  'M60 18C69 18 75 24 79 33L103 88C109 102 98 108 88 108H32C22 108 11 102 17 88L41 33C45 24 51 18 60 18Z',
  'M20 44L26 16L48 30Q60 27 72 30L94 16L100 44C108 52 108 66 104 78C102 98 86 108 60 108C34 108 18 98 16 78C12 66 12 52 20 44Z'
];

export function Character({ v, mood = 'idle', bare }: { v: number[]; mood?: Mood; bare?: boolean }) {
  const [shape, col, bg, hat, eyes, extra] = v, c = BODY[col], top = TOP[shape], fy = FY[shape], ink = '#1b1530', id = 'g' + v.join('') + mood;
  const ey = fy - 8, happy = mood === 'happy', angry = mood === 'angry', sad = mood === 'sad', wow = mood === 'wow';
  const eye = (x: number) => {
    if (happy) return <path key={x} d={`M${x - 8} ${ey + 3}q8 -11 16 0`} fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" />;
    const r = wow || eyes === 1 ? 10 : 8, pr = wow ? 3 : angry ? 3.4 : eyes === 1 ? 6 : 4.4;
    return (
      <g key={x} className="eye">
        <circle cx={x} cy={ey} r={r} fill="#fff" />
        <circle className="pup" cx={x} cy={ey + (sad ? 2 : 0)} r={pr} fill={ink} />
        {(eyes === 1 || wow) && <circle cx={x + 2} cy={ey - 2} r="1.8" fill="#fff" />}
        {eyes === 2 && !angry && !wow && <path d={`M${x - r - 1} ${ey - r - 1}h${2 * r + 2}v${r}h-${2 * r + 2}z`} fill={c} />}
      </g>
    );
  };
  const mouth = happy ? <><path d={`M${48} ${fy + 6}q12 20 24 0z`} fill="#5b1730" stroke={ink} strokeWidth="2.4" strokeLinejoin="round" /><path d={`M54 ${fy + 15}q6 -5 12 0`} fill="#ff7a90" /></>
    : angry ? <path d={`M48 ${fy + 17}q12 -11 24 0`} fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
      : sad ? <path d={`M50 ${fy + 16}q10 -8 20 0`} fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
        : wow ? <ellipse cx="60" cy={fy + 12} rx="5" ry="6.5" fill="#5b1730" stroke={ink} strokeWidth="2.2" />
          : <path d={`M49 ${fy + 8}q11 11 22 0`} fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />;
  return (
    <svg className={'chr ' + mood} viewBox="0 0 120 120" width="100%" height="100%" role="img" aria-label={'character, ' + mood}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity=".78" /></linearGradient></defs>
      {!bare && <rect width="120" height="120" fill={BG[bg]} />}
      <ellipse cx="60" cy="112" rx="30" ry="4.5" fill="#1b153022" />
      <g className="body">
        <path d={BODYP[shape]} fill={`url(#${id})`} />
        {angry && <path d={BODYP[shape]} fill="#ff2d2d" opacity=".34" />}
        <ellipse cx="42" cy={top + 16} rx="13" ry="7" fill="#fff" opacity=".24" transform={`rotate(-24 42 ${top + 16})`} />
        {extra === 1 && <><ellipse cx="34" cy={fy + 5} rx="6.5" ry="4.2" fill="#ff6b8a" opacity=".6" /><ellipse cx="86" cy={fy + 5} rx="6.5" ry="4.2" fill="#ff6b8a" opacity=".6" /></>}
        {happy && extra !== 1 && <><ellipse cx="34" cy={fy + 5} rx="6" ry="3.8" fill="#ff6b8a" opacity=".45" /><ellipse cx="86" cy={fy + 5} rx="6" ry="3.8" fill="#ff6b8a" opacity=".45" /></>}
        {extra === 2 && <g fill="#0003"><circle cx="38" cy={fy + 3} r="1.5" /><circle cx="43" cy={fy + 6} r="1.5" /><circle cx="35" cy={fy + 8} r="1.5" /><circle cx="82" cy={fy + 3} r="1.5" /><circle cx="77" cy={fy + 6} r="1.5" /><circle cx="85" cy={fy + 8} r="1.5" /></g>}
        {angry && <g stroke={ink} strokeWidth="4" strokeLinecap="round"><path d={`M33 ${ey - 14}L52 ${ey - 7}`} /><path d={`M87 ${ey - 14}L68 ${ey - 7}`} /></g>}
        {sad && <g stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none"><path d={`M35 ${ey - 8}L51 ${ey - 13}`} /><path d={`M85 ${ey - 8}L69 ${ey - 13}`} /></g>}
        <g className="face">
          {eye(44)}{eye(76)}
          {eyes === 3 && <g fill="none" stroke={ink} strokeWidth="3"><circle cx="44" cy={ey} r="12.5" /><circle cx="76" cy={ey} r="12.5" /><path d={`M56.5 ${ey}h7`} /></g>}
          {mouth}
          {extra === 3 && <path d={`M44 ${fy + 3}q8 -7 16 0q8 -7 16 0q-8 9 -16 3q-8 6 -16 -3z`} fill="#3b2a22" />}
          {sad && <path className="tear" d={`M36 ${ey + 10}q4 6 0 9q-4 -3 0 -9z`} fill="#6ec6ff" />}
        </g>
      </g>
      <g transform={`translate(0 ${top - 18})`} stroke={ink} strokeWidth="2.4" strokeLinejoin="round">
        {hat === 1 && <g><path d="M34 32a26 24 0 0 1 52 0z" fill={c === BODY[1] ? '#2D3748' : '#FF5C7A'} /><path d="M30 32h40" strokeLinecap="round" strokeWidth="5" /></g>}
        {hat === 2 && <g fill="#232034"><rect x="42" y="-6" width="36" height="32" rx="3" /><rect x="32" y="22" width="56" height="7" rx="3.5" /><rect x="42" y="16" width="36" height="6" fill="#FF5C7A" stroke="none" /></g>}
        {hat === 3 && <g><path d="M60 -12 42 28h36z" fill="#FF7A3D" /><circle cx="60" cy="-12" r="4.5" fill="#FFD43B" /></g>}
        {hat === 4 && <path d="M36 28 38 4l11 13 11-17 11 17 11-13 2 24z" fill="#FFC93C" />}
        {hat === 5 && <g><path d="M33 30a27 23 0 0 1 54 0z" fill="#14B8E6" /><circle cx="60" cy="4" r="5.5" fill="#fff" /></g>}
        {hat === 6 && <g><path d="M60 26V2" strokeLinecap="round" /><circle cx="60" cy="0" r="6" fill="#FF5C7A" /></g>}
        {hat === 7 && <ellipse cx="60" cy="8" rx="20" ry="5.5" fill="none" stroke="#FFC93C" strokeWidth="5" />}
      </g>
      {angry && <g className="steam" fill="#fff" stroke="#0002" strokeWidth="1"><circle cx="18" cy="38" r="5" /><circle cx="102" cy="38" r="5" /></g>}
    </svg>
  );
}

export function Avatar({ av, size = 56, ring, mood = 'idle', bare }: { av: string; size?: number; ring?: string; mood?: Mood; bare?: boolean }) {
  const [bad, setBad] = useState(false);
  const d = av && av.startsWith('d:') && !bad ? av.split(':') : null;
  return (
    <span className={'av' + (bare ? ' bare' : '') + (mood !== 'idle' ? ' m-' + mood : '')} style={{ width: size, height: size, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}>
      {d ? <img src={`https://api.dicebear.com/9.x/${encodeURIComponent(d[1])}/svg?seed=${encodeURIComponent(d.slice(2).join(':'))}`} alt="" loading="lazy" onError={() => setBad(true)} /> : <Character v={parseK(av && av.startsWith('k:') ? av : 'k:' + av.length)} mood={mood} bare={bare} />}
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
      <div className="aptabs"><button type="button" className={tab === 'k' ? 'on' : ''} onClick={() => { setTab('k'); if (value.startsWith('d:')) onChange(randomKid()); }}>Characters</button><button type="button" className={tab === 'd' ? 'on' : ''} onClick={() => { setTab('d'); if (!value.startsWith('d:')) onChange('d:adventurer:' + seed); }}>Online avatars</button></div>
      {tab === 'k' ? <div className="apc">{row(0, 'Body')}{row(1, 'Colour')}{row(2, 'Backdrop')}{row(3, 'Hat')}{row(4, 'Eyes')}{row(5, 'Extra')}<button type="button" className="gbtn ghost" onClick={() => onChange(randomKid())}>🎲 Surprise me</button></div>
        : <div className="apc"><div className="dstyles">{DICE.map(s => <button type="button" key={s} className={value.split(':')[1] === s ? 'on' : ''} onClick={() => onChange(`d:${s}:${seed}`)}>{s}</button>)}</div><button type="button" className="gbtn ghost" onClick={() => onChange(`d:${value.split(':')[1] || 'adventurer'}:${Math.random().toString(36).slice(2, 8)}`)}>🎲 New look</button><small>Needs internet; if it fails, a stick figure is shown instead.</small></div>}
    </div>
  );
}
