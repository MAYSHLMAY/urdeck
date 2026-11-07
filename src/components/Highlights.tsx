'use client';
import { useEffect, useRef, useState } from 'react';
import { useEngine, Ic } from './ui';

export const PINSVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M14.5 2.5l7 7-2.2.9-3.6 3.6.6 4.2-1.6 1.6-4-4-5.8 5.8-1.2-1.2 5.8-5.8-4-4 1.6-1.6 4.2.6 3.6-3.6z"/></svg>';

/** Put the question HTML into `el` and wrap each saved highlight in <mark>, with a pin where there is a note. */
export function renderQuestion(el: HTMLElement, html: string, notes: any[]) {
  el.innerHTML = html;
  (notes || []).slice().sort((a, b) => a.s - b.s).forEach(hl => {
    let pos = 0, last: HTMLElement | null = null;
    const ns: Text[] = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n: Node | null;
    while ((n = w.nextNode())) ns.push(n as Text);
    ns.forEach(n => {
      const len = n.nodeValue!.length, s = Math.max(hl.s, pos), e = Math.min(hl.e, pos + len);
      if (s < e) {
        const mid = n.splitText(s - pos); mid.splitText(e - s);
        const m = document.createElement('mark'); m.className = 'hlm ' + hl.c; m.dataset.h = hl.id;
        mid.parentNode!.insertBefore(m, mid); m.appendChild(mid); last = m;
      }
      pos += len;
    });
    if (last && hl.n) {
      const pn = document.createElement('span'); pn.className = 'pin'; pn.dataset.h = hl.id; pn.innerHTML = PINSVG;
      (last as HTMLElement).after(pn);
    }
  });
}

const qEl = () => document.querySelector('#stage h2.q') as HTMLElement | null;

/** Floating colour bar (when text is selected) and the note pop-up. Notes are personal and live on this device. */
export function HighlightTools() {
  const e = useEngine();
  const hsel = useRef<{ s: number; e: number; t: string } | null>(null);
  const [bar, setBar] = useState<{ top: number; left: number } | null>(null);
  const [note, setNote] = useState<{ id: string; top: number; left: number; text: string; color: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef(note); noteRef.current = note;

  const bump = () => { e.saveNotes(); e.notesVer = (e.notesVer || 0) + 1; e.emit(); };
  const find = (hid: string) => { const id = e.cur && e.cur.id, l = (e.NOTES[id!] || []).find((x: any) => x.id === hid); return l ? { id: id!, l } : null; };

  useEffect(() => {
    let t: any;
    const selCheck = () => {
      const sel = getSelection(), el = qEl();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !el) { hsel.current = null; setBar(null); return; }
      const r = sel.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) { hsel.current = null; setBar(null); return; }
      const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
      const s = pre.toString().length, tx = r.toString(), en = s + tx.length;
      if (!tx.trim()) { hsel.current = null; setBar(null); return; }
      hsel.current = { s, e: en, t: tx.slice(0, 80) };
      const rc = r.getBoundingClientRect();
      setBar({ top: Math.min(innerHeight - 52, rc.bottom + 10), left: Math.max(8, Math.min(innerWidth - 190, rc.left + rc.width / 2 - 95)) });
    };
    const onSel = () => { clearTimeout(t); t = setTimeout(selCheck, 120); };
    document.addEventListener('selectionchange', onSel);
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest('#stage .hlm, #stage .pin') as HTMLElement | null;
      if (el && el.dataset.h) { ev.preventDefault(); ev.stopPropagation(); if (noteRef.current) closeNote(true); openNote(el.dataset.h); }
    };
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (noteRef.current && !t.closest('#npop') && !t.closest('.hlm,.pin')) closeNote(true);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('selectionchange', onSel); document.removeEventListener('click', onClick, true); document.removeEventListener('pointerdown', onDown); };
    // eslint-disable-next-line
  }, []);

  function addHl(c: string, withNote: boolean) {
    const h = hsel.current; if (!h || !e.cur) return;
    const id = e.cur.id, hl = { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), s: h.s, e: h.e, c, t: h.t, n: '' };
    (e.NOTES[id] = e.NOTES[id] || []).push(hl);
    hsel.current = null; getSelection()?.removeAllRanges(); setBar(null); bump();
    if (withNote) setTimeout(() => openNote(hl.id), 30);
  }
  function openNote(hid: string) {
    const f = find(hid); if (!f) return;
    const el = qEl(); if (!el) return;
    const t = el.querySelector('.hlm[data-h="' + hid + '"]') as HTMLElement | null, rc = (t || el).getBoundingClientRect();
    setNote({ id: hid, top: Math.min(innerHeight - 190, rc.bottom + 8), left: Math.max(8, Math.min(innerWidth - 260, rc.left)), text: f.l.n || '', color: f.l.c });
    setTimeout(() => ta.current && ta.current.focus(), 30);
  }
  function closeNote(save: boolean) {
    const n = noteRef.current; if (!n) return;
    const f = find(n.id);
    if (f && save) { f.l.n = (ta.current ? ta.current.value : n.text).trim(); bump(); }
    setNote(null);
  }
  function delNote() {
    const n = note; if (!n) return; const f = find(n.id);
    if (f) { e.NOTES[f.id] = e.NOTES[f.id].filter((x: any) => x.id !== n.id); if (!e.NOTES[f.id].length) delete e.NOTES[f.id]; bump(); }
    setNote(null);
  }
  function recolor(c: string) {
    const n = note; if (!n) return; const f = find(n.id); if (!f) return; f.l.c = c; bump(); setNote({ ...n, color: c });
  }

  return (
    <>
      <div className={'hbar' + (bar ? ' on' : '')} id="hbar" style={bar ? { top: bar.top, left: bar.left } : undefined}
        onPointerDown={ev => ev.preventDefault()} onMouseDown={ev => ev.preventDefault()}>
        {['y', 'g', 'p', 'b'].map(c => <button key={c} className={c} data-c={c} aria-label={c} onClick={() => addHl(c, false)} />)}
        <button className="pn" aria-label="Add note" onClick={() => addHl('y', true)}><Ic n="note" /></button>
      </div>
      <div className={'pop2' + (note ? ' on' : '')} id="npop" style={note ? { top: note.top, left: note.left } : undefined}>
        <div className="cl">
          {['y', 'g', 'p', 'b'].map(c => <button key={c} className={c + (note && note.color === c ? ' cur' : '')} onClick={() => recolor(c)} />)}
          <span className="sp" />
        </div>
        <textarea ref={ta} key={note ? note.id : 'none'} defaultValue={note ? note.text : ''} placeholder="Short note…" maxLength={400} />
        <div className="rw"><button onClick={delNote}>Remove</button><button className="sv" onClick={() => closeNote(true)}>Save</button></div>
      </div>
    </>
  );
}
