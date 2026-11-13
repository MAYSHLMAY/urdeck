/* Make cards from pasted text with the connected AI. Output is a "cards file" (see exchange.ts), so it uses the normal import path. */
import { chat } from './provider';

export type GenKind = 'F' | 'T' | 'C' | 'Q';
export interface Gen { kind: GenKind; line: string; label: string; back: string; on: boolean }

const pf = (s: unknown) => String(s ?? '').replace(/\s*\|\s*/g, ' / ').replace(/\s+/g, ' ').trim();

/** Split on paragraph breaks into pieces of about `max` characters. */
export function chunks(text: string, max = 3000, cap = 6): string[] {
  const out: string[] = []; let cur = '';
  for (const p of text.replace(/\r/g, '').split(/\n{2,}|\n(?=[A-Z0-9#•\-\*])/)) {
    const t = p.trim(); if (!t) continue;
    if (cur && cur.length + t.length > max) { out.push(cur); cur = ''; }
    if (t.length > max) { for (let i = 0; i < t.length; i += max) out.push(t.slice(i, i + max)); continue; }
    cur += (cur ? '\n' : '') + t;
  }
  if (cur) out.push(cur);
  return out.slice(0, cap);
}

const HOW: Record<GenKind, string> = {
  F: 'Each item: {"q":"front (a question or term)","a":"back (short, exact answer)"}',
  T: 'Each item: {"q":"question with ONE short answer","a":"the short answer (1-4 words or a number)"}',
  C: 'Each item: {"c":"one sentence from the text with the key term wrapped like {{c1::term}}"}',
  Q: 'Each item: {"q":"question","a":"correct answer (short)","w":["wrong 1","wrong 2","wrong 3"]} where the wrong answers are plausible but clearly wrong'
};

export function lineFor(kind: GenKind, it: any): Gen | null {
  if (!it || typeof it !== 'object') return null;
  if (kind === 'C') {
    const c = pf(it.c); if (!/\{\{c\d+::[^}]+\}\}/.test(c)) return null;
    return { kind, line: 'C: ' + c, label: c.replace(/\{\{c\d+::([^}]*)\}\}/g, '[$1]'), back: '', on: true };
  }
  const q = pf(it.q), a = pf(it.a); if (!q || !a) return null;
  if (kind === 'Q') { const w = (Array.isArray(it.w) ? it.w : []).map(pf).filter((x: string) => x && x.toLowerCase() !== a.toLowerCase()); if (w.length < 3) return null; return { kind, line: 'Q: ' + [q, a, ...w.slice(0, 3)].join(' | '), label: q, back: a, on: true }; }
  return { kind, line: kind + ': ' + q + ' | ' + a, label: q, back: a, on: true };
}

export function parseGen(reply: string, kind: GenKind): Gen[] {
  const m = /\[[\s\S]*\]/.exec(reply.replace(/```(?:json)?/g, '')); if (!m) return [];
  let arr: any; try { arr = JSON.parse(m[0]); } catch { return []; }
  return (Array.isArray(arr) ? arr : []).map(x => lineFor(kind, x)).filter(Boolean) as Gen[];
}

/** Generate about `n` cards from `text`. Calls `progress(done,total)` between pieces; keeps what it has if a later piece fails. */
export async function generate(text: string, kind: GenKind, n: number, progress?: (d: number, t: number) => void): Promise<{ cards: Gen[]; error: string }> {
  const parts = chunks(text), per = Math.max(2, Math.ceil(n / Math.max(1, parts.length))), cards: Gen[] = [], seen = new Set<string>();
  let error = '';
  for (let i = 0; i < parts.length; i++) {
    progress?.(i, parts.length);
    try {
      const r = await chat([
        { role: 'system', content: 'You turn study text into flashcards. Use ONLY facts stated in the text; never add outside facts. Skip trivia, dates of the document, and anything unclear. Reply with ONLY a JSON array, no other words.' },
        { role: 'user', content: 'Make up to ' + per + ' flashcards. ' + HOW[kind] + '\n\nTEXT:\n' + parts[i] }], 1800);
      for (const g of parseGen(r, kind)) { const k = g.label.toLowerCase(); if (!seen.has(k)) { seen.add(k); cards.push(g); } }
    } catch (e: any) { error = e.message; break; }
  }
  progress?.(parts.length, parts.length);
  return { cards: cards.slice(0, Math.max(n, 1) + 5), error };
}
