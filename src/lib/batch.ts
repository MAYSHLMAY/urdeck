/* Batch operations on many cards at once (owner: saved for everyone; everyone else: private, on this device). */
export type BatchOp =
  | { op: 'move'; s: string }
  | { op: 'past'; past: boolean }
  | { op: 'delete' }
  | { op: 'replace'; find: string; repl: string; scope: 'q' | 'c' | 'w' | 'all'; cs?: boolean };

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Replace text outside <!--tokens--> (picture / kind / mask data stays untouched). */
function rep(t: string, re: RegExp, repl: string) { return String(t).split(/(<!--[^>]*-->)/).map(p => (p.startsWith('<!--') ? p : p.replace(re, repl))).join(''); }

/** Find & replace inside one card. Returns null when nothing changes. */
export function replaceCard(card: { q: string; c: string; w: string[] }, o: { find: string; repl: string; scope: string; cs?: boolean }) {
  if (!o.find) return null;
  const re = new RegExp(esc(o.find), o.cs ? 'g' : 'gi'), r = o.repl.replace(/\$/g, '$$$$');
  const all = o.scope === 'all';
  const q = all || o.scope === 'q' ? rep(card.q, re, r) : card.q, c = all || o.scope === 'c' ? rep(card.c, re, r) : card.c;
  const w = all || o.scope === 'w' ? card.w.map(x => rep(x, re, r)) : card.w;
  return q === card.q && c === card.c && w.every((x, i) => x === card.w[i]) ? null : { q, c, w };
}
