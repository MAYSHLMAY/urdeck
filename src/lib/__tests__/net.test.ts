import { describe, it, expect, beforeEach, vi } from 'vitest';
import { timedFetch, fetchRetry, offline, netFail, netOk, _resetNet, NetError } from '../net';

beforeEach(() => { _resetNet(); vi.restoreAllMocks(); });

describe('net', () => {
  it('times out a hung request instead of waiting forever', async () => {
    vi.stubGlobal('fetch', (_u: any, i: any) => new Promise((_r, rej) => i.signal.addEventListener('abort', () => rej(new Error('abort')))));
    await expect(timedFetch('/x', {}, 30)).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('reports a dead connection as NetError offline', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(timedFetch('/x', {}, 100)).rejects.toBeInstanceOf(NetError);
  });
  it('server errors still count as connected', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('no', { status: 500 })));
    const r = await timedFetch('/x', {}, 100); expect(r.status).toBe(500); expect(offline()).toBe(false);
  });
  it('goes offline after two failures and recovers on success', () => {
    netFail(); expect(offline()).toBe(false); netFail(); expect(offline()).toBe(true);
    netOk(); expect(offline()).toBe(false);
  });
  it('the offline mark expires on its own', () => { const t = Date.now(); netFail(t); netFail(t); expect(offline(t + 1000)).toBe(true); expect(offline(t + 60000)).toBe(false); });
  it('retries then succeeds', async () => {
    let n = 0; vi.stubGlobal('fetch', () => (++n < 3 ? Promise.reject(new TypeError('x')) : Promise.resolve(new Response('ok'))));
    const r = await fetchRetry('/x', {}, { ms: 100, wait: 1 }); expect(await r.text()).toBe('ok'); expect(n).toBe(3);
  });
});
