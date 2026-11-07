'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { refs, type RefStore, type Hi } from '@/lib/refs';
import { notes, type Rect, type NoteColor } from '@/lib/notes';
import { engine } from '@/lib/engine';

export function useRefs(): RefStore {
  const r = refs();
  useSyncExternalStore(r.subscribe, r.getVer, r.getVer);
  return r;
}
export function useNotesStore() {
  const n = notes();
  useSyncExternalStore(n.subscribe, n.getVer, n.getVer);
  return n;
}

/** Loads categories/PDFs/models once and tells the study engine which card sets belong to which pool. */
export function usePoolSync() {
  const R = useRefs();
  useEffect(() => { R.load(); }, [R]);
  useEffect(() => { if (R.loaded) engine().setPools(R.catSecs, R.categories); });
  return R;
}

export interface PendingSel { text: string; page: number; rects: Rect[]; box: Hi }
export interface SaveOpts { note?: string; color?: NoteColor; tags?: string[]; pin?: boolean; qid?: string }

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Local-first note capture, made for phones. The selection is "frozen" the moment it is made: tapping a button (which
 * makes the browser drop the native selection) no longer makes the Save bar vanish. The captured passage is drawn as a
 * preview highlight, and the bar stays until you save, dismiss it, or ~12 s after you stop interacting.
 * With `auto` on, a finished selection is saved as a highlight by itself (marker mode).
 */
export function useNoteCapture(root: RefObject<HTMLElement>, pdfId: string | null, enabled: boolean, auto: { on: boolean; opts: SaveOpts }) {
  const [pending, setPending] = useState<PendingSel | null>(null);
  const [error, setError] = useState('');
  const pend = useRef<PendingSel | null>(null), clearT = useRef<any>(0), autoT = useRef<any>(0);
  const autoRef = useRef(auto); autoRef.current = auto;
  const set = (s: PendingSel | null) => { pend.current = s; setPending(s); };

  const doSave = useCallback((o: SaveOpts = {}): string | null => {
    const s = pend.current;
    if (!s || !pdfId) return null;
    try {
      const n = notes().add({ pdf_id: pdfId, selected_text: s.text, page_number: s.page, rects: s.rects, note_content: o.note || '', color: o.color, tags: o.tags, pin: o.pin, qid: o.qid });
      getSelection()?.removeAllRanges(); set(null); setError('');
      return n.id;
    } catch (e: any) { setError(e.message || 'Could not save the note.'); return null; }
  }, [pdfId]);
  const saveRef = useRef(doSave); saveRef.current = doSave;

  useEffect(() => {
    if (!enabled || !pdfId) { set(null); return; }
    let t: any;
    const check = () => {
      const el = root.current, sel = getSelection();
      if (!el || !sel || sel.isCollapsed || !sel.rangeCount) {
        // keep the frozen selection for a while, so tapping the Save bar still works
        clearTimeout(clearT.current); if (pend.current) clearT.current = setTimeout(() => set(null), 12000);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (!text) return;
      const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as HTMLElement | null;
      const pageEl = startEl && (startEl.closest('[data-page]') as HTMLElement | null);
      if (!pageEl) return;
      const pr = pageEl.getBoundingClientRect(), rects: Rect[] = [];
      Array.from(range.getClientRects()).forEach(c => {
        const inside = c.bottom > pr.top && c.top < pr.bottom && c.right > pr.left && c.left < pr.right;
        if (!inside || c.width < 2 || c.height < 2) return;
        const x = clamp01((c.left - pr.left) / pr.width), y = clamp01((c.top - pr.top) / pr.height);
        rects.push({ x: r4(x), y: r4(y), width: r4(Math.min(1 - x, c.width / pr.width)), height: r4(Math.min(1 - y, c.height / pr.height)) });
      });
      if (!rects.length) return;
      const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
      const x1 = Math.max(...rects.map(r => r.x + r.width)), y1 = Math.max(...rects.map(r => r.y + r.height));
      clearTimeout(clearT.current);
      set({ text: text.slice(0, 4000), page: +pageEl.dataset.page!, rects: rects.slice(0, 80), box: { x: r4(x0), y: r4(y0), width: r4(x1 - x0), height: r4(y1 - y0) } });
      clearTimeout(autoT.current);
      if (autoRef.current.on) autoT.current = setTimeout(() => saveRef.current(autoRef.current.opts), 650); // marker mode: save when the selection settles
    };
    const on = () => { clearTimeout(t); t = setTimeout(check, 120); };
    document.addEventListener('selectionchange', on);
    // clicking or tapping the pages themselves is a deliberate "deselect": the preview mark goes away at once.
    // (Tapping the note toolbar keeps it, so Highlight / Note still work; so does an open note editor.)
    const down = (ev: Event) => {
      const tg = ev.target as HTMLElement | null;
      if (!pend.current || !tg || !tg.closest || !tg.closest('.pdf-scroll')) return;
      if (document.querySelector('.vedit textarea')) return;
      clearTimeout(clearT.current); clearTimeout(autoT.current); set(null);
    };
    document.addEventListener('pointerdown', down, true);
    return () => { document.removeEventListener('pointerdown', down, true); clearTimeout(t); clearTimeout(clearT.current); clearTimeout(autoT.current); document.removeEventListener('selectionchange', on); };
  }, [enabled, pdfId, root]);

  const dismiss = useCallback(() => { clearTimeout(autoT.current); getSelection()?.removeAllRanges(); set(null); }, []);
  /** The frozen selection, used to map a question to a passage. */
  const recent = useCallback(() => pend.current, []);
  return { pending, save: doSave, dismiss, recent, error };
}
