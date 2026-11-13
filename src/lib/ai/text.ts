/* Small, fast text helpers shared by every "smart" feature. No models, no network. */
const STOP = new Set('a an the of to in on at by for from with and or but is are was were be been being it its this that these those as into than then so such can could will would should may might do does did has have had not no'.split(' '));
const NEG = /\b(not|no|never|none|cannot|without|neither|nor|isn't|aren't|doesn't|don't|didn't|won't|can't|decreases?|reduces?|lower)\b|n't\b/gi;
export const plain = (t: string) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
export function stem(w: string) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  return w.replace(/(ational|ization|ically|ations|ation|ities|ness|ments|ment|ingly|ing|edly|ies|ied|ed|es|ly|s)$/, m => (m === 'ies' || m === 'ied' ? 'y' : '')) || w;
}
export function tokens(t: string, keepStop = false): string[] {
  const w = plain(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+(?:[.,][\p{N}]+)?/gu) || [];
  return w.filter(x => keepStop || !STOP.has(x)).map(stem);
}
/** Numbers with their following unit-ish word, e.g. "15 degrees" -> "15". */
export const numbers = (t: string) => (plain(t).replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:\.\d+)?/g) || []).map(x => String(+x));
/** True when the text says "not/no/decrease…" an odd number of times. */
export const negated = (t: string) => ((plain(t).match(NEG) || []).length % 2) === 1;
export function lev(a: string, b: string) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[b.length];
}
