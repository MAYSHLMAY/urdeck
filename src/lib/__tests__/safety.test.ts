import { describe, it, expect } from 'vitest';
import { countCards, validProgress, shrunk, prune, migrate, dayKey } from '../safety';

const prog = (n: number) => JSON.stringify({ S: { cards: Object.fromEntries(Array.from({ length: n }, (_, i) => ['c' + i, { t: 'new' }])) } });

describe('reading the progress file', () => {
  it('counts cards', () => { expect(countCards(prog(5))).toBe(5); });
  it('empty or missing is zero, not an error', () => { expect([countCards(null), countCards(''), countCards(undefined)]).toEqual([0, 0, 0]); });
  it('damaged text is reported as unreadable', () => { expect(countCards('{oops')).toBe(-1); expect(validProgress('{oops')).toBe(false); });
  it('the wrong shape is reported as unreadable', () => { expect(countCards('{"x":1}')).toBe(-1); expect(countCards('null')).toBe(-1); expect(countCards('5')).toBe(-1); });
  it('a good file is valid', () => { expect(validProgress(prog(3))).toBe(true); });
});

describe('shrink guard', () => {
  const big = 'x'.repeat(20000);
  it('flags a save that throws away most of the data', () => { expect(shrunk(big, 'x'.repeat(3000))).toBe(true); });
  it('ignores normal changes', () => { expect(shrunk(big, 'x'.repeat(19000))).toBe(false); expect(shrunk(big, 'x'.repeat(9000))).toBe(false); });
  it('ignores tiny files and first saves', () => { expect(shrunk('x'.repeat(100), '')).toBe(false); expect(shrunk(null, 'abc')).toBe(false); });
});

describe('which copies are kept', () => {
  const mk = (label: string, t: number) => ({ id: label + t, t, label });
  it('keeps the newest four daily copies and drops older ones', () => {
    const l = [1, 2, 3, 4, 5, 6].map(i => mk('daily', i * 1000));
    expect(prune(l).map(x => x.t).sort()).toEqual([3000, 4000, 5000, 6000]);
  });
  it('keeps the last two update copies separately from daily ones', () => {
    const l = [mk('update', 1), mk('update', 2), mk('update', 3), mk('daily', 4)];
    expect(prune(l).map(x => x.id).sort()).toEqual(['daily4', 'update2', 'update3']);
  });
  it('keeps recent special copies', () => {
    const l = [1, 2, 3, 4].map(i => mk('shrink', i));
    expect(prune(l)).toHaveLength(3);
  });
  it('never invents or loses ids it should keep', () => { expect(prune([])).toEqual([]); });
});

describe('migrations', () => {
  it('runs each step in order from the stored version', () => {
    const log: number[] = [];
    const v = migrate({}, 1, 3, [() => log.push(2), () => log.push(3)]);
    expect([v, log]).toEqual([3, [2, 3]]);
  });
  it('does nothing when already current', () => { const log: number[] = []; expect(migrate({}, 3, 3, [() => log.push(1)])).toBe(3); expect(log).toEqual([]); });
  it('can change the saved text', () => {
    const d: Record<string, string> = { a: '1' };
    migrate(d, 1, 2, [x => { x.a = '2'; }]);
    expect(d.a).toBe('2');
  });
});

describe('day key', () => { it('is a stable local date', () => { expect(dayKey(new Date('2026-03-10T12:00:00').getTime())).toBe('2026-03-10'); }); });
