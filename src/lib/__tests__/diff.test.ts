import { describe, it, expect } from 'vitest';
import { diff, lines, kept, looksLikeUpdate, identical, chunks, words } from '../articles/diff';
import { readFileSync } from 'fs';

const page = (ps: string[], js = '') => `<title>T</title><body><h1>Head</h1>${ps.map(p => `<p>${p}</p>`).join('')}<script>${js}</script></body>`;
const P = ['Voltage is the push that moves charge.', 'Current is the flow of charge in a wire.', 'Resistance opposes the flow of current.', 'Power is voltage times current.', 'A cycle is one full turn of the wave.'];

describe('article diff', () => {
  it('splits text and code into lines, decoding entities', () => {
    const l = lines('<p>A &amp; B</p><script>\nvar a = 1;\nvar longer = 2;\n</script>');
    expect(l.filter(x => x.k === 'text').map(x => x.s)).toEqual(['A & B']); expect(l.filter(x => x.k === 'code')).toHaveLength(2);
  });
  it('identical pages show no change', () => { const { sum } = diff(page(P), page(P)); expect(identical(sum)).toBe(true); expect(kept(sum)).toBe(1); });
  it('finds added, removed and changed lines', () => {
    const n = [...P]; n[1] = 'Current is the flow of electric charge in a wire.'; n.splice(3, 1); n.push('Frequency is cycles per second.');
    const { sum, ops } = diff(page(P), page(n));
    expect(sum.add).toBe(1); expect(sum.del).toBe(1); expect(sum.mod).toBe(1);
    const m = ops.find(o => o.t === 'mod') as any; expect(m.w.some((w: any) => w.t === 'add' && /electric/.test(w.s))).toBe(true);
  });
  it('a page with extra content added still looks like an update of the old one', () => {
    const more = [...P, 'Phase says where in the cycle you are.', 'Frequency is cycles per second.', 'Period is the time of one cycle.'];
    expect(looksLikeUpdate(diff(page(P), page(more)).sum)).toBe(true);
  });
  it('a different page does not look like an update', () => { expect(looksLikeUpdate(diff(page(P), page(['Bread needs flour.', 'Yeast makes it rise.', 'Bake until golden.'])).sum)).toBe(false); });
  it('notices changes in simulation code', () => { const { sum } = diff(page(P, 'var speed = 10;\nvar color = "red";'), page(P, 'var speed = 12;\nvar color = "red";')); expect(sum.mod + sum.add + sum.del).toBeGreaterThan(0); });
  it('folds long unchanged stretches and keeps context around changes', () => {
    const many = Array.from({ length: 30 }, (_, i) => 'Line number ' + i + ' of the notes'); const n = [...many]; n[15] = 'Line number 15 of the notes was edited';
    const c = chunks(diff(page(many), page(n)).ops); expect(c.some(x => x.type === 'fold')).toBe(true); expect(c.filter(x => x.type === 'op' && x.change)).toHaveLength(1);
  });
  it('word diff marks only what changed', () => { const w = words('a b c', 'a x c'); expect(w.filter(x => x.t !== 'same').map(x => x.t + ':' + x.s.trim())).toEqual(['del:b', 'add:x']); });
  it('handles the real article against a lightly edited copy quickly', () => {
    const h = readFileSync('public/articles-data/av01-ac-and-test-equipment/v1/index.html', 'utf8');
    const edited = h.replace('Voltage, current, resistance, power', 'Voltage, current, resistance and power') + '<p>A brand new closing note for readers.</p>';
    const t = Date.now(), r = diff(h, edited); expect(Date.now() - t).toBeLessThan(8000);
    expect(r.sum.add).toBeGreaterThanOrEqual(1); expect(looksLikeUpdate(r.sum)).toBe(true); expect(kept(r.sum)).toBeGreaterThan(0.95);
  });
});
describe('big pages', () => {
  it('spread-out edits across a large page stay correct and fast', () => {
    const base = Array.from({ length: 3000 }, (_, i) => 'Paragraph ' + i + ' explains topic ' + (i * 7 % 101) + ' in plain words');
    const edit = base.map((p, i) => (i % 150 === 0 ? p + ' and a bit more' : p)); edit.splice(1500, 0, 'A new paragraph inserted in the middle of the page'); edit.splice(2000, 3);
    const t = Date.now(), { sum } = diff(page(base), page(edit));
    expect(Date.now() - t).toBeLessThan(4000); expect(sum.add).toBe(1); expect(sum.mod).toBe(20); expect(sum.del).toBe(3);
  });
});
