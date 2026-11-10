/*
 * Image occlusion. The mask list lives in the question as   <!--occ:MODE,IDX|x,y,w,h|x,y,w,h-->   (all values 0..1 of the picture)
 * MODE "o" = hide one (only the asked box is covered), "a" = hide all (every box is covered, the asked one is highlighted).
 * IDX = which box this card asks about. The picture itself is the normal <!--img:...--> token, the answer is the card's correct answer.
 */
export interface Box { x: number; y: number; w: number; h: number }
export interface Occ { mode: 'o' | 'a'; idx: number; boxes: Box[] }
const RX = /<!--occ:([^>]*)-->/;
const c01 = (n: number) => Math.min(1, Math.max(0, n));

export function parseOccBody(body: string): Occ | null {
  const [head, ...rest] = String(body || '').split('|'), [m, i] = head.split(',');
  const boxes = rest.map(s => s.split(',').map(Number)).filter(a => a.length === 4 && a.every(isFinite)).map(([x, y, w, h]) => ({ x: c01(x), y: c01(y), w: c01(w), h: c01(h) }));
  if (!boxes.length) return null;
  return { mode: m === 'a' ? 'a' : 'o', idx: Math.min(boxes.length - 1, Math.max(0, +i || 0)), boxes };
}
export function parseOcc(q: string): Occ | null { const m = RX.exec(String(q || '')); return m ? parseOccBody(m[1]) : null; }
export const occBody = (o: Occ) => o.mode + ',' + o.idx + o.boxes.map(b => '|' + [b.x, b.y, b.w, b.h].map(n => n.toFixed(3)).join(',')).join('');
export const occToken = (o: Occ) => '<!--occ:' + occBody(o) + '-->';
