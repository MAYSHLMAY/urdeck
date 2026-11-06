'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { refs, type RefStore, type Hi } from '@/lib/refs';
import { notes, type Rect } from '@/lib/notes';
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

export interface PendingSel { text: string; page: number; rects: Rect[]; box: Hi; anchor: { top: number; left: number } }

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Local-first note capture. Watches the text selection inside the PDF scroller; when the reader has selected text it
 * exposes `pending` (with the page, the highlight rectangles and where to show the "Save" bubble).
 * `save()` stores the note locally at once (IndexedDB) and queues the background sync to Supabase.
 */
export function useNoteCapture(root: RefObject<HTMLElement>, pdfId: string | null, enabled: boolean) {
  const [pending, setPending] = useState<PendingSel | null>(null);
  const [error, setError] = useState('');
  const last = useRef<{ sel: PendingSel; at: number } | null>(null);

  useEffect(() => {
    if (!enabled || !pdfId) { setPending(null); return; }
    let t: any;
    const check = () => {
      const el = root.current, sel = getSelection();
      if (!el || !sel || sel.isCollapsed || !sel.rangeCount) { setPending(null); return; }
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) { setPending(null); return; }
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (!text) { setPending(null); return; }
      const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as HTMLElement | null;
      const pageEl = startEl && (startEl.closest('[data-page]') as HTMLElement | null);
      if (!pageEl) { setPending(null); return; }
      const pr = pageEl.getBoundingClientRect(), rects: Rect[] = [];
      Array.from(range.getClientRects()).forEach(c => {
        const inside = c.bottom > pr.top && c.top < pr.bottom && c.right > pr.left && c.left < pr.right;
        if (!inside || c.width < 2 || c.height < 2) return;
        const x = clamp01((c.left - pr.left) / pr.width), y = clamp01((c.top - pr.top) / pr.height);
        rects.push({ x: r4(x), y: r4(y), width: r4(Math.min(1 - x, c.width / pr.width)), height: r4(Math.min(1 - y, c.height / pr.height)) });
      });
      if (!rects.length) { setPending(null); return; }
      const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
      const x1 = Math.max(...rects.map(r => r.x + r.width)), y1 = Math.max(...rects.map(r => r.y + r.height));
      const rc = range.getBoundingClientRect(), host = el.getBoundingClientRect();
      const s: PendingSel = {
        text: text.slice(0, 4000), page: +pageEl.dataset.page!, rects: rects.slice(0, 80),
        box: { x: r4(x0), y: r4(y0), width: r4(x1 - x0), height: r4(y1 - y0) },
        anchor: { top: Math.min(host.bottom - 56, Math.max(host.top + 8, rc.bottom + 8)), left: Math.max(host.left + 8, Math.min(host.right - 230, rc.left)) }
      };
      last.current = { sel: s, at: Date.now() };
      setPending(s);
    };
    const on = () => { clearTimeout(t); t = setTimeout(check, 140); };
    document.addEventListener('selectionchange', on);
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', on); };
  }, [enabled, pdfId, root]);

  const save = useCallback((noteText = ''): string | null => {
    const s = pending || (last.current && Date.now() - last.current.at < 15000 ? last.current.sel : null);
    if (!s || !pdfId) return null;
    try {
      const n = notes().add({ pdf_id: pdfId, selected_text: s.text, page_number: s.page, rects: s.rects, note_content: noteText });
      getSelection()?.removeAllRanges(); setPending(null); last.current = null; setError('');
      return n.id;
    } catch (e: any) { setError(e.message || 'Could not save the note.'); return null; }
  }, [pending, pdfId]);

  const dismiss = useCallback(() => { getSelection()?.removeAllRanges(); setPending(null); }, []);
  /** The most recent selection (kept for 15 s even if tapping a button cleared it), used to map a question to a passage. */
  const recent = useCallback(() => (pending || (last.current && Date.now() - last.current.at < 15000 ? last.current.sel : null)), [pending]);
  return { pending, save, dismiss, recent, error };
}
