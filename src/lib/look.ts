/** Look: accent palette + theme, kept in localStorage so every page (study, lab, quiz) applies it before paint. */
export const ACCENTS: [string, string, string][] = [
  ['indigo', 'Indigo', '#5B5BD6'], ['ocean', 'Ocean', '#0B7BC4'], ['teal', 'Teal', '#0D9488'], ['emerald', 'Emerald', '#16803C'],
  ['violet', 'Violet', '#8250DF'], ['rose', 'Rose', '#E11D63'], ['amber', 'Amber', '#D97706'], ['graphite', 'Graphite', '#334155']
];
const K = 'fr-look-v1';
export function getLook(): { a: string; t: string } {
  try { const j = JSON.parse(localStorage.getItem(K) || '{}'); return { a: j.a || 'indigo', t: j.t || 'auto' }; } catch { return { a: 'indigo', t: 'auto' }; }
}
export function applyLook(p?: { a?: string; t?: string }) {
  const cur = getLook(), n = { a: p?.a || cur.a, t: p?.t || cur.t };
  try { localStorage.setItem(K, JSON.stringify(n)); } catch { /* ignore */ }
  const d = document.documentElement;
  d.dataset.accent = n.a; d.dataset.theme = n.t === 'auto' ? '' : n.t;
  const hex = (ACCENTS.find(x => x[0] === n.a) || ACCENTS[0])[2];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
}
/** Inline script for <head>: applies the saved look before the first paint (no flash). */
export const LOOK_BOOT = `try{var j=JSON.parse(localStorage.getItem('${K}')||'{}'),d=document.documentElement;if(j.a)d.dataset.accent=j.a;if(j.t&&j.t!=='auto')d.dataset.theme=j.t}catch(e){}`;
