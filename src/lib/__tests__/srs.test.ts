import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEF, nxt, revIv, dayStart, addDays, steps, fz, examDays, leechHit, fmtIv, M, D, type CS, type Opts } from '../srs';

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const O = (o: Partial<Opts> = {}): Opts => ({ ...DEF, fuzz: false, ...o });
const card = (o: Partial<CS> = {}): CS => ({ t: 'new', step: 0, iv: 0, ease: 2.5, due: 0, lapses: 0, reps: 0, ...o });
const localDate = (t: number) => new Date(t).toLocaleDateString('en-CA');

beforeEach(() => { vi.useFakeTimers(); at('2026-03-10T12:00:00'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('step parsing', () => {
  it.each([['1 10', [1, 10]], ['1,10', [1, 10]], ['  5   15 ', [5, 15]], ['', [9]], ['abc', [9]], ['0 -3', [9]], ['10', [10]]])('%j', (s, want) => {
    expect(steps(s, [9])).toEqual(want);
  });
});

describe('day boundary', () => {
  it('before the rollover hour still counts as yesterday', () => {
    const t = new Date('2026-03-10T03:30:00').getTime();
    expect(localDate(dayStart(t, 4))).toBe('2026-03-09');
  });
  it('after the rollover hour is today', () => {
    const t = new Date('2026-03-10T04:30:00').getTime();
    expect(localDate(dayStart(t, 4))).toBe('2026-03-10');
    expect(new Date(dayStart(t, 4)).getHours()).toBe(4);
  });
  it('exactly at the rollover hour is today', () => {
    expect(localDate(dayStart(new Date('2026-03-10T04:00:00').getTime(), 4))).toBe('2026-03-10');
  });
  it('rollover 0 is plain midnight', () => {
    const d = new Date(dayStart(new Date('2026-03-10T00:00:01').getTime(), 0));
    expect([d.getHours(), localDate(d.getTime())]).toEqual([0, '2026-03-10']);
  });
  it('a bad rollover value falls back to midnight', () => {
    expect(new Date(dayStart(new Date('2026-03-10T10:00:00').getTime(), NaN as any)).getHours()).toBe(0);
  });
  it('answers just before and just after midnight land on the same due day when rollover is 4', () => {
    const c = card({ t: 'review', iv: 10, ease: 2.5, reps: 5, due: new Date('2026-03-09T23:00:00').getTime() });
    at('2026-03-10T23:59:00'); const a = nxt('x', c, 2, O());
    at('2026-03-11T00:01:00'); const b = nxt('x', c, 2, O());
    expect(localDate(a.due) === localDate(b.due)).toBe(true);
  });
  it('adding days keeps the clock time across a daylight-saving change', () => {
    const t = new Date('2026-03-07T04:00:00').getTime();
    expect(new Date(addDays(t, 3)).getHours()).toBe(4);
  });
});

describe('new and learning cards', () => {
  it('good on a new card moves to the second step, due in 10 minutes', () => {
    const n = nxt('a', card(), 2, O());
    expect([n.t, n.step, n.due]).toEqual(['learn', 1, Date.now() + 10 * M]);
  });
  it('good on the last step graduates with the graduating interval', () => {
    const n = nxt('a', card({ t: 'learn', step: 1 }), 2, O());
    expect([n.t, n.iv, n.reps, n.ease]).toEqual(['review', 1, 1, 2.5]);
    expect(n.due).toBe(addDays(dayStart(Date.now(), 4), 1));
  });
  it('easy on a new card graduates straight to the easy interval', () => {
    const n = nxt('a', card(), 3, O());
    expect([n.t, n.iv]).toEqual(['review', 4]);
  });
  it('hard on the first step waits between step one and two', () => {
    const n = nxt('a', card(), 1, O());
    expect(n.due).toBe(Date.now() + 5.5 * M);
    expect([n.t, n.step]).toEqual(['learn', 0]);
  });
  it('hard on the last step waits one and a half times the step', () => {
    const n = nxt('a', card({ t: 'learn', step: 1 }), 1, O());
    expect(n.due).toBe(Date.now() + 15 * M);
  });
  it('again puts a new card into learning, back at step zero, within the wrong window', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const n = nxt('a', card({ t: 'learn', step: 1 }), 0, O());
    expect([n.t, n.step]).toEqual(['learn', 0]);
    expect(n.due).toBe(Date.now() + 2.5 * M);
  });
  it('again always lands between the minimum and maximum minutes', () => {
    for (const r of [0, 0.37, 0.999]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const d = (nxt('a', card(), 0, O()).due - Date.now()) / M;
      expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(4);
    }
  });
  it('does not change the card it was given', () => {
    const c = card(); const copy = { ...c }; nxt('a', c, 2, O()); expect(c).toEqual(copy);
  });
  it('a single learning step graduates on good', () => {
    const n = nxt('a', card(), 2, O({ steps: '10' }));
    expect(n.t).toBe('review');
  });
});

describe('review cards', () => {
  const rv = (o: Partial<CS> = {}) => card({ t: 'review', iv: 10, ease: 2.5, reps: 4, due: Date.now(), ...o });
  it('good multiplies by ease, hard is shorter, easy is longer', () => {
    const h = nxt('a', rv(), 1, O()).iv, g = nxt('a', rv(), 2, O()).iv, e = nxt('a', rv(), 3, O()).iv;
    expect(g).toBe(25); expect(h).toBe(12); expect(e).toBe(33);
    expect(h).toBeLessThan(g); expect(g).toBeLessThan(e);
  });
  it('ease moves -0.15 on hard, +0.15 on easy, unchanged on good', () => {
    expect(nxt('a', rv(), 1, O()).ease).toBeCloseTo(2.35); expect(nxt('a', rv(), 3, O()).ease).toBeCloseTo(2.65); expect(nxt('a', rv(), 2, O()).ease).toBe(2.5);
  });
  it('ease never drops below 1.3', () => {
    expect(nxt('a', rv({ ease: 1.35 }), 1, O()).ease).toBe(1.3);
    expect(nxt('a', rv({ ease: 1.3 }), 0, O()).ease).toBe(1.3);
  });
  it('a lapse goes to relearning, counts the lapse, cuts the interval and ease', () => {
    const n = nxt('a', rv({ iv: 20 }), 0, O());
    expect([n.t, n.lapses, n.iv, n.step]).toEqual(['relearn', 1, 10, 0]);
    expect(n.ease).toBeCloseTo(2.3);
  });
  it('a lapse never makes the interval smaller than one day', () => {
    expect(nxt('a', rv({ iv: 1 }), 0, O()).iv).toBe(1);
  });
  it('relearning graduates back to review keeping the cut interval', () => {
    const n = nxt('a', card({ t: 'relearn', iv: 8, ease: 2.3, lapses: 1, reps: 5 }), 2, O());
    expect([n.t, n.iv, n.ease]).toEqual(['review', 8, 2.3]);
  });
  it('lateness adds to the next interval but a good answer is always longer than hard', () => {
    const late = rv({ due: Date.now() - 6 * D });
    expect(nxt('a', late, 2, O()).iv).toBeGreaterThan(nxt('a', rv(), 2, O()).iv);
    expect(nxt('a', late, 2, O()).iv).toBeGreaterThan(nxt('a', late, 1, O()).iv);
  });
  it('order is always hard < good < easy, even for tiny intervals', () => {
    for (const iv of [1, 2, 3]) { const c = rv({ iv, ease: 1.3 }); const [h, g, e] = [1, 2, 3].map(x => revIv('a', c, x, O())); expect(h).toBeLessThan(g); expect(g).toBeLessThan(e); }
  });
  it('the maximum interval is respected', () => {
    expect(nxt('a', rv({ iv: 3000 }), 3, O({ maxIv: 365 })).iv).toBe(365);
  });
  it('higher target recall gives shorter intervals', () => {
    expect(revIv('a', rv(), 2, O({ retention: 95 }))).toBeLessThan(revIv('a', rv(), 2, O({ retention: 90 })));
    expect(revIv('a', rv(), 2, O({ retention: 80 }))).toBeGreaterThan(revIv('a', rv(), 2, O({ retention: 90 })));
  });
  it('the due date is a day boundary, not the answer time', () => {
    const n = nxt('a', rv(), 2, O());
    expect(new Date(n.due).getHours()).toBe(4);
  });
  it('counts one more rep each time', () => {
    expect(nxt('a', rv({ reps: 7 }), 2, O()).reps).toBe(8);
  });
});

describe('exam date cap', () => {
  it('nothing is scheduled past the day before the exam', () => {
    const x = O({ exam: '2026-03-20' });
    expect(examDays(x)).toBe(10);
    expect(revIv('a', card({ t: 'review', iv: 30, ease: 2.5, due: Date.now() }), 3, x)).toBe(10);
  });
  it('an exam today or in the past turns the cap off', () => {
    expect(examDays(O({ exam: '2026-03-10' }))).toBe(0);
    expect(examDays(O({ exam: '2026-01-01' }))).toBe(0);
  });
  it('an invalid date or the switch off means no cap', () => {
    expect(examDays(O({ exam: 'nonsense' }))).toBe(0);
    expect(examDays(O({ exam: '2026-03-20', examCap: false }))).toBe(0);
    expect(examDays(O({ exam: '' }))).toBe(0);
  });
  it('the cap never goes below one day', () => {
    expect(revIv('a', card({ t: 'review', iv: 30, ease: 2.5, due: Date.now() }), 1, O({ exam: '2026-03-12' }))).toBeGreaterThanOrEqual(1);
  });
});

describe('fuzz and helpers', () => {
  it('fuzz is the same every time for the same card and rep, and stays within one', () => {
    expect(fz('abc', 3)).toBe(fz('abc', 3));
    for (let i = 0; i < 200; i++) { const v = fz('card' + i, i); expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
  });
  it('fuzz changes long intervals by at most 5 percent', () => {
    const c = card({ t: 'review', iv: 100, ease: 2.5, due: Date.now() });
    const base = revIv('z', c, 2, O({ fuzz: false })), fuzzed = revIv('z', c, 2, O({ fuzz: true }));
    expect(Math.abs(fuzzed - base) / base).toBeLessThanOrEqual(0.06);
  });
  it('leech is hit at the threshold and every half threshold after', () => {
    expect([7, 8, 9, 11, 12, 16].map(n => leechHit(n, 8))).toEqual([false, true, false, false, true, true]);
  });
  it('interval labels', () => {
    expect([fmtIv(5), fmtIv(45), fmtIv(400)]).toEqual(['5d', '1.5mo', '1.1y']);
  });
});
