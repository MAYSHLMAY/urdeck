import { fnv } from './fnv';
import type { Card, QCard, RawCard } from './types';

const JUNK = /\[span_\d+\]\((?:start|end)_span\)|\[cite(?:_start|_end)?[:\s][^\]]*\]|:contentReference\[[^\]]*\]\{[^}]*\}/g;

export const clean = (t: string) => {
  t = String(t);
  const u = t.replace(JUNK, '');
  return u === t ? t : u.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
};

const mk1 = (t: string) =>
  clean(t)
    .replace(/\bCLmax\b/g, 'C<sub>L max</sub>')
    .replace(/\bCL\b/g, 'C<sub>L</sub>')
    .replace(/\bCl\b/g, 'C<sub>l</sub>')
    .replace(/α0/g, 'α<sub>0</sub>')
    .replace(/αi/g, 'α<sub>i</sub>');
/** Like mk, but leaves a card picture token (<!--img:...-->) untouched. */
export const mk = (t: string) => String(t).split(/(<!--(?:img|k|occ|src):[^>]*-->)/).map(x => /^<!--(?:img|k|occ|src):/.test(x) ? x : mk1(x)).join('');

/** Split a section title into display title (t), number (n) and group key (g). */
export function meta(s: string, p?: number | boolean) {
  let t = s, n = '';
  if (/^Hard/i.test(s)) t = s.replace(/^Hard:\s*/i, '');
  else if (p) {
    t = s.replace(/^Past Exam\s*·\s*/i, '');
    const m = t.match(/^(\d+(?:\.\d+)*(?:\s*&\s*\d+(?:\.\d+)*)?)\s+(.*)$/);
    if (m) { n = m[1]; t = m[2]; }
  } else {
    const m = s.match(/^(.*?)\s*\(([\d.]+(?:\s+(?:and|to|&)\s+[\d.]+)*)\)\s*$/);
    if (m) {
      t = m[1]; n = m[2];
      t = t.replace(/^[\d.]+\s+/, '') || m[1];
    } else {
      const m2 = s.match(/^([\d.]+)\s+(.*)$/);
      if (m2) { n = m2[1]; t = m2[2]; }
    }
  }
  let g: string;
  if (/^Hard/i.test(s)) g = 'hard';
  else if (p) g = 'pe';
  else { const m = n.match(/^(\d+\.\d+)/); g = m ? m[1] : 'other'; }
  if (!t) t = s;
  return { t, n, g };
}

/**
 * Text format:  "#2.5 Title" line, then one question per line:
 *   question|correct|wrong1|wrong2|wrong3
 */
export function parseRaw(name: string, text: string) {
  const cards: RawCard[] = [], errs: string[] = [];
  let sec = '';
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    if (line.startsWith('#')) { sec = line.replace(/^#+/, '').trim(); return; }
    const p = line.replace(/^=/, '').split('|').map(x => clean(x).trim().replace(/<!--(?:img|k|occ|src):[^>]*-->/g, m => m.replace(/¦/g, '|')));
    if (p.length !== 5) { errs.push(`${name}:${i + 1}: expected 5 parts, found ${p.length}`); return; }
    if (p.some(x => !x)) { errs.push(`${name}:${i + 1}: empty part`); return; }
    if (!sec) { errs.push(`${name}:${i + 1}: question before any #Section title`); return; }
    const c: RawCard = { s: sec, q: p[0], c: p[1], w: p.slice(2) };
    if (/^past exam/i.test(sec)) c.p = 1;
    cards.push(c);
  });
  return { cards, errs };
}

/** Raw card -> stored card (stable id from the raw question text, subscripts applied). */
export const cook = (r: RawCard): Card => {
  const c: Card = { id: fnv(r.q), s: r.s, q: mk(r.q), c: mk(r.c), w: r.w.map(mk) };
  if (r.p || /^past exam/i.test(r.s)) c.p = 1;
  return c;
};

export function parsePack(name: string, text: string) {
  const r = parseRaw(name, text);
  return { cards: r.cards.map(cook), errs: r.errs };
}

/** Prepare a card for the study engine (clean text + section meta). Idempotent. */
export function ready(c: Card): QCard {
  const q: any = c;
  if (q.__r) return q;
  q.q = clean(q.q); q.c = clean(q.c); q.w = (q.w || []).map(clean);
  Object.assign(q, meta(q.s, q.p));
  Object.defineProperty(q, '__r', { value: 1, enumerable: false });
  return q;
}
