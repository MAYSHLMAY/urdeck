/** Look: accent palette + theme, kept in localStorage so every page (study, lab, quiz) applies it before paint.
 *  There is one fixed font and one fixed card design; only colour and theme are personal. */
export const ACCENTS: [string, string, string][] = [
  ['indigo', 'Indigo', '#5B5BD6'], ['ocean', 'Ocean', '#0B7BC4'], ['teal', 'Teal', '#0D9488'], ['emerald', 'Emerald', '#16803C'],
  ['violet', 'Violet', '#8250DF'], ['rose', 'Rose', '#E11D63'], ['amber', 'Amber', '#D97706'], ['graphite', 'Graphite', '#334155']
];
const K = 'fr-look-v1';
export interface Look { a: string; t: string }
const DEF: Look = { a: 'indigo', t: 'auto' };
export function getLook(): Look {
  try { const j = JSON.parse(localStorage.getItem(K) || '{}'); return { a: j.a || DEF.a, t: j.t || DEF.t }; } catch { return { ...DEF }; }
}
export function applyLook(p?: Partial<Look>) {
  const n: Look = { ...getLook(), ...(p || {}) };
  try { localStorage.setItem(K, JSON.stringify(n)); } catch { /* ignore */ }
  const d = document.documentElement;
  d.dataset.accent = n.a; d.dataset.theme = n.t === 'auto' ? '' : n.t;
  ['font', 'density', 'corner', 'qa', 'layout'].forEach(x => d.removeAttribute('data-' + x));
  const hex = (ACCENTS.find(x => x[0] === n.a) || ACCENTS[0])[2];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
  try { dispatchEvent(new Event('ud-look')); } catch { /* ignore */ }
}
/** Inline script for <head>: applies the saved look before the first paint (no flash). */
export const LOOK_BOOT = `try{var j=JSON.parse(localStorage.getItem('${K}')||'{}'),d=document.documentElement;if(j.a)d.dataset.accent=j.a;if(j.t&&j.t!=='auto')d.dataset.theme=j.t;}catch(e){}`;

/* ---------- Home layout: which sections, in what order, and how they look. Local to this device. ---------- */
export const HOME_SECTIONS: [string, string, string][] = [
  ['today', 'Today', 'Your deck, the start button and the goal ring'],
  ['stats', 'New, learning, due', 'Three counts for today'],
  ['shortcuts', 'Study modes and tools', 'Quick ways to start'],
  ['progress', 'Streak and week', 'Streak, daily goal and the last 7 days'],
  ['mistakes', 'Mistakes', 'Sure-but-wrong cards and confusion patterns'],
  ['needs', 'Needs work', 'Topics with the lowest accuracy'],
  ['badges', 'Badges', 'Milestones you can earn'],
  ['topics', 'Topics', 'Cards, PDFs and 3D models by category']
];
export const SHORTCUTS: [string, string][] = [
  ['study', 'Study'], ['sprint', 'Quick sprint'], ['exam', 'Exam mode'], ['listen', 'Listen'],
  ['quiz', 'Live quiz'], ['lab', '3D lab'], ['duel', 'Challenge'], ['host', 'Host']
];
export interface HomeCfg { order: string[]; hidden: string[]; hero: 'deck' | 'compact'; qa: 'grid' | 'row'; short: string[]; cols: 1 | 2; tip: boolean }
const ALL = HOME_SECTIONS.map(x => x[0]), SC = SHORTCUTS.map(x => x[0]);
export const HOME_DEF: HomeCfg = { order: ALL, hidden: [], hero: 'deck', qa: 'grid', short: SC, cols: 1, tip: true };
export const PRESETS: { id: string; name: string; note: string; cfg: Partial<HomeCfg> }[] = [
  { id: 'balanced', name: 'Balanced', note: 'Everything, in a calm order', cfg: { ...HOME_DEF } },
  { id: 'focus', name: 'Focus', note: 'Just today, modes and streak', cfg: { order: ['today', 'shortcuts', 'progress', 'stats', 'mistakes', 'needs', 'badges', 'topics'], hidden: ['stats', 'mistakes', 'needs', 'badges', 'topics'], short: ['study', 'sprint', 'exam', 'listen'], tip: false } },
  { id: 'dash', name: 'Dashboard', note: 'Two columns on wide screens', cfg: { cols: 2, order: ['today', 'stats', 'shortcuts', 'progress', 'needs', 'mistakes', 'topics', 'badges'] } },
  { id: 'library', name: 'Library', note: 'Topics first', cfg: { order: ['today', 'topics', 'shortcuts', 'needs', 'progress', 'mistakes', 'stats', 'badges'], hidden: ['stats', 'badges'] } },
  { id: 'min', name: 'Minimal', note: 'Only the deck and your topics', cfg: { hero: 'compact', order: ['today', 'topics', 'stats', 'shortcuts', 'progress', 'mistakes', 'needs', 'badges'], hidden: ['stats', 'shortcuts', 'progress', 'mistakes', 'needs', 'badges'], tip: false } }
];
const KH = 'ud-home-v1';
export function getHome(): HomeCfg {
  let j: any = {}; try { j = JSON.parse(localStorage.getItem(KH) || '{}'); } catch { /* ignore */ }
  const order = (Array.isArray(j.order) ? j.order : []).filter((x: string) => ALL.includes(x));
  for (const id of ALL) if (!order.includes(id)) order.push(id);
  return {
    order, hidden: (Array.isArray(j.hidden) ? j.hidden : []).filter((x: string) => ALL.includes(x)),
    hero: j.hero === 'compact' ? 'compact' : 'deck', qa: j.qa === 'row' ? 'row' : 'grid',
    short: Array.isArray(j.short) ? j.short.filter((x: string) => SC.includes(x)) : SC, cols: j.cols === 2 ? 2 : 1, tip: j.tip !== false
  };
}
export function setHome(h: Partial<HomeCfg>) {
  const n = { ...getHome(), ...h };
  try { localStorage.setItem(KH, JSON.stringify(n)); } catch { /* ignore */ }
  try { dispatchEvent(new Event('ud-home')); } catch { /* ignore */ }
}
export const resetHome = () => { try { localStorage.removeItem(KH); } catch { /* ignore */ } try { dispatchEvent(new Event('ud-home')); } catch { /* ignore */ } };
