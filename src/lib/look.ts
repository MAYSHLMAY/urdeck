/** Look: accent palette + theme, kept in localStorage so every page (study, lab, quiz) applies it before paint. */
export const ACCENTS: [string, string, string][] = [
  ['indigo', 'Indigo', '#5B5BD6'], ['ocean', 'Ocean', '#0B7BC4'], ['teal', 'Teal', '#0D9488'], ['emerald', 'Emerald', '#16803C'],
  ['violet', 'Violet', '#8250DF'], ['rose', 'Rose', '#E11D63'], ['amber', 'Amber', '#D97706'], ['graphite', 'Graphite', '#334155']
];
const K = 'fr-look-v1';
export const FONTS: [string, string, string][] = [
  ['jakarta', 'UrDeck', '"Plus Jakarta Sans"'], ['inter', 'Clean', 'Inter'], ['rounded', 'Rounded', 'Nunito'],
  ['serif', 'Serif', '"Source Serif 4"'], ['hyper', 'Readable', '"Atkinson Hyperlegible"'], ['system', 'System', 'system-ui']
];
export interface Look { a: string; t: string; f: string; d: string; c: string; q: string; h: string }
const DEF: Look = { a: 'indigo', t: 'auto', f: 'jakarta', d: 'cozy', c: 'round', q: 'grid', h: 'stack' };
export function getLook(): Look {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(K) || '{}') }; } catch { return { ...DEF }; }
}
export function applyLook(p?: Partial<Look>) {
  const n: Look = { ...getLook(), ...(p || {}) };
  try { localStorage.setItem(K, JSON.stringify(n)); } catch { /* ignore */ }
  const d = document.documentElement;
  d.dataset.accent = n.a; d.dataset.theme = n.t === 'auto' ? '' : n.t; d.dataset.font = n.f; d.dataset.density = n.d; d.dataset.corner = n.c; d.dataset.qa = n.q; d.dataset.layout = n.h;
  const hex = (ACCENTS.find(x => x[0] === n.a) || ACCENTS[0])[2];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
  try { dispatchEvent(new Event('ud-look')); } catch { /* ignore */ }
}
/** Inline script for <head>: applies the saved look before the first paint (no flash). */
export const LOOK_BOOT = `try{var j=JSON.parse(localStorage.getItem('${K}')||'{}'),d=document.documentElement;if(j.a)d.dataset.accent=j.a;if(j.t&&j.t!=='auto')d.dataset.theme=j.t;if(j.f)d.dataset.font=j.f;if(j.d)d.dataset.density=j.d;if(j.c)d.dataset.corner=j.c;if(j.q)d.dataset.qa=j.q;if(j.h)d.dataset.layout=j.h;}catch(e){}`;

/* Home sections: order and visibility, local to this device */
export const HOME_SECTIONS: [string, string][] = [
  ['today', 'Today'], ['stats', 'New, learning, due'], ['shortcuts', 'Shortcuts'], ['progress', 'Streak and week'],
  ['mistakes', 'Mistakes'], ['needs', 'Needs work'], ['badges', 'Badges'], ['topics', 'Topics']
];
const KH = 'ud-home-v1';
export function getHome(): { order: string[]; hidden: string[] } {
  let j: any = {}; try { j = JSON.parse(localStorage.getItem(KH) || '{}'); } catch { /* ignore */ }
  const ids = HOME_SECTIONS.map(x => x[0]), order = (Array.isArray(j.order) ? j.order : []).filter((x: string) => ids.includes(x));
  for (const id of ids) if (!order.includes(id)) order.push(id);
  return { order, hidden: (Array.isArray(j.hidden) ? j.hidden : []).filter((x: string) => ids.includes(x)) };
}
export function setHome(h: { order: string[]; hidden: string[] }) {
  try { localStorage.setItem(KH, JSON.stringify(h)); } catch { /* ignore */ }
  try { dispatchEvent(new Event('ud-home')); } catch { /* ignore */ }
}
