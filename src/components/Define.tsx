'use client';
import { useEffect, useState } from 'react';
import { define, DictError, type DefResult } from '@/lib/dict';
import { Ic } from './ui';

export interface DefReq { word: string; before: string; after: string; rect: { left: number; top: number; bottom: number; width: number } }

/** The word under a click/tap, plus the text around it from the same page (used to pick the right meaning). */
export function wordAt(x: number, y: number): DefReq | null {
  const d: any = document;
  let node: Node | null = null, off = 0;
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  if (!node || node.nodeType !== 3) return null;
  const el = node.parentElement, tl = el && el.closest('.textLayer'); if (!el || !tl) return null;
  const t = node.textContent || '', W = /[A-Za-zÀ-ɏ'’-]/;
  let a = Math.min(off, t.length), b = a;
  while (a > 0 && W.test(t[a - 1])) a--; while (b < t.length && W.test(t[b])) b++;
  const word = t.slice(a, b).replace(/^['’-]+|['’-]+$/g, ''); if (word.length < 2) return null;
  const range = document.createRange(); range.setStart(node, a); range.setEnd(node, b);
  const rc = range.getBoundingClientRect();
  if (x < rc.left - 3 || x > rc.right + 3 || y < rc.top - 3 || y > rc.bottom + 3) return null;
  const w = document.createTreeWalker(tl, NodeFilter.SHOW_TEXT); let pos = 0, at = -1, n: Node | null;
  const all: string[] = [];
  while ((n = w.nextNode())) { if (n === node) at = pos + a; const s = n.textContent || ''; all.push(s); pos += s.length + 1; }
  const full = all.join(' ');
  return { word, before: at >= 0 ? full.slice(Math.max(0, at - 400), at) : '', after: at >= 0 ? full.slice(at + word.length, at + word.length + 400) : '', rect: { left: rc.left, top: rc.top, bottom: rc.bottom, width: rc.width } };
}
/** Same, for text that is already selected (find it in its page text). */
export function selectionReq(text: string, page: number): DefReq | null {
  const tl = document.querySelector(`.pdf-page[data-page="${page}"] .textLayer`); if (!tl) return null;
  const g = getSelection(); const rc = g && g.rangeCount ? g.getRangeAt(0).getBoundingClientRect() : null;
  const full = (tl.textContent || '').replace(/\s+/g, ' '), t = text.replace(/\s+/g, ' ').trim(), at = full.indexOf(t);
  const words = t.match(/[A-Za-zÀ-ɏ'’-]{2,}/g) || []; if (!words.length) return null;
  const word = words.length === 1 ? words[0] : words.slice().sort((p, q) => q.length - p.length)[0];
  const wi = at >= 0 ? at + t.indexOf(word) : -1;
  return { word, before: wi >= 0 ? full.slice(Math.max(0, wi - 400), wi) : '', after: wi >= 0 ? full.slice(wi + word.length, wi + word.length + 400) : '', rect: rc ? { left: rc.left, top: rc.top, bottom: rc.bottom, width: rc.width } : { left: 40, top: 120, bottom: 140, width: 10 } };
}

export function DefineCard({ req, hint, onClose }: { req: DefReq | null; hint: string; onClose: () => void }) {
  const [res, setRes] = useState<DefResult | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [slow, setSlow] = useState(false), [tries, setTries] = useState(0), [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!req) return; let dead = false; setRes(null); setErr(''); setBusy(true); setSlow(false);
    const st = setTimeout(() => { if (!dead) setSlow(true); }, 3500);
    define(req.word, req.before, req.after, hint).then(r => { if (!dead) setRes(r); }, e => { if (!dead) setErr(e instanceof DictError ? e.message : 'Could not look that up.'); }).finally(() => { clearTimeout(st); if (!dead) setBusy(false); });
    return () => { dead = true; clearTimeout(st); };
  }, [req, hint, tries]);
  useEffect(() => {
    if (!req) return;
    const w = Math.min(340, innerWidth * 0.94), r = req.rect;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    const below = r.bottom + 14 + 200 < innerHeight; setPos({ x, y: below ? r.bottom + 10 : Math.max(8, r.top - 10 - 200) });
  }, [req, res, err]);
  useEffect(() => {
    if (!req) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement)?.closest?.('.defcard')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', esc, true);
    const sc = document.querySelector('.pdf-scroll'); sc?.addEventListener('scroll', onClose as any, { passive: true, once: true });
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); sc?.removeEventListener('scroll', onClose as any); };
  }, [req, onClose]);
  if (!req || !pos) return null;
  const best = res?.senses[0], more = res?.senses.slice(1, 6) || [];
  return (
    <div className="defcard" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={'Definition of ' + req.word}>
      <button className="x" onClick={onClose} aria-label="Close"><Ic n="close" /></button>
      <h4>{res ? res.word : req.word}{res?.phonetic && <span className="ph">{res.phonetic}</span>}
        {res?.audio && <button className="ghost" style={{ padding: '2px 8px' }} onClick={() => new Audio(res.audio).play().catch(() => { })} aria-label="Hear it"><Ic n="play" /></button>}</h4>
      {busy && <p className="ex">{slow ? 'Slow connection, still trying…' : 'Looking it up…'}</p>}
      {err && <p className="ex">{err} <button className="ghost" style={{ padding: '2px 10px' }} onClick={() => setTries(n => n + 1)}>Try again</button></p>}
      {best && <>
        <span className="bf">Best fit here</span>
        <p><span className="pos">{best.pos}</span> {best.def}</p>
        {best.example && <p className="ex">“{best.example}”</p>}
        {more.length > 0 && <details><summary>{more.length} other meaning{more.length > 1 ? 's' : ''}</summary>
          {more.map((s, i) => <p key={i}><span className="pos">{s.pos}</span> {s.def}</p>)}</details>}
        {res!.word !== res!.asked && <p className="ex">Showing “{res!.word}” for “{res!.asked}”.</p>}
      </>}
      <div className="ft">Wiktionary / online dictionary. Only the word is sent, never your text. Words you have looked up work offline afterwards.</div>
    </div>
  );
}
