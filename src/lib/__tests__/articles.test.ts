import { describe, it, expect } from 'vitest';
import { prepare, titleOf } from '../articles/frame';
import { readFileSync } from 'fs';

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
describe('article list', () => {
  const m = JSON.parse(readFileSync('public/articles-data/index.json', 'utf8'));
  it('every article has the required fields and its file exists', () => {
    for (const a of m) {
      for (const k of ['slug', 'title', 'summary', 'tags', 'author', 'language', 'version', 'published_at', 'reading_minutes', 'status']) expect(a[k], k).toBeDefined();
      expect(['draft', 'review', 'published']).toContain(a.status);
      expect(() => readFileSync(`public/articles-data/${a.slug}/v${a.version}/index.html`)).not.toThrow();
    }
  });
});
