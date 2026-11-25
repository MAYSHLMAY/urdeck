import { describe, it, expect } from 'vitest';
import { tooMany, tooManyKinds, readJson, ipOf } from '../server/limit';

const rq = (ip = '1.2.3.4', body = '{}', extra: Record<string, string> = {}) => new Request('http://x/api', { method: 'POST', body, headers: { 'x-forwarded-for': ip, ...extra } });

describe('rate limit', () => {
  it('allows up to the limit, then refuses', () => {
    const r = rq('9.9.9.1'); const res = Array.from({ length: 6 }, () => tooMany(r, 't1', 5, 60_000, 1000));
    expect(res).toEqual([false, false, false, false, false, true]);
  });
  it('forgets old calls after the window', () => {
    const r = rq('9.9.9.2'); for (let i = 0; i < 6; i++) tooMany(r, 't2', 5, 1000, 0);
    expect(tooMany(r, 't2', 5, 1000, 5000)).toBe(false);
  });
  it('counts each visitor and each route separately', () => {
    for (let i = 0; i < 6; i++) tooMany(rq('9.9.9.3'), 't3', 5, 60_000, 0);
    expect(tooMany(rq('9.9.9.4'), 't3', 5, 60_000, 0)).toBe(false);
    expect(tooMany(rq('9.9.9.3'), 'other', 5, 60_000, 0)).toBe(false);
  });
  it('uses the first address in the forwarded list', () => { expect(ipOf(rq('5.5.5.5, 10.0.0.1'))).toBe('5.5.5.5'); });
});
describe('different spaces per visitor', () => {
  it('lets the same space through forever, but stops a flood of new ones', () => {
    const r = rq('8.8.8.1'); const out: boolean[] = [];
    for (let i = 0; i < 4; i++) out.push(tooManyKinds(r, 'sp', 's' + i, 3, 3_600_000, 0));
    expect(out).toEqual([false, false, false, true]);
    expect(tooManyKinds(r, 'sp', 's1', 3, 3_600_000, 10)).toBe(false);
  });
});
describe('body size cap', () => {
  it('accepts a normal body', async () => { expect(await readJson(rq('1.1.1.1', '{"a":1}'), 100)).toEqual({ a: 1 }); });
  it('refuses a body over the cap, even with a false length header', async () => {
    await expect(readJson(rq('1.1.1.1', JSON.stringify({ a: 'x'.repeat(500) }), { 'content-length': '5' }), 100)).rejects.toMatchObject({ status: 413 });
  });
  it('refuses when the header already says it is too big', async () => {
    await expect(readJson(rq('1.1.1.1', '{}', { 'content-length': '999999' }), 100)).rejects.toMatchObject({ status: 413 });
  });
  it('bad JSON is an error, not a crash', async () => { await expect(readJson(rq('1.1.1.1', '{oops'), 100)).rejects.toBeTruthy(); });
});
