/* Smart layer over your cards: related cards, mistake patterns. Tier 0 is built in; a neural tier can replace the vectors later. */
import type { Engine } from '../engine';
import type { QCard } from '../types';
import { Lexical, cos, type Vec } from './lexical';
import { plain, tokens } from './text';
import { qText } from '../cardimg';

const text = (q: QCard) => plain(qText(q.q)) + ' ' + plain(q.c);
let lex: Lexical | null = null, vecs = new Map<string, Vec>(), ver = -1;
function build(e: Engine) {
  if (ver === e.qver && lex) return;
  lex = new Lexical(); lex.fit(e.Q.map(text)); vecs = new Map(e.Q.map(q => [q.id, lex!.vec(text(q))])); ver = e.qver;
}
export function related(e: Engine, id: string, k = 4): { q: QCard; s: number }[] {
  build(e); const a = vecs.get(id); if (!a) return [];
  return e.Q.filter(q => q.id !== id).map(q => ({ q, s: cos(a, vecs.get(q.id)!) })).filter(x => x.s > 0.3).sort((x, y) => y.s - x.s).slice(0, k);
}
export interface Pattern { ids: string[]; label: string }
/** Groups the cards you keep missing by similarity, so you see "what you confuse", not just single cards. */
export function patterns(e: Engine, ids: string[], min = 2): Pattern[] {
  build(e); const cards = ids.map(i => e.qById(i)).filter(Boolean) as QCard[], seen = new Set<string>(), out: Pattern[] = [];
  cards.forEach(c => {
    if (seen.has(c.id)) return;
    const g = cards.filter(o => !seen.has(o.id) && (o.id === c.id || cos(vecs.get(c.id)!, vecs.get(o.id)!) > 0.32));
    if (g.length < min) return; g.forEach(x => seen.add(x.id));
    const cnt = new Map<string, number>(); g.forEach(x => new Set(tokens(text(x))).forEach(t => cnt.set(t, (cnt.get(t) || 0) + 1)));
    const top = [...cnt].filter(([t, n]) => n >= Math.max(2, g.length * 0.6) && t.length > 3).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    out.push({ ids: g.map(x => x.id), label: top.length ? top.join(' · ') : plain(qText(g[0].q)).slice(0, 40) });
  });
  return out.sort((a, b) => b.ids.length - a.ids.length).slice(0, 4);
}
