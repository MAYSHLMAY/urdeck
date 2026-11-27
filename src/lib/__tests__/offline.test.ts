import { describe, it, expect } from 'vitest';
import { externalRefs, summary } from '../articles/offline';

const kinds = (h: string) => externalRefs(h).map(e => e.kind + ':' + e.host).sort();
describe('offline check', () => {
  it('a self-contained page is fine', () => { expect(summary(externalRefs('<title>x</title><style>body{background:url(data:image/png;base64,AAA)}</style><p>hi</p><script>var a=1</script><a href="https://example.com">link</a>')).ok).toBe(true); });
  it('finds code, styles, pictures, requests and frames', () => {
    const h = '<script src="https://cdn.jsdelivr.net/npm/x.js"></script><link rel="stylesheet" href="//cdn.example.com/a.css"><img src="https://img.example.com/a.png"><iframe src="https://www.youtube.com/embed/1"></iframe><script>fetch("https://api.example.com/x")</script>';
    expect(kinds(h)).toEqual(['frame:www.youtube.com', 'image:img.example.com', 'request:api.example.com', 'script:cdn.jsdelivr.net', 'style:cdn.example.com']);
  });
  it('does not count the fonts the app hosts, but does count other fonts', () => {
    expect(externalRefs('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&family=JetBrains+Mono" rel="stylesheet">')).toHaveLength(0);
    expect(summary(externalRefs('<link href="https://fonts.googleapis.com/css2?family=Roboto" rel="stylesheet">'))).toMatchObject({ breaks: 0, missing: 1 });
  });
  it('finds css url() and @import, and ignores namespaces and comments', () => {
    expect(kinds('<style>@import url("https://a.example/x.css");div{background:url(https://b.example/p.jpg)}</style>')).toEqual(['image:b.example', 'style:a.example']);
    expect(externalRefs('<svg xmlns="http://www.w3.org/2000/svg"></svg><!-- <img src="https://x.example/a.png"> -->')).toHaveLength(0);
  });
  it('splits what breaks from what only looks different', () => { expect(summary(externalRefs('<img src="https://a.example/a.png"><script src="https://b.example/b.js"></script>'))).toMatchObject({ breaks: 1, missing: 1, total: 2 }); });
});
