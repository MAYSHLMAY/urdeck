import { describe, it, expect } from 'vitest';
import { prepare, titleOf } from '../articles/frame';

describe('article frame', () => {
  it('adds a CSP that blocks network requests, and the ready reporter before </body>', () => {
    const o = prepare('<title>x</title><body><p>hi</p></body>');
    expect(o).toContain("connect-src 'none'"); expect(o).toContain("form-action 'none'");
    expect(o.indexOf('postMessage')).toBeLessThan(o.indexOf('</body>'));
  });
  it('still reports when the page has no </body>', () => { expect(prepare('<p>x</p>')).toContain('postMessage'); });
  it('picks a title from <title>, then <h1>, then the file name', () => {
    expect(titleOf('<title>My &amp; Notes</title>', 'a.html')).toBe('My & Notes');
    expect(titleOf('<h1>Big <i>idea</i></h1>', 'a.html')).toBe('Big idea');
    expect(titleOf('<p>nothing</p>', 'my-notes.html')).toBe('my-notes');
  });
});
import { localFonts } from '../articles/frame';
describe('local fonts', () => {
  const link = (q: string) => `<link rel="preconnect" href="https://fonts.gstatic.com"><link href="https://fonts.googleapis.com/css2?${q}&display=swap" rel="stylesheet"><body>x</body>`;
  it('swaps Google Fonts for the hosted copy when every family is hosted', () => {
    const o = localFonts(link('family=Inter:wght@400;700&family=JetBrains+Mono:wght@400&family=Space+Grotesk:wght@500'));
    expect(o).toContain('/fonts/articles/fonts.css'); expect(o).not.toContain('googleapis'); expect(o).not.toContain('gstatic');
  });
  it('leaves the page alone when it needs a font we do not host', () => { const h = link('family=Inter&family=Roboto'); expect(localFonts(h)).toBe(h); });
  it('handles @import and pages with no fonts', () => {
    expect(localFonts("<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400');body{}</style>")).toContain('fonts.css');
    expect(localFonts('<p>x</p>')).toBe('<p>x</p>');
  });
});
import { standalone } from '../articles/frame';
describe('standalone page', () => {
  it('keeps each article’s saved settings separate from other articles and from the app', () => {
    const store: Record<string, string> = { 'fr-progress-v1': 'secret' };
    const S = { get length() { return Object.keys(store).length; }, key: (i: number) => Object.keys(store)[i] ?? null, getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    const run = (id: string, code: string) => { const w: any = { localStorage: S }; const src = standalone('<body></body>', id).match(/<script>([\s\S]*?)<\/script>/)![1]; new Function('window', src)(w); return new Function('localStorage', code)(w.localStorage); };
    run('p:a', "localStorage.setItem('theme','dark')"); run('p:b', "localStorage.setItem('theme','light')");
    expect(run('p:a', "return localStorage.getItem('theme')")).toBe('dark'); expect(run('p:b', "return localStorage.getItem('theme')")).toBe('light');
    expect(run('p:a', "return localStorage.getItem('fr-progress-v1')")).toBeNull(); expect(run('p:a', "return localStorage.length")).toBe(1);
    run('p:a', 'localStorage.clear()'); expect(store['fr-progress-v1']).toBe('secret'); expect(run('p:b', "return localStorage.getItem('theme')")).toBe('light');
  });
});
