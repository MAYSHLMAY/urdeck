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
