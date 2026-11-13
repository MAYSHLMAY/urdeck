/* Daily goal, badges and weak-topic insights. Everything is computed from data the engine already keeps. */
import type { Engine } from './engine';

export interface Badge { id: string; icon: string; title: string; desc: string; cur: number; need: number; have: boolean }
export function badges(e: Engine): Badge[] {
  const S = e.S, mastered = Object.values(S.cards as Record<string, any>).filter(c => c && c.t === 'review' && c.iv >= 21).length;
  const goal = e.O.dailyGoal || 20, goalDays = Object.values(S.log || {}).filter((l: any) => l && l.n >= goal).length;
  const defs: [string, string, string, string, number, number][] = [
    ['a10', 'sparkle', 'First steps', 'Answer 10 cards', S.done || 0, 10], ['a100', 'bolt', 'Warming up', 'Answer 100 cards', S.done || 0, 100],
    ['a500', 'target', 'Dedicated', 'Answer 500 cards', S.done || 0, 500], ['a1000', 'trophy', 'Thousand club', 'Answer 1,000 cards', S.done || 0, 1000],
    ['s3', 'fire', '3-day streak', 'Study 3 days in a row', S.best || 0, 3], ['s7', 'fire', 'Week streak', 'Study 7 days in a row', S.best || 0, 7], ['s30', 'fire', 'Month streak', 'Study 30 days in a row', S.best || 0, 30],
    ['m50', 'star', 'Mastery 50', 'Master 50 cards', mastered, 50], ['m200', 'star', 'Mastery 200', 'Master 200 cards', mastered, 200],
    ['g5', 'check', 'Goal getter', `Hit your daily goal on 5 days`, goalDays, 5]
  ];
  return defs.map(([id, icon, title, desc, cur, need]) => ({ id, icon, title, desc, cur: Math.min(cur, need), need, have: cur >= need }));
}
/** Badges earned since the last time we looked (device only). */
export function newBadges(e: Engine): Badge[] {
  let seen: string[] = []; try { seen = JSON.parse(localStorage.getItem('fr-badges-v1') || '[]'); } catch { /* ignore */ }
  const have = badges(e).filter(b => b.have), fresh = have.filter(b => !seen.includes(b.id));
  if (fresh.length) try { localStorage.setItem('fr-badges-v1', JSON.stringify(have.map(b => b.id))); } catch { /* ignore */ }
  return seen.length || !fresh.length ? fresh : []; // first ever look: record quietly
}
export function todayCount(e: Engine) { const l = e.S.log?.[e.dayKey(Date.now())]; return l ? l.n || 0 : 0; }

export interface Weak { s: string; label: string; cards: number; tried: number; acc: number; missed: number }
export function weakTopics(e: Engine, limit = 3): Weak[] {
  const by = new Map<string, { cards: number; a: number; k: number; missed: number }>();
  e.Q.forEach(q => {
    const c = e.S.cards[q.id], r = by.get(q.s) || { cards: 0, a: 0, k: 0, missed: 0 }; r.cards++;
    if (c) { r.a += c.a || 0; r.k += c.k || 0; }
    if (e.MIS[q.id]) r.missed++;
    by.set(q.s, r);
  });
  return [...by].filter(([, r]) => r.a >= 5).map(([s, r]) => {
    const i = e.FT.secInfo.get(s);
    return { s, label: i ? (i.n ? i.n + ' · ' : '') + i.t : s, cards: r.cards, tried: r.a, acc: r.k / r.a, missed: r.missed };
  }).filter(w => w.acc < 0.85 || w.missed >= 3).sort((a, b) => a.acc - b.acc || b.missed - a.missed).slice(0, limit);
}

/** Cards you were SURE about and got wrong (confidence rating). */
export const overconfident = (e: Engine) => Object.keys(e.AUX.oc).filter(id => e.qById(id));

/** Weak-spot sprint: the weakest cards across all topics, mixed. */
export function sprintIds(e: Engine, n = 15): string[] {
  const sc = e.Q.map(q => { const c = e.S.cards[q.id], m = e.MIS[q.id];
    return { id: q.id, s: (e.AUX.oc[q.id] || 0) * 3 + (m ? m.w * 2 : 0) + (e.isShaky(q.id) ? 2 : 0) + (c && c.a >= 2 && c.k / c.a < 0.6 ? 2 : 0) + Math.random() * 0.5 };
  }).filter(x => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.id);
  return sc.sort(() => Math.random() - 0.5);
}

/** One honest streak number for the Home screen: log-based, but never lower than a freeze-protected streak. */
export function streakInfo(e: Engine) {
  const S = e.S, now = Date.now(), done = todayCount(e) > 0, y = e.dayKey(e.addDays(e.dayStart(now), -1));
  let live = false; for (let k = 0; k <= 1 + (S.freeze || 0); k++) if (S.last === e.dayKey(e.addDays(e.dayStart(now), -k))) live = true;
  const n = Math.max(e.logStreak(), live ? S.streak || 0 : 0);
  return { n, done, atRisk: !done && n > 0, yest: !!S.log?.[y]?.n };
}
