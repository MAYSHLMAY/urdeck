/* Import / export: CSV (this app), Anki "notes as text" and Quizlet-style two-column text. */
import { parseImg, qText, withImg, type Pin } from './cardimg';
import type { Card } from './types';

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
export function importToPack(file: string, raw: string, defSet: string): ImportResult {
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
export const downloadText = (name: string, text: string, type = 'text/plain') => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
