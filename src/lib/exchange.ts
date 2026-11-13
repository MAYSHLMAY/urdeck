/* Import / export: CSV (this app), Anki "notes as text" and Quizlet-style two-column text. */
import { parseImg, qText, withImg, type Pin } from './cardimg';
import type { Card } from './types';
import { kindOf, withKind, clozeNums, distractors, stripKind, type Kind } from './kind';
import { parseOcc, occToken } from './occ';

const SEP = '¦'; // stands in for "|" inside a picture token while a pack is written in the question|correct|wrong… text format

export function csvParse(text: string, delim: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"' && f === '') q = true;
    else if (ch === delim) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else f += ch;
  }
  row.push(f); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
const csvCell = (x: string) => /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
const pinsOut = (ps: Pin[]) => ps.map(p => p.t.replace(/[;@]/g, ' ') + '@' + p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(';');
const pinsIn = (s: string): Pin[] => s.split(';').map(x => { const k = x.lastIndexOf('@'); if (k < 0) return null; const [a, b] = x.slice(k + 1).split(',').map(Number); return isFinite(a) && isFinite(b) ? { t: x.slice(0, k).trim(), x: a, y: b } : null; }).filter(Boolean) as Pin[];
const html2txt = (h: string) => h.replace(/<br\s*\/?>/gi, ' ').replace(/<img[^>]*>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const plainField = (h: string) => html2txt(h).replace(/\|/g, '/');

export function cardsToCsv(cards: Card[]): string {
  const head = ['set', 'question', 'correct', 'wrong1', 'wrong2', 'wrong3', 'wrong4', 'wrong5', 'image', 'pins'];
  const rows = cards.map(c => {
    const im = parseImg(c.q), w = [...c.w, '', '', '', '', ''].slice(0, 5);
    return [c.s, html2txt(qText(c.q)), html2txt(c.c), ...w.map(html2txt), im?.src || '', im ? pinsOut(im.pins) : ''];
  });
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
/** Anki "Notes in Plain Text": Front <tab> Back <tab> Tags. Wrong choices go below the answer so nothing is lost. */
export function cardsToAnki(cards: Card[]): string {
  const esc = (x: string) => x.replace(/[\t\r\n]+/g, ' ');
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];
  cards.forEach(c => {
    const im = parseImg(c.q), front = esc(html2txt(qText(c.q))) + (im && /^https?:/.test(im.src) ? '<br><img src="' + im.src + '">' : '');
    const back = '<b>' + esc(html2txt(c.c)) + '</b>' + (c.w.length ? '<br><small>Not: ' + c.w.map(x => esc(html2txt(x))).join(' / ') + '</small>' : '');
    lines.push([front, back, esc(c.s).replace(/\s+/g, '_')].join('\t'));
  });
  return lines.join('\n') + '\n';
}

export interface ImportResult { text: string; n: number; borrowed: boolean; skipped: number; note: string }
/** Turn a CSV / TSV / Anki text file into the app's pack text. Two-column files get wrong choices borrowed from other cards. */
export function importToPack(file: string, raw: string, defSet: string, asFlip = false): ImportResult {
  if (isCardsFile(raw)) return importCardsFile(file, raw, defSet);
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/);
  const meta = lines.filter(l => l.startsWith('#') && /^#\w[\w ]*:/.test(l));
  const data = lines.filter(l => !(l.startsWith('#') && /^#\w[\w ]*:/.test(l))).join('\n');
  const first = data.split('\n').find(l => l.trim()) || '';
  const sepMeta = meta.find(l => l.startsWith('#separator:'))?.slice(11).trim();
  const delim = sepMeta === 'tab' || (!sepMeta && first.includes('\t')) ? '\t' : sepMeta === 'semicolon' ? ';' : sepMeta === 'comma' ? ',' : (first.split(';').length > first.split(',').length ? ';' : ',');
  let rows = csvParse(data, delim);
  if (!rows.length) return { text: '', n: 0, borrowed: false, skipped: 0, note: 'The file is empty.' };
  const hdr = rows[0].map(x => x.trim().toLowerCase());
  const ours = hdr.includes('question') && (hdr.includes('correct') || hdr.includes('answer'));
  const sec = (x: string) => (x || defSet || file.replace(/\.[^.]+$/, '') || 'Imported').replace(/[\r\n#|]/g, ' ').trim() || 'Imported';
  const out: { s: string; q: string; c: string; w: string[] }[] = []; let skipped = 0, borrowed = false;
  const tok = (src: string, pins: Pin[], q: string) => { const t = withImg(q, /^(https?:|data:image\/)/.test(src) ? { src, pins } : null); return t.replace(/\|/g, (m, o) => (t.lastIndexOf('<!--img:', o) > t.lastIndexOf('-->', o) ? SEP : '/')); };
  if (ours) {
    const ix = (n: string[]) => hdr.findIndex(h => n.includes(h)), iS = ix(['set', 'section', 'deck', 'tags']), iQ = ix(['question']), iC = ix(['correct', 'answer']);
    const iW = hdr.map((h, i) => /^wrong/.test(h) ? i : -1).filter(i => i >= 0), iI = ix(['image', 'picture']), iP = ix(['pins']);
    rows.slice(1).forEach(r => {
      const q = plainField(r[iQ] || ''), c = plainField(r[iC] || ''), w = iW.map(i => plainField(r[i] || '')).filter(Boolean);
      if (!q || !c || !w.length) { skipped++; return; }
      out.push({ s: sec(r[iS] || ''), q: iI >= 0 && r[iI] ? tok(r[iI].trim(), iP >= 0 ? pinsIn(r[iP] || '') : [], q) : q, c, w });
    });
  } else {
    borrowed = true;
    const pairs = rows.filter(r => r.length >= 2).map(r => ({ f: plainField(r[0]), b: plainField(r[1]), s: sec(r[2] || '') })).filter(p => p.f && p.b);
    skipped = rows.length - pairs.length;
    if (asFlip && pairs.length) {
      let cur = '';
      const body = pairs.map(p => { const h = p.s !== cur ? (cur = p.s, '#' + p.s + '\n') : ''; return h + (/\{\{c\d+::/.test(p.f) ? 'C: ' + p.f.replace(/\|/g, '/') : 'F: ' + p.f.replace(/\|/g, '/') + ' | ' + p.b.replace(/\|/g, '/')); }).join('\n');
      const r = importCardsFile(file, body, ''); r.skipped += skipped; return r;
    }
    if (pairs.length < 4) return { text: '', n: 0, borrowed, skipped, note: 'Two-column files need at least 4 cards, because wrong choices are borrowed from the other cards.' };
    pairs.forEach((p, i) => {
      const pool = pairs.filter((x, k) => k !== i && x.b !== p.b), w: string[] = [];
      for (let t = 0; t < 40 && w.length < 3 && pool.length; t++) { const b = pool[Math.floor(Math.random() * pool.length)].b; if (!w.includes(b)) w.push(b); }
      if (!w.length) { skipped++; return; }
      out.push({ s: p.s, q: p.f, c: p.b, w });
    });
  }
  const bySet = new Map<string, typeof out>(); out.forEach(c => { const a = bySet.get(c.s) || []; a.push(c); bySet.set(c.s, a); });
  const text = [...bySet].map(([s, a]) => '#' + s + '\n' + a.map(c => [c.q, c.c, ...c.w.slice(0, 3), ...Array(Math.max(0, 3 - c.w.slice(0, 3).length)).fill(c.w[0])].join('|')).join('\n')).join('\n');
  return { text, n: out.length, borrowed, skipped, note: '' };
}
/* ---------- "cards file": every card kind in one .txt ----------
   #Set name
   Q: question | correct | wrong 1 | wrong 2 | wrong 3     multiple choice
   F: front | back                                          flip card
   R: front | back                                          flip card, both directions
   T: question | answer                                     type-in answer
   C: The {{c1::heart}} pumps {{c2::blood}}.                cloze (one card per number)
   O: https://…/diagram.png | hide-one | Wing@0.1,0.2,0.3,0.2 | Fin@0.6,0.5,0.3,0.3     image occlusion (x,y,w,h as 0..1)
*/
const KLINE = /^\s*([QFRTCO]):\s?(.*)$/;
export const isCardsFile = (raw: string) => raw.split(/\r?\n/).some(l => KLINE.test(l)) && !/^\s*question\s*[,;\t]/i.test(raw);
const encTok = (t: string) => t.replace(/<!--[^>]*-->/g, m => m.replace(/\|/g, SEP));

export function importCardsFile(file: string, raw: string, defSet: string): ImportResult {
  let set = (defSet || file.replace(/\.[^.]+$/, '') || 'Imported').replace(/[\r\n#|]/g, ' ').trim() || 'Imported';
  const cards: { s: string; q: string; c: string; k: Kind; w?: string[]; sib?: string[] }[] = []; let skipped = 0;
  for (const line of raw.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s*#/.test(line) && !KLINE.test(line)) { const n = line.replace(/^\s*#/, '').trim(); if (n) set = n.replace(/[|]/g, ' '); continue; }
    const m = KLINE.exec(line); if (!m) { skipped++; continue; }
    const k = m[1], f = m[2].split('|').map(x => x.trim());
    if (k === 'C') { const t = m[2].trim(); const ns = clozeNums(t); if (!ns.length) { skipped++; continue; }
      ns.forEach(n => cards.push({ s: set, q: t, c: '', k: 'c', sib: [String(n)] })); continue; }
    if (k === 'O') {
      const src = f[0], mode = /all/i.test(f[1] || '') ? 'a' : 'o';
      const boxes = f.slice(2).map(x => { const i = x.lastIndexOf('@'); const n = x.slice(i + 1).split(',').map(Number); return i > 0 && n.length === 4 && n.every(isFinite) ? { t: x.slice(0, i).trim(), x: n[0], y: n[1], w: n[2], h: n[3] } : null; }).filter(Boolean) as any[];
      if (!/^(https?:|data:image\/)/.test(src) || !boxes.length) { skipped++; continue; }
      const bx = boxes.map(({ x, y, w, h }) => ({ x, y, w, h }));
      boxes.forEach((b, i) => cards.push({ s: set, k: 'o', c: b.t, q: withImg('What is hidden under the box?', { src, pins: [] }) + occToken({ mode, idx: i, boxes: bx }), sib: boxes.filter((_, j) => j !== i).map(x => x.t) }));
      continue;
    }
    if (k === 'Q') { if (f.length < 3 || !f[0] || !f[1] || !f[2]) { skipped++; continue; } cards.push({ s: set, q: f[0], c: f[1], k: 'mc', w: f.slice(2, 5).filter(Boolean) }); continue; }
    if (!f[0] || !f[1]) { skipped++; continue; }
    const kk: Kind = k === 'T' ? 't' : 'f';
    cards.push({ s: set, q: f[0], c: f[1], k: kk });
    if (k === 'R') cards.push({ s: set, q: f[1], c: f[0], k: 'f' });
  }
  const pool = new Map<string, { c: string }[]>();
  const answer = (c: typeof cards[number]) => c.k === 'c' ? (() => { const n = +c.sib![0]; return [...c.q.matchAll(/\{\{c(\d+)::([\s\S]*?)(?:::[^}]*?)?\}\}/g)].filter(x => +x[1] === n).map(x => x[2]).join(', '); })() : c.c;
  cards.forEach(c => { c.c = answer(c); const a = pool.get(c.s) || []; a.push({ c: c.c }); pool.set(c.s, a); });
  const bySet = new Map<string, string[]>();
  cards.forEach(c => {
    let q = c.q;
    if (c.k === 'c') { const n = +c.sib![0]; q = c.q.replace(/\{\{c(\d+)::([\s\S]*?)(::[^}]*?)?\}\}/g, (_m, k, a, h) => (+k === n ? '{{c' + n + '::' + a + (h || '') + '}}' : a)); }
    const w = c.w?.length ? c.w : distractors(c.c, [...(c.sib || []).filter(x => c.k === 'o').map(x => ({ c: x })), ...(pool.get(c.s) || [])]);
    const line = [encTok(c.k === 'mc' ? q : withKind(q, c.k)), c.c, ...[...w, w[0], w[0], w[0]].slice(0, 3)].map(x => x.replace(/[\r\n]+/g, ' ')).join('|');
    (bySet.get(c.s) || bySet.set(c.s, []).get(c.s)!).push(line);
  });
  return { text: [...bySet].map(([s, a]) => '#' + s + '\n' + a.join('\n')).join('\n'), n: cards.length, borrowed: true, skipped, note: cards.length ? '' : 'No cards found. Lines look like  F: front | back' };
}
const pipeFree = (x: string) => x.replace(/\|/g, '/');
/** Every card of the library as a cards file (round-trips with importCardsFile). */
export function cardsToCardsFile(cards: Card[]): string {
  const bySet = new Map<string, Card[]>(); cards.forEach(c => (bySet.get(c.s) || bySet.set(c.s, []).get(c.s)!).push(c));
  const out: string[] = ['# Flight Recall cards file. Q: multiple choice, F: flip, T: type-in, C: cloze, O: image occlusion'];
  bySet.forEach((list, s) => {
    out.push('', '#' + s); const done = new Set<string>();
    list.forEach(c => {
      const k = kindOf(c.q), raw = stripKind(c.q).replace(/<!--(?:img|occ|src):[^>]*-->/g, '').trim();
      if (k === 'o') {
        const oc = parseOcc(c.q), im = parseImg(c.q); if (!oc || !im) return;
        const key = im.src + JSON.stringify(oc.boxes); if (done.has(key)) return; done.add(key);
        const lab = oc.boxes.map((_, i) => list.find(x => { const o = parseOcc(x.q); return o && parseImg(x.q)?.src === im.src && JSON.stringify(o.boxes) === JSON.stringify(oc.boxes) && o.idx === i; })?.c || '?');
        out.push('O: ' + [im.src, oc.mode === 'a' ? 'hide-all' : 'hide-one', ...oc.boxes.map((b, i) => pipeFree(html2txt(lab[i])) + '@' + [b.x, b.y, b.w, b.h].map(n => +n.toFixed(3)).join(','))].join(' | '));
      } else if (k === 'c') out.push('C: ' + pipeFree(raw));
      else if (k === 'f' || k === 't') out.push((k === 't' ? 'T: ' : 'F: ') + pipeFree(html2txt(raw)) + ' | ' + pipeFree(html2txt(c.c)));
      else out.push('Q: ' + [html2txt(qText(c.q)), html2txt(c.c), ...[...new Set(c.w.map(html2txt))].slice(0, 5)].map(pipeFree).join(' | '));
    });
  });
  return out.join('\n') + '\n';
}
export const downloadText = (name: string, text: string, type = 'text/plain') => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
