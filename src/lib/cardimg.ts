/*
 * Card images. A card's question may carry one picture (a diagram) with numbered pins that name its parts.
 * It is stored INSIDE the question text as an HTML comment, so every existing path (sync, edits, cache, search, export) keeps working
 * and nothing in the database has to change:   <!--img:SRC|label@x,y|label@x,y-->
 * SRC is an https URL (owner uploads go to Storage) or a small data: URL (private cards stay on the device).
 */
export interface Pin { t: string; x: number; y: number }
export interface CardImg { src: string; pins: Pin[] }

const RX = /<!--img:([^>]*)-->/;
const RXG = /<!--img:[^>]*-->/g;

export const stripImg = (q: string) => String(q || '').replace(RXG, '').trim();
export function parseImg(q: string): CardImg | null {
  const m = RX.exec(String(q || '')); if (!m) return null;
  const [src, ...rest] = m[1].split('|');
  const pins: Pin[] = [];
  rest.forEach(p => {
    const k = p.lastIndexOf('@'); if (k < 0) return;
    const [x, y] = p.slice(k + 1).split(',').map(Number);
    if (!isFinite(x) || !isFinite(y)) return;
    let t = p.slice(0, k); try { t = decodeURIComponent(t); } catch { /* keep raw */ }
    pins.push({ t, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  });
  return /^(https?:|data:image\/)/.test(src) ? { src, pins } : null;
}
export function withImg(q: string, img: CardImg | null): string {
  const text = stripImg(q);
  if (!img || /[>|]/.test(img.src)) return text;
  const tok = '<!--img:' + img.src + img.pins.map(p => '|' + encodeURIComponent(p.t).replace(/%20/g, ' ') + '@' + p.x.toFixed(3) + ',' + p.y.toFixed(3)).join('') + '-->';
  return text + tok;
}
/** Text-only view of a question (no picture token). */
export const qText = stripImg;

/** Shrink a picture in the browser so it stays small (JPEG/WebP). Returns a data URL. */
export async function compressImage(file: Blob, maxSide = 1100, maxBytes = 150_000): Promise<string> {
  const bmp = await createImageBitmap(file);
  let side = maxSide, q = 0.84, out = '';
  for (let i = 0; i < 8; i++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    out = cv.toDataURL('image/webp', q); if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/jpeg', q);
    if (out.length * 0.75 <= maxBytes) break;
    if (q > 0.55) q -= 0.1; else side = Math.round(side * 0.8);
  }
  return out;
}
