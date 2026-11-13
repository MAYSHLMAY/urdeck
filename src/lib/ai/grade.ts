/* Grade a typed answer by meaning, not spelling. Rules guard what similarity gets wrong: numbers and negation. */
import { Lexical, cos } from './lexical';
import { lev, negated, numbers, plain, tokens } from './text';
export type Verdict = 'right' | 'close' | 'wrong';
export interface Grade { verdict: Verdict; score: number; why: string; suggest: 0 | 1 | 2 | 3 }

const lex = new Lexical(); lex.fit([]);
export function gradeAnswer(typed: string, key: string, wrong: string[] = [], embed?: (a: string, b: string) => number | null): Grade {
  const t = plain(typed), k = plain(key);
  if (!t) return { verdict: 'wrong', score: 0, why: 'No answer typed.', suggest: 0 };
  const nt = tokens(t, true).join(' '), nk = tokens(k, true).join(' ');
  if (nt === nk) return { verdict: 'right', score: 1, why: 'Matches.', suggest: 2 };
  if (nk.length <= 24 && !/\d/.test(nk) && lev(nt, nk) <= Math.max(1, Math.floor(nk.length / 6))) return { verdict: 'right', score: 0.95, why: 'Right (small spelling slip).', suggest: 2 };
  const kn = numbers(k), tn = numbers(t);
  if (kn.length && !kn.every(x => tn.includes(x))) return { verdict: 'wrong', score: 0.2, why: 'The numbers differ (' + kn.join(', ') + ' expected).', suggest: 0 };
  const kt = new Set(tokens(k)), tt = new Set(tokens(t)), hit = [...kt].filter(x => tt.has(x)).length;
  const rec = kt.size ? hit / kt.size : 0, prec = tt.size ? hit / tt.size : 0, f1 = rec + prec ? 2 * rec * prec / (rec + prec) : 0;
  const A = lex.vec(t), B = lex.vec(k);
  let sim = Math.max(cos(A, B), f1);
  const e = embed ? embed(t, k) : null; if (e !== null) sim = 0.5 * sim + 0.5 * e;
  if (negated(t) !== negated(k) && kt.size > 1) return { verdict: 'wrong', score: Math.min(sim, 0.4), why: 'It says the opposite (check "not" / "increase" / "decrease").', suggest: 0 };
  // typed answer closer to a known wrong option than to the right one?
  const best = wrong.reduce((m, w) => Math.max(m, cos(A, lex.vec(w))), 0);
  if (best > sim + 0.15 && best > 0.5) return { verdict: 'wrong', score: sim, why: 'That sounds like a different option.', suggest: 0 };
  if (sim >= 0.8 || (rec >= 0.85 && prec >= 0.5) || (prec >= 0.95 && rec >= 0.55 && tt.size >= 3)) return { verdict: 'right', score: sim, why: 'Same meaning.', suggest: 2 };
  if (sim >= 0.45 || rec >= 0.5) return { verdict: 'close', score: sim, why: 'Close, but something is missing.', suggest: 1 };
  return { verdict: 'wrong', score: sim, why: 'Different from the answer.', suggest: 0 };
}
