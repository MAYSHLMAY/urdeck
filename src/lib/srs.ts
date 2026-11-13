/* Spaced-repetition scheduler. Pure functions, same maths as the original app. */
export const M = 60000, D = 86400000;

export const DEF = {
  steps: '1 10', relearn: '10', wrongMin: 1, wrongMax: 4, grad: 1, easyIv: 4, startEase: 2.5, easyBonus: 1.3,
  hardIv: 1.2, ivMod: 1, maxIv: 3650, lapseNew: 50, leech: 8, leechSusp: false, learnAhead: 2, rollover: 4,
  newOrder: 'seq', mix: 'after', maxRev: 200, fuzz: true, autoGood: false, vib: true, sound: false, smart: true, dailyGoal: 20, remind: '', theme: 'auto', size: 'm', exam: '', conf: true, readable: false, contrast: false
};
export type Opts = typeof DEF;

export interface CS {
  t: 'new' | 'learn' | 'review' | 'relearn';
  step: number; iv: number; ease: number; due: number; lapses: number; reps: number;
  a?: number; k?: number; mark?: number; susp?: number; by?: number;
}

export const ymd = (d: Date) => d.toLocaleDateString('en-CA');

export function dayStart(t: number, rollover: number) {
  const d = new Date(t);
  d.setHours(+rollover || 0, 0, 0, 0);
  if (d.getTime() > t) d.setDate(d.getDate() - 1);
  return d.getTime();
}
export function addDays(t: number, n: number) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
export const steps = (s: any, d: number[]) => {
  const a = String(s).split(/[\s,]+/).map(Number).filter(x => x > 0);
  return a.length ? a : d;
};

export const fz = (id: string, n: number) => {
  let h = 2166136261;
  for (const ch of id + ':' + n) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2001) / 1000 - 1;
};

export function revIv(id: string, c: CS, g: number, x: Opts) {
  const late = Math.max(0, Math.floor((Date.now() - c.due) / D)), iv = Math.max(1, c.iv || 1);
  const f = (v: number) => {
    v = Math.round(v * x.ivMod);
    if (x.fuzz && v >= 3) v = Math.round(v * (1 + .05 * fz(id, c.reps || 0)));
    return v;
  };
  let h = f((iv + late / 4) * x.hardIv), gd = f((iv + late / 2) * c.ease), e = f((iv + late) * c.ease * x.easyBonus);
  h = Math.max(1, h); gd = Math.max(gd, h + 1); e = Math.max(e, gd + 1);
  return Math.min(x.maxIv, g === 1 ? h : g === 2 ? gd : e);
}

/** Next state of a card for grade g (0 again, 1 hard, 2 good, 3 easy). */
export function nxt(id: string, c0: CS, g: number, x: Opts): CS {
  const c = { ...c0 }, now = Date.now();
  if (g === 0) {
    if (c.t === 'review') {
      c.lapses = (c.lapses || 0) + 1; c.ease = Math.max(1.3, c.ease - .2);
      c.iv = Math.max(1, Math.round(c.iv * x.lapseNew / 100)); c.t = 'relearn';
    } else if (c.t === 'new') c.t = 'learn';
    c.step = 0;
    c.due = now + (x.wrongMin + Math.random() * Math.max(0, x.wrongMax - x.wrongMin)) * M;
    return c;
  }
  if (c.t !== 'review') {
    const re = c.t === 'relearn', st = re ? steps(x.relearn, [10]) : steps(x.steps, [1, 10]), i = Math.min(c.step || 0, st.length - 1);
    if (g === 1) {
      const dl = (i === 0 && st.length > 1) ? (st[0] + st[1]) / 2 : st[i] * 1.5;
      c.t = re ? 'relearn' : 'learn'; c.step = i; c.due = now + dl * M; return c;
    }
    if (g === 2 && i + 1 < st.length) { c.t = re ? 'relearn' : 'learn'; c.step = i + 1; c.due = now + st[i + 1] * M; return c; }
    if (!re) c.ease = x.startEase;
    c.iv = re ? Math.max(1, g === 3 ? c.iv + 1 : c.iv) : (g === 3 ? x.easyIv : x.grad);
    c.t = 'review'; c.step = 0; c.reps = (c.reps || 0) + 1; c.due = addDays(dayStart(now, x.rollover), c.iv); return c;
  }
  c.iv = revIv(id, c, g, x);
  c.ease = g === 1 ? Math.max(1.3, c.ease - .15) : g === 3 ? c.ease + .15 : c.ease;
  c.reps = (c.reps || 0) + 1; c.due = addDays(dayStart(now, x.rollover), c.iv); return c;
}

export function fmtIv(d: number) {
  return d >= 365 ? (d / 365).toFixed(1).replace('.0', '') + 'y' : d >= 30 ? (d / 30).toFixed(1).replace('.0', '') + 'mo' : d + 'd';
}

export function lab(id: string, c: CS, g: number, x: Opts) {
  if (g === 0) return (x.wrongMin === x.wrongMax ? x.wrongMin : x.wrongMin + '–' + x.wrongMax) + 'm';
  const n = nxt(id, c, g, x);
  if (n.t === 'review') return fmtIv(n.iv);
  const m = Math.round((n.due - Date.now()) / M);
  return m >= 60 ? Math.round(m / 60) + 'h' : m + 'm';
}
