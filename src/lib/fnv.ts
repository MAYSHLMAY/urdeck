/**
 * 64-bit FNV-1a of the normalised question text, same ids as the original app
 * (so progress saved before the migration still lines up). No BigInt: fast on phones.
 */
const TE = new TextEncoder();
const memo = new Map<string, string>();

export function fnv(x: string): string {
  const hit = memo.get(x);
  if (hit !== undefined) return hit;
  const b = TE.encode(x.trim().toLowerCase().replace(/\s+/g, ' '));
  let hi = 0xcbf29ce4, lo = 0x84222325;
  for (let i = 0; i < b.length; i++) {
    lo = (lo ^ b[i]) >>> 0;
    const p = lo * 435, c = Math.floor(p / 4294967296);
    hi = (hi * 435 + c + (lo << 8)) >>> 0;
    lo = p >>> 0;
  }
  const k = 'h' + (hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0')).slice(0, 12);
  if (memo.size > 200000) memo.clear();
  memo.set(x, k);
  return k;
}
