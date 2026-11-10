/*
 * Card kinds. A card is multiple choice unless its question carries a kind token (an HTML comment, so every existing path keeps working):
 *   <!--k:f-->  flip card (front/back)      <!--k:t-->  type-in answer
 *   <!--k:c-->  cloze  ({{c1::answer::hint}} inside the question text)
 *   <!--k:o-->  image occlusion (picture token + <!--occ:...--> mask)
 * Every kind still stores a correct answer AND borrowed wrong answers, so the live quiz, the mock exam, speed rounds,
 * browse and search treat them as ordinary multiple-choice cards. Study mode shows them the Anki way instead.
 */
export type Kind = 'mc' | 'f' | 't' | 'c' | 'o';
const RK = /<!--k:([ftco])-->/;
export const kindOf = (q: string): Kind => (RK.exec(String(q || ''))?.[1] as Kind) || 'mc';
export const stripKind = (q: string) => String(q || '').replace(/<!--k:[ftco]-->/g, '');
export const withKind = (q: string, k: Kind) => stripKind(q).trim() + (k === 'mc' ? '' : '<!--k:' + k + '-->');

/* ---- cloze ---- */
const RC = () => /\{\{c(\d+)::([\s\S]*?)(?:::([^}]*?))?\}\}/g;
export const clozeNums = (t: string) => [...new Set([...String(t).matchAll(RC())].map(m => +m[1]))].sort((a, b) => a - b);
export const clozeFront = (t: string, n: number, hide = '…') => String(t).replace(RC(), (_m, k, a, h) => (+k === n ? '<span class="clz">[' + (h || hide) + ']</span>' : a));
export const clozeBack = (t: string, n: number) => String(t).replace(RC(), (_m, k, a) => (+k === n ? '<span class="clz on">' + a + '</span>' : a));
export const clozeAnswer = (t: string, n: number) => [...String(t).matchAll(RC())].filter(m => +m[1] === n).map(m => m[2]).join(', ');
/** One card per cloze number: the other numbers are shown as plain text. */
export function clozeCards(text: string): { q: string; c: string }[] {
  return clozeNums(text).map(n => ({
    q: String(text).replace(RC(), (_m, k, a, h) => (+k === n ? '{{c' + n + '::' + a + (h ? '::' + h : '') + '}}' : a)),
    c: clozeAnswer(text, n)
  }));
}
/** The card's single active cloze number (its first). */
export const activeCloze = (q: string) => clozeNums(q)[0] || 1;

/* ---- distractors, borrowed from other cards of the same set so MC consumers work ---- */
const GENERIC = ['None of the above', 'All of the above', 'Cannot be determined', 'It depends on the conditions'];
const plain = (t: string) => String(t).replace(/<[^>]+>/g, '').trim();
export function distractors(correct: string, pool: { c: string; q?: string }[], n = 3): string[] {
  const want = plain(correct).toLowerCase(), seen = new Set<string>([want]), out: string[] = [];
  const cand = pool.map(p => p.c).filter(Boolean).sort(() => Math.random() - 0.5);
  for (const c of cand) { const k = plain(c).toLowerCase(); if (!k || k.length > 140 || seen.has(k)) continue; seen.add(k); out.push(c); if (out.length >= n) break; }
  for (const g of GENERIC) { if (out.length >= n) break; if (!seen.has(g.toLowerCase())) out.push(g); }
  return out;
}

/** Forgiving comparison for type-in answers. */
export const norm = (t: string) => plain(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const sameAnswer = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && x === y; };
