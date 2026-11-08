'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isOwner } from '@/lib/api';
import { SelMenu } from './SelMenu';
import { DefineCard, wordAt, selectionReq, type DefReq } from './Define';
import { notes as notesStore, NOTE_COLORS, NOTE_TAGS, type LocalNote, type NoteColor } from '@/lib/notes';
import { findPhrase, getIndex, indexProgress, type Hit } from '@/lib/pdfindex';
import type { QCard } from '@/lib/types';
import { PdfViewer, type PdfViewerHandle } from './PdfViewer';
import { CategoryPool, PdfChooserModal } from './CategoryPool';
import { useNoteCapture, useNotesStore, useRefs } from './refHooks';
import { Ic } from './ui';

const boxOf = (rs: { x: number; y: number; width: number; height: number }[]) => {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.width)), y1 = Math.max(...rs.map(r => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const lsGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const PAGE_NOTE = '(page note)';
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function Dots({ value, onPick }: { value: NoteColor; onPick: (c: NoteColor) => void }) {
  return <span className="dots" role="radiogroup" aria-label="Highlight colour">{NOTE_COLORS.map(c => (
    <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className={'cdot c-' + c + (value === c ? ' on' : '')} onClick={() => onPick(c)} />
  ))}</span>;
}

/**
 * The reader. A resizable side panel on wide screens and a resizable bottom sheet on phones; it can also fill the whole page.
 * It keeps its own state outside the quiz card, so opening, resizing, hiding or switching PDFs never resets the question.
 * Note tools sit in a slim docked rail under the pages (never over them): select text, then press H (highlight) or N (note).
 */
export function ReferenceDrawer({ q }: { q: QCard | null }) {
  const R = useRefs(), N = useNotesStore();
  const [mounted, setMounted] = useState(false);
  const viewer = useRef<PdfViewerHandle>(null), body = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState({ n: 1, total: 0 });
  const [zoom, setZoom] = useState(1);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean }>({ t: '' });
  const [noteEdit, setNoteEdit] = useState(false), [noteText, setNoteText] = useState('');
  const [color, setColorS] = useState<NoteColor>('yellow'), [marker, setMarkerS] = useState(false), [night, setNightS] = useState(false), [full, setFull] = useState(false);
  const [pop, setPop] = useState<string | null>(null);
  /* in-PDF search */
  const [findOn, setFindOn] = useState(false), [findQ, setFindQ] = useState(''), [finds, setFinds] = useState<Hit[]>([]), [findIdx, setFindIdx] = useState(-1), [finding, setFinding] = useState(false);
  /* notes tab filters */
  const [scope, setScope] = useState<'pdf' | 'all' | 'card'>('pdf'), [nq, setNq] = useState(''), [nColor, setNColor] = useState<NoteColor | ''>(''), [onlyPin, setOnlyPin] = useState(false);
  const own = isOwner();
  /* floating selection menu + dictionary */
  const [menu, setMenu] = useState(false), [defReq, setDefReq] = useState<DefReq | null>(null);
  const [dictOn, setDictOn] = useState(false), [coarse, setCoarse] = useState(false);
  const ctxWant = useRef(false);
  useEffect(() => { try { setDictOn(localStorage.getItem('fr-dict-v1') === '1'); } catch { /* off */ } setCoarse(matchMedia('(pointer: coarse)').matches); }, []);
  const flipDict = () => { const v = !dictOn; setDictOn(v); setDefReq(null); try { localStorage.setItem('fr-dict-v1', v ? '1' : '0'); } catch { /* ignore */ } flash(v ? 'Dictionary on: tap any word to see what it means here.' : 'Dictionary off.'); };

  const pdf = R.pdf(R.pdfId), url = R.url(pdf);
  const qid = q ? String(q.id) : undefined;
  const cap = useNoteCapture(body, pdf ? pdf.id : null, R.open && R.view === 'viewer', { on: marker, opts: { color, qid } });
  const forPdf = useMemo(() => N.list(pdf?.id || '__none__'), [N.ver, pdf?.id]); // eslint-disable-line
  const list = useMemo(() => {
    let a = N.list(scope === 'pdf' ? pdf?.id || '__none__' : null);
    if (scope === 'card') a = a.filter(n => qid && n.qid === qid);
    if (nColor) a = a.filter(n => (n.color || 'yellow') === nColor);
    if (onlyPin) a = a.filter(n => n.pin);
    const t = nq.trim().toLowerCase();
    if (t) a = a.filter(n => (n.selected_text + ' ' + n.note_content + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(t));
    return a.slice().sort((x, y) => (y.pin ? 1 : 0) - (x.pin ? 1 : 0));
  }, [N.ver, pdf?.id, scope, nq, nColor, onlyPin, qid]); // eslint-disable-line
  const popNote = pop ? N.list(null).find(n => n.id === pop) || null : null;

  useEffect(() => {
    setColorS(lsGet('fr-note-color', 'yellow') as NoteColor); setMarkerS(lsGet('fr-marker', '0') === '1'); setNightS(lsGet('fr-pdf-night', '0') === '1');
    const root = document.documentElement, w = +lsGet('fr-ref-w', '0'), h = +lsGet('fr-ref-h', '0');
    if (w >= 340) root.style.setProperty('--refw', Math.min(w, window.innerWidth * 0.85) + 'px');
    if (h >= 220) root.style.setProperty('--refh', Math.min(h, window.innerHeight * 0.92) + 'px');
  }, []);
  const setColor = (c: NoteColor) => { setColorS(c); lsSet('fr-note-color', c); };
  const setMarker = (v: boolean) => { setMarkerS(v); lsSet('fr-marker', v ? '1' : '0'); };
  const setNight = (v: boolean) => { setNightS(v); lsSet('fr-pdf-night', v ? '1' : '0'); };

  /* first open: mount the panel and start the local note store */
  useEffect(() => { if (R.open && !mounted) { setMounted(true); notesStore().start(); } }, [R.open, mounted]);
  /* layout classes on <body> so the quiz makes room (or the reader covers the page in full mode) */
  useEffect(() => {
    document.body.classList.toggle('ref-open', R.open); document.body.classList.toggle('ref-full', R.open && full);
    return () => { document.body.classList.remove('ref-open', 'ref-full'); };
  }, [R.open, full]);
  /* the card changed while the panel is open: re-run auto-matching */
  useEffect(() => { if (R.open) R.resolve(q); /* eslint-disable-next-line */ }, [q?.id]);
  /* when the reader opens, put keyboard focus on the pages so arrows / space / page keys scroll them */
  useEffect(() => { if (R.open && R.view === 'viewer') { const t = setTimeout(() => viewer.current?.scroller()?.focus({ preventScroll: true }), 320); return () => clearTimeout(t); } }, [R.open, R.view, pdf?.id]);
  useEffect(() => { setMsg({ t: '' }); setNoteEdit(false); setNoteText(''); setFinds([]); setFindIdx(-1); setPop(null); }, [pdf?.id]);

  /* search inside the PDF: uses the background text index (built once, then instant) */
  useEffect(() => {
    if (!findOn || !pdf || !url || findQ.trim().length < 2) { setFinds([]); setFindIdx(-1); setFinding(false); return; }
    let dead = false; setFinding(true);
    const t = setTimeout(async () => {
      try {
        const ix = await getIndex(pdf.file_path, url); if (dead) return;
        const h = findPhrase(ix, findQ); setFinds(h); setFinding(false);
        if (h.length) { setFindIdx(0); viewer.current?.scrollToPage(h[0].page, h[0].box); } else setFindIdx(-1);
      } catch { if (!dead) { setFinding(false); setMsg({ t: 'Could not read the text of this PDF (it may be a scan).', bad: true }); } }
    }, 220);
    return () => { dead = true; clearTimeout(t); };
  }, [findQ, findOn, pdf?.id, url]); // eslint-disable-line
  const stepFind = (d: number) => { if (!finds.length) return; const k = (findIdx + d + finds.length) % finds.length; setFindIdx(k); viewer.current?.scrollToPage(finds[k].page, finds[k].box); };

  /* the floating menu: phones open it when the selection settles, mouse users right-click */
  const pend = cap.pending, selKey = pend ? pend.page + '|' + pend.text : '';
  useEffect(() => {
    setMenu(false);
    if (!pend || (!coarse && !ctxWant.current) || marker) return;
    const t = setTimeout(() => { setMenu(true); ctxWant.current = false; }, coarse ? 380 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [selKey, coarse, marker]);
  useEffect(() => {
    const el = body.current; if (!el) return;
    // remember the selection at the moment of the right mouse-down, and stop the browser from re-selecting the word under it
    let saved: Range | null = null;
    const md = (ev: MouseEvent) => {
      if (ev.button !== 2) return;
      const t = ev.target as HTMLElement; if (!t.closest || !t.closest('.pdf-scroll .textLayer')) return;
      const g = getSelection(); saved = g && !g.isCollapsed && g.rangeCount > 0 ? g.getRangeAt(0).cloneRange() : null;
      ev.preventDefault();
    };
    const ctx = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (!t.closest || t.closest('.selmenu') || !t.closest('.pdf-scroll .textLayer')) return;
      ev.preventDefault();
      const g = getSelection(), cur = saved || (g && !g.isCollapsed && g.rangeCount > 0 ? g.getRangeAt(0) : null), ps = cur ? Array.from(cur.getClientRects()).filter(r => r.width > 1) : [];
      // anywhere inside the selected area counts (including the gaps between its lines), not only exactly on a word
      const inside = ps.length > 0 && (ps.some(r => ev.clientX >= r.left - 3 && ev.clientX <= r.right + 3 && ev.clientY >= r.top - 3 && ev.clientY <= r.bottom + 3) || (ev.clientX >= Math.min(...ps.map(r => r.left)) - 3 && ev.clientX <= Math.max(...ps.map(r => r.right)) + 3 && ev.clientY >= Math.min(...ps.map(r => r.top)) - 3 && ev.clientY <= Math.max(...ps.map(r => r.bottom)) + 3));
      if (inside && cur && cmd.current.cap.recent()) { if (g && (g.isCollapsed || g.toString() !== cur.toString())) { g.removeAllRanges(); g.addRange(cur); } saved = null; setMenu(true); return; }
      saved = null;
      const d: any = document, r = d.caretRangeFromPoint ? d.caretRangeFromPoint(ev.clientX, ev.clientY) : null; if (!r || !g) return;
      ctxWant.current = true; g.removeAllRanges(); g.addRange(r); (g as any).modify?.('move', 'backward', 'word'); (g as any).modify?.('extend', 'forward', 'word');
    };
    const away = (ev: Event) => { if (!(ev.target as HTMLElement)?.closest?.('.selmenu')) setMenu(false); };
    el.addEventListener('mousedown', md, true); el.addEventListener('contextmenu', ctx); document.addEventListener('pointerdown', away, true);
    return () => { el.removeEventListener('mousedown', md, true); el.removeEventListener('contextmenu', ctx); document.removeEventListener('pointerdown', away, true); };
  }, [mounted]);
  /* dictionary mode: click or tap a word */
  useEffect(() => {
    const el = body.current; if (!el || !dictOn || !R.open) return;
    const f = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement; if (!t.closest || !t.closest('.pdf-scroll .textLayer') || t.closest('.selmenu')) return;
      const g = getSelection(); if (g && !g.isCollapsed) return;
      const r = wordAt(ev.clientX, ev.clientY); if (r) setDefReq(r);
    };
    el.addEventListener('click', f); return () => el.removeEventListener('click', f);
  }, [dictOn, R.open, mounted]);

  /* ---- commands (like a browser PDF reader) ---- */
  const cmd = useRef<any>({}); cmd.current = { cap, color, qid, noteEdit, findOn, full, pop };
  useEffect(() => {
    if (!R.open) return;
    const f = (ev: KeyboardEvent) => {
      const c = cmd.current;
      if (ev.key === 'Escape') {
        if (document.querySelector('dialog[open]')) return;
        if (c.noteEdit) { setNoteEdit(false); return; }
        if (c.pop) { setPop(null); return; }
        if (c.cap.pending) { c.cap.dismiss(); return; }
        if (c.findOn) { setFindOn(false); return; }
        if (c.full) { setFull(false); return; }
        R.close(); return;
      }
      if (R.view !== 'viewer' || document.querySelector('dialog[open]')) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod) {
        if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); viewer.current?.zoomBy(1.2); }
        else if (ev.key === '-') { ev.preventDefault(); viewer.current?.zoomBy(1 / 1.2); }
        else if (ev.key === '0') { ev.preventDefault(); viewer.current?.fit(); }
        else if (ev.key.toLowerCase() === 'f') { ev.preventDefault(); setFindOn(true); }
        return;
      }
      if (ev.altKey || typing(ev.target)) return;
      const k = ev.key.toLowerCase();
      if (k === 'h') { ev.preventDefault(); doHighlight(); }
      else if (k === 'n') { ev.preventDefault(); openNote(); }
      else if (k === 'f') { ev.preventDefault(); setFull(v => !v); }
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
    // eslint-disable-next-line
  }, [R, R.open, R.view]);

  /* ---- resizing: drag the grip (or use arrow keys on it). The quiz re-flows live because only a CSS variable changes. ---- */
  function startResize(ev: React.PointerEvent<HTMLDivElement>) {
    ev.preventDefault();
    const el = ev.currentTarget, root = document.documentElement, wide = matchMedia('(min-width:900px)').matches;
    el.setPointerCapture(ev.pointerId); document.body.classList.add('ref-drag');
    const move = (m: PointerEvent) => {
      if (wide) root.style.setProperty('--refw', clamp(window.innerWidth - m.clientX, 340, window.innerWidth * 0.85) + 'px');
      else root.style.setProperty('--refh', clamp(window.innerHeight - m.clientY, 220, window.innerHeight * 0.92) + 'px');
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      document.body.classList.remove('ref-drag');
      const w = parseFloat(getComputedStyle(root).getPropertyValue('--refw')), h = parseFloat(getComputedStyle(root).getPropertyValue('--refh'));
      if (wide && w) lsSet('fr-ref-w', String(Math.round(w))); else if (h) lsSet('fr-ref-h', String(Math.round(h)));
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function gripKey(ev: React.KeyboardEvent) {
    const root = document.documentElement, wide = matchMedia('(min-width:900px)').matches, d = ev.shiftKey ? 80 : 30;
    const aside = (ev.currentTarget as HTMLElement).parentElement!, r = aside.getBoundingClientRect();
    if (wide && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) { ev.preventDefault(); const w = clamp(r.width + (ev.key === 'ArrowLeft' ? d : -d), 340, window.innerWidth * 0.85); root.style.setProperty('--refw', w + 'px'); lsSet('fr-ref-w', String(Math.round(w))); }
    if (!wide && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); const h = clamp(r.height + (ev.key === 'ArrowUp' ? d : -d), 220, window.innerHeight * 0.92); root.style.setProperty('--refh', h + 'px'); lsSet('fr-ref-h', String(Math.round(h))); }
  }
  function resetSize() { const root = document.documentElement; root.style.removeProperty('--refw'); root.style.removeProperty('--refh'); lsSet('fr-ref-w', '0'); lsSet('fr-ref-h', '0'); }

  if (!mounted) return null;

  const mapsHere = q && pdf ? R.mapsCached(String(q.id)).filter(m => m.pdf_id === pdf.id) : [];
  const auto = R.auto && q && R.auto.qid === String(q.id) ? R.auto : null;
  const status = N.status === 'offline' ? 'Offline: notes are saved on this device and will sync later.'
    : N.status === 'error' ? 'Cloud backup failed (' + N.lastError + '). Notes are safe on this device; retrying.'
    : N.status === 'syncing' ? 'Backing up…' : !N.syncOn ? 'Cloud backup is off. Notes stay on this device.' : N.pending ? N.pending + ' waiting to back up.' : 'All notes backed up.';
  const idxPct = pdf ? indexProgress.get(pdf.file_path) : undefined;
  const sel = cap.pending;

  async function mapHere() {
    if (!q || !pdf) return;
    const s = cap.recent();
    const pg = s ? s.page : viewer.current?.currentPage() || 1;
    try { await R.setMapping(String(q.id), pdf.id, pg, s ? s.box : null); flash(`Saved: this question now opens page ${pg}${s ? ' with the passage highlighted' : ''}.`); }
    catch (e: any) { setMsg({ t: e.message, bad: true }); }
  }
  function flash(t: string) { setMsg({ t }); setTimeout(() => setMsg(m => (m.t === t ? { t: '' } : m)), 2200); }
  function doHighlight() { if (!cmd.current.cap.pending) { flash('Select some text first, then press H.'); return; } const id = cmd.current.cap.save({ color: cmd.current.color, qid: cmd.current.qid }); if (id) { flash('Highlight saved.'); try { navigator.vibrate?.(12); } catch { /* ignore */ } } }
  function doStyle(style: 'ul' | 'st') { if (!cmd.current.cap.pending) return; const id = cmd.current.cap.save({ color: cmd.current.color, qid: cmd.current.qid, style }); if (id) { flash(style === 'ul' ? 'Underlined.' : 'Struck through.'); setMenu(false); } }
  function defineSel() { const s = cap.recent(); if (!s) return; const r = selectionReq(s.text, s.page); if (r) { setDefReq(r); setMenu(false); } }
  function findSel() { const s = cap.recent(); if (!s) return; setFindQ(s.text.split(' ').slice(0, 6).join(' ')); setFindOn(true); setMenu(false); }
  function openNote() { if (!cmd.current.cap.pending) { flash('Select some text first, then press N.'); return; } setPop(null); setNoteEdit(true); }
  function saveNote() {
    const id = cap.save({ note: noteText.trim(), color, qid });
    if (id) { setNoteEdit(false); setNoteText(''); flash('Note saved.'); }
  }
  function pageNote() {
    if (!pdf) return;
    const n = notesStore().add({ pdf_id: pdf.id, selected_text: PAGE_NOTE, page_number: viewer.current?.currentPage() || page.n || 1, rects: [], color, qid });
    R.setView('notes'); setScope('pdf'); setNq(''); setNColor(''); setOnlyPin(false);
    setTimeout(() => (document.getElementById('nt-' + n.id) as HTMLTextAreaElement | null)?.focus(), 80);
  }
  function exportNotes(copy: boolean) {
    const byPdf = new Map<string, LocalNote[]>(); list.forEach(n => byPdf.set(n.pdf_id, [...(byPdf.get(n.pdf_id) || []), n]));
    let md = '# Flight Recall notes\n';
    byPdf.forEach((ns, id) => {
      md += `\n## ${R.pdf(id)?.title || '(PDF removed)'}\n`;
      ns.forEach(n => {
        md += `\n- **p. ${n.page_number || '?'}**${n.pin ? ' (pinned)' : ''}${n.tags?.length ? ' · ' + n.tags.map(t => '#' + t).join(' ') : ''}\n`;
        if (n.selected_text !== PAGE_NOTE) md += `  > ${n.selected_text}\n`;
        if (n.note_content) md += `  ${n.note_content.replace(/\n/g, '\n  ')}\n`;
      });
    });
    if (copy) { navigator.clipboard?.writeText(md).then(() => flash('Notes copied.'), () => flash('Could not copy.')); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = 'flight-recall-notes.md';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  }
  const copySel = () => { const s = cap.recent(); if (s) navigator.clipboard?.writeText(s.text).then(() => flash('Copied.'), () => flash('Could not copy.')); };

  const tab = (v: 'viewer' | 'pools' | 'notes', label: string, n?: number) => (
    <button className={R.view === v ? 'on' : ''} onClick={() => R.setView(v)} aria-pressed={R.view === v}>{label}{n ? <small> {n}</small> : null}</button>
  );
  const nextMatch = (d: number) => auto && R.showMatch(auto.idx + d);
  const railText = cap.error ? { t: cap.error, bad: true } : msg.t ? msg : sel ? { t: '“' + (sel.text.length > 110 ? sel.text.slice(0, 110) + '…' : sel.text) + '”', bad: false } : null;
  const editing = noteEdit && !!sel, popping = !!popNote && !sel && !noteEdit;

  return (
    <aside className={'refd' + (R.open ? ' on' : '') + (full ? ' full' : '')} aria-hidden={!R.open} aria-label="Reference PDF">
      <div className="refgrip" role="separator" aria-orientation="vertical" aria-label="Resize reader (drag, or use the arrow keys). Double-click to reset." tabIndex={0}
        onPointerDown={startResize} onKeyDown={gripKey} onDoubleClick={resetSize}><i /></div>
      <header className="refh">
        <div className="reft">
          {tab('pools', 'Pools')}{tab('viewer', 'PDF')}{tab('notes', 'Notes', forPdf.length)}
        </div>
        <span className="refn" title={pdf?.title || ''}>{pdf ? pdf.title : 'No PDF selected'}</span>
        <button className="ico" onClick={() => setFull(f => !f)} aria-label={full ? 'Back to the cards' : 'Fill the whole page'} title={full ? 'Back to the cards (F)' : 'Fill the whole page (F)'}><Ic n={full ? 'collapse' : 'expand'} /></button>
        <button className="ico" onClick={() => R.close()} aria-label="Hide reference PDF" title="Hide (Esc)"><Ic n="close" /></button>
      </header>

      <div className="refb" ref={body}>
        {/* viewer stays mounted; only its visibility changes, so the scroll position is kept */}
        <section className={'refv' + (R.view === 'viewer' ? ' show' : '')}>
          {pdf && (
            <div className="vbar" role="toolbar" aria-label="PDF tools">
              <button className="vb" onClick={() => viewer.current?.zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out (Ctrl −)"><Ic n="minus" /></button>
              <button className="vb wide" onClick={() => viewer.current?.fit()} title="Fit to width (Ctrl 0)">{Math.round(zoom * 100)}%</button>
              <button className="vb" onClick={() => viewer.current?.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (Ctrl +)"><Ic n="plus" /></button>
              <span className="vsep" />
              <label className="pgbox" title="Go to page"><input type="number" min={1} max={page.total || undefined} value={page.n} aria-label="Page"
                onChange={ev => setPage(p => ({ ...p, n: +ev.target.value || 1 }))}
                onKeyDown={ev => { if (ev.key === 'Enter') { viewer.current?.scrollToPage(page.n); (ev.target as HTMLInputElement).blur(); viewer.current?.scroller()?.focus({ preventScroll: true }); } }} /><span>/ {page.total || '–'}</span></label>
              <span className="vsep" />
              <button className={'vb' + (findOn ? ' on' : '')} onClick={() => setFindOn(f => !f)} aria-label="Search in PDF" aria-pressed={findOn} title="Search (Ctrl F)"><Ic n="search" /></button>
              <button className={'vb' + (marker ? ' on' : '')} onClick={() => { setMarker(!marker); flash(!marker ? 'Marker on: whatever you select is highlighted automatically.' : 'Marker off.'); }} aria-label="Marker mode" aria-pressed={marker} title="Marker: highlight automatically as you select"><Ic n="marker" /></button>
              <button className={'vb' + (R.autoOn ? ' on' : '')} onClick={() => { R.setAutoOn(!R.autoOn); flash(!R.autoOn ? 'Auto-find on: the reader jumps to where each question is explained.' : 'Auto-find off: the reader stays where you are.'); }} aria-label="Auto-find" aria-pressed={R.autoOn} title={R.autoOn ? 'Auto-find is on (tap to turn off)' : 'Auto-find is off (tap to turn on)'}><Ic n="sparkle" /></button>
              <button className={'vb' + (dictOn ? ' on' : '')} onClick={flipDict} aria-label="Dictionary" aria-pressed={dictOn} title="Dictionary: tap a word to see its meaning (online)"><Ic n="book" /></button>
              <button className={'vb' + (night ? ' on' : '')} onClick={() => setNight(!night)} aria-label="Night mode" aria-pressed={night} title="Night mode"><Ic n="moon" /></button>
            </div>
          )}
          {pdf && findOn && (
            <div className="findbar">
              <input autoFocus type="search" value={findQ} placeholder="Search in this PDF" onChange={ev => setFindQ(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') stepFind(ev.shiftKey ? -1 : 1); }} />
              <span className="fc">{finding ? '…' : findQ.trim().length < 2 ? '' : finds.length ? `${findIdx + 1}/${finds.length}` : 'none'}</span>
              <button className="vb" onClick={() => stepFind(-1)} disabled={!finds.length} aria-label="Previous"><Ic n="chevL" /></button>
              <button className="vb" onClick={() => stepFind(1)} disabled={!finds.length} aria-label="Next"><Ic n="chevR" /></button>
              <button className="vb" onClick={() => setFindOn(false)} aria-label="Close search"><Ic n="close" /></button>
            </div>
          )}
          {pdf && (q || auto) && (auto || mapsHere.length > 0 || (own && q) || (!R.autoOn && q)) && (
            <div className="reftools">
              {!R.autoOn && q && <span className="chipx soft">Auto-find is off <button className="ghost" onClick={() => R.findNow()}>Find passage</button> <button className="ghost" onClick={() => R.setAutoOn(true)}>Turn on</button></span>}
              {auto && auto.state === 'working' && <span className="chipx soft"><Ic n="sparkle" /> Finding where this is explained…{idxPct !== undefined ? ` ${Math.round(idxPct * 100)}%` : ''}</span>}
              {auto && auto.state === 'ready' && auto.matches.length > 0 && (
                <span className="chipx"><Ic n="sparkle" /> Best match p. {auto.matches[auto.idx].page}
                  {auto.matches.length > 1 && <><button aria-label="Previous match" onClick={() => nextMatch(-1)}><Ic n="chevL" /></button>{auto.idx + 1}/{auto.matches.length}<button aria-label="Next match" onClick={() => nextMatch(1)}><Ic n="chevR" /></button></>}
                </span>
              )}
              {auto && auto.state === 'nomatch' && <span className="chipx soft">No exact passage found</span>}
              {mapsHere.length > 0 && <span className="chipx">Mapped: p. {mapsHere[0].page_number}{own && <button aria-label="Remove mapping" onClick={() => R.deleteMapping(String(q!.id), mapsHere[0].id).catch(e => setMsg({ t: e.message, bad: true }))}><Ic n="close" /></button>}</span>}
              {mapsHere.length > 0 && R.target && <button className="ghost" onClick={() => viewer.current?.scrollToPage(mapsHere[0].page_number, mapsHere[0].highlight_data)}>Jump to source</button>}
              {own && q && <button className="ghost" disabled={!!R.busy} onPointerDown={ev => ev.preventDefault()} onClick={mapHere} title="Select the passage first to highlight it"><Ic n="mappin" /> Map this question here</button>}
            </div>
          )}
          <PdfViewer ref={viewer} url={url} target={R.target} notes={forPdf} night={night}
            pending={sel ? { page: sel.page, rects: sel.rects } : null}
            finds={finds} findIdx={findIdx}
            onZoom={setZoom} onNote={id => { cap.dismiss(); setNoteEdit(false); setPop(id); }}
            onPage={(n, total) => setPage(p => (p.n === n && p.total === total ? p : { n, total }))} />
          {!pdf && R.view === 'viewer' && <div className="pdf-msg"><p>No document is open.</p><button className="solid" onClick={() => R.setView('pools')}>Choose from the pools</button></div>}

          {/* docked note tools: they take their own space under the pages, so they never cover what you are reading */}
          {pdf && (
            <div className="vdock">
              {editing && sel && (
                <div className="vedit">
                  <textarea autoFocus value={noteText} onChange={ev => setNoteText(ev.target.value)} placeholder="Write your note (optional). Ctrl+Enter saves."
                    maxLength={4000} onKeyDown={ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); saveNote(); } }} />
                  <div className="selrow"><button className="ghost" onClick={() => setNoteEdit(false)}>Cancel</button><button className="solid" onClick={saveNote}><Ic n="check" /> Save note</button></div>
                </div>
              )}
              {popping && popNote && (
                <div className="vedit">
                  {popNote.selected_text !== PAGE_NOTE && <p className="selq">“{popNote.selected_text.length > 140 ? popNote.selected_text.slice(0, 140) + '…' : popNote.selected_text}” <small>p. {popNote.page_number}</small></p>}
                  <textarea key={popNote.id + popNote.updated_at} defaultValue={popNote.note_content} placeholder="Add your own note…" maxLength={4000}
                    onBlur={ev => { if (ev.target.value !== popNote.note_content) notesStore().update(popNote.id, { note_content: ev.target.value }); }} />
                  <div className="selrow">
                    <Dots value={popNote.color || 'yellow'} onPick={c => notesStore().update(popNote.id, { color: c })} />
                    <button className={'ghost' + (popNote.pin ? ' on' : '')} onClick={() => notesStore().update(popNote.id, { pin: !popNote.pin })} aria-label="Pin"><Ic n="star" fill={!!popNote.pin} /></button>
                    <button className="ghost" onClick={() => { notesStore().remove(popNote.id); setPop(null); }} aria-label="Delete note"><Ic n="trash" /></button>
                    <button className="ghost" onClick={() => setPop(null)} aria-label="Close"><Ic n="close" /></button>
                  </div>
                </div>
              )}
              <div className={'vrail' + (sel ? ' hot' : '')} onPointerDown={ev => { if (!(ev.target as HTMLElement).closest('textarea,input')) ev.preventDefault(); }}>
                <Dots value={color} onPick={setColor} />
                <span className={'vtext' + (railText?.bad ? ' bad' : '')} role="status">
                  {railText ? railText.t : <><span className="h-kb">Select text, then press <kbd>H</kbd> to highlight or <kbd>N</kbd> for a note.</span><span className="h-tc">Select text, then tap Highlight or Note.</span></>}
                </span>
                <button className="vact" disabled={!sel} onClick={doHighlight} title="Highlight the selection (H)"><Ic n="marker" /><span>Highlight</span></button>
                <button className="vact" disabled={!sel} onClick={openNote} title="Add a note to the selection (N)"><Ic n="note" /><span>Note</span></button>
                <button className="vact icon" disabled={!sel} onClick={copySel} aria-label="Copy selection" title="Copy"><Ic n="copy" /></button>
              </div>
            </div>
          )}
        </section>

        <section className={'refp' + (R.view === 'pools' ? ' show' : '')}>
          <CategoryPool section={q ? q.s : null} />
        </section>

        <section className={'refp' + (R.view === 'notes' ? ' show' : '')}>
          <div className="notehead">
            <div className="nsearch">
              <input type="search" value={nq} onChange={ev => setNq(ev.target.value)} placeholder="Search your notes" />
              <button className="ghost" onClick={pageNote} disabled={!pdf} title="Add a note to the page you are on"><Ic n="plus" /> Page note</button>
            </div>
            <div className="nfilters">
              {(['pdf', 'all', ...(q ? ['card'] : [])] as ('pdf' | 'all' | 'card')[]).map(sc => (
                <button key={sc} className={'chip' + (scope === sc ? ' on' : '')} onClick={() => setScope(sc)}>{sc === 'pdf' ? 'This PDF' : sc === 'all' ? 'All PDFs' : 'This card'}</button>
              ))}
              <button className={'chip' + (onlyPin ? ' on' : '')} onClick={() => setOnlyPin(!onlyPin)}><Ic n="star" fill={onlyPin} /> Pinned</button>
              <span className="dots">{NOTE_COLORS.map(c => <button key={c} type="button" aria-label={'Only ' + c} className={'cdot sm c-' + c + (nColor === c ? ' on' : '')} onClick={() => setNColor(nColor === c ? '' : c)} />)}</span>
            </div>
            <div className="nfilters">
              <button className="ghost" onClick={() => exportNotes(true)} disabled={!list.length}>Copy all</button>
              <button className="ghost" onClick={() => exportNotes(false)} disabled={!list.length}>Download .md</button>
              <button className="ghost" onClick={() => N.syncNow()} disabled={!N.syncOn || N.status === 'syncing'}>Sync now</button>
            </div>
            <label className="pickr"><input type="checkbox" checked={N.syncOn} onChange={ev => N.setSync(ev.target.checked)} /><span>Back up notes to the cloud</span></label>
            <p className="n" role="status">{status}</p>
          </div>
          {list.map(n => <NoteRow key={n.id} n={n} showPdf={scope !== 'pdf'} onOpen={() => { const p = R.pdf(n.pdf_id); if (p) R.openPdf(p.id, n.page_number || 1, boxOf(n.rects)); }} gone={!R.pdf(n.pdf_id)} title={R.pdf(n.pdf_id)?.title || ''} />)}
          {!list.length && <p className="info">{N.list(null).length ? 'No notes match these filters.' : <>No notes yet. In the PDF, select some text and press <b>H</b> to highlight or <b>N</b> to write a note.</>}</p>}
        </section>
      </div>
      <PdfChooserModal />
    {typeof document !== 'undefined' && createPortal(<>
        {menu && sel && R.open && R.view === 'viewer' && !editing && <SelMenu sel={sel} coarse={coarse} color={color} onColor={setColor}
          acts={{ hl: () => { doHighlight(); setMenu(false); }, ul: () => doStyle('ul'), st: () => doStyle('st'), note: () => { setMenu(false); openNote(); }, copy: () => { copySel(); setMenu(false); }, define: defineSel, find: findSel }} />}
        <DefineCard req={defReq} hint={pdf?.title || ''} onClose={() => setDefReq(null)} />
      </>, document.body)}
      </aside>
  );
}

function NoteRow({ n, onOpen, gone, title, showPdf }: { n: LocalNote; onOpen: () => void; gone: boolean; title: string; showPdf: boolean }) {
  const st = notesStore(), tags = n.tags || [];
  const [tagIn, setTagIn] = useState('');
  const toggleTag = (t: string) => st.update(n.id, { tags: tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t] });
  const addTag = () => { const t = tagIn.trim().replace(/^#/, '').slice(0, 24); if (t && !tags.includes(t)) st.update(n.id, { tags: [...tags, t] }); setTagIn(''); };
  return (
    <div className={'nrow c-' + (n.color || 'yellow')} id={'note-' + n.id}>
      <div className="nmeta">
        <button className="ghost" disabled={gone} onClick={onOpen}>{gone ? '(PDF removed)' : (showPdf ? title + ' · ' : '') + 'p. ' + (n.page_number || '?')}</button>
        <span className="sync" title={n.synced ? 'Backed up' : 'Waiting to back up'}><Ic n={n.synced ? 'check' : 'clock'} /></span>
        <button className={'go mgr' + (n.pin ? ' on' : '')} aria-label="Pin note" onClick={() => st.update(n.id, { pin: !n.pin })}><Ic n="star" fill={!!n.pin} /></button>
        <button className="go mgr" aria-label="Delete note" onClick={() => st.remove(n.id)}><Ic n="trash" /></button>
      </div>
      {n.selected_text !== PAGE_NOTE && <blockquote>{n.selected_text}</blockquote>}
      <textarea id={'nt-' + n.id} key={n.id + n.updated_at} defaultValue={n.note_content} placeholder="Add your own note…" maxLength={4000}
        onBlur={ev => { if (ev.target.value !== n.note_content) st.update(n.id, { note_content: ev.target.value }); }} />
      <div className="ntags">
        <Dots value={n.color || 'yellow'} onPick={c => st.update(n.id, { color: c })} />
        {[...NOTE_TAGS, ...tags.filter(t => !(NOTE_TAGS as readonly string[]).includes(t))].map(t => (
          <button key={t} className={'chip sm' + (tags.includes(t) ? ' on' : '')} onClick={() => toggleTag(t)}>#{t}</button>
        ))}
        <input className="tagin" value={tagIn} placeholder="+ tag" maxLength={24} onChange={ev => setTagIn(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') addTag(); }} onBlur={addTag} />
      </div>
    </div>
  );
}
