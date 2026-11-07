'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Hi, Target } from '@/lib/refs';
import type { LocalNote } from '@/lib/notes';
import { loadPdfjs } from '@/lib/pdfjs';

export interface PdfViewerHandle {
  scrollToPage(n: number, hi?: Hi | null): void;
  currentPage(): number;
  scroller(): HTMLDivElement | null;
  zoomBy(f: number): void;
  zoomTo(z: number): void;
  fit(): void;
}
export interface FindMark { page: number; rects: Hi[] }
interface Props {
  url: string | null;
  target: Target | null;
  notes: LocalNote[];
  pending?: { page: number; rects: Hi[] } | null;
  finds?: FindMark[];
  findIdx?: number;
  night?: boolean;
  onPage?: (n: number, total: number) => void;
  onZoom?: (z: number) => void;
  onNote?: (id: string, x: number, y: number) => void;
}

const MIN_Z = 0.5, MAX_Z = 5;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

/**
 * Lazy PDF viewer: only pages near the screen are drawn (canvas + selectable text layer), so big PDFs stay fast.
 * Zoom: buttons, ctrl+wheel and two-finger pinch (live preview, sharp re-render on release, focus point kept).
 * It stays mounted while the drawer is hidden, so the scroll position survives toggling.
 */
export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer({ url, target, notes, pending, finds, findIdx = -1, night, onPage, onZoom, onNote }, ref) {
  const scroller = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const hosts = useRef<(HTMLDivElement | null)[]>([]);
  const st = useRef<any>({ doc: null, ratio: 1.4142, sizes: new Map(), rendered: new Map(), tasks: new Map(), vis: new Set(), base: 0, width: 0, zoom: 1, pdfjs: null, cur: 1, token: 0 });
  const [state, setState] = useState<{ s: 'idle' | 'loading' | 'ready' | 'error'; n: number; err: string }>({ s: 'idle', n: 0, err: '' });
  const [tryN, setTryN] = useState(0);
  const onPageRef = useRef(onPage); onPageRef.current = onPage;
  const onZoomRef = useRef(onZoom); onZoomRef.current = onZoom;
  const onNoteRef = useRef(onNote); onNoteRef.current = onNote;
  const notesRef = useRef(notes); notesRef.current = notes;

  const heightFor = (n: number) => { const s = st.current, sz = s.sizes.get(n); return (sz ? sz[1] / sz[0] : s.ratio) * s.width; };
  const applySizes = () => { const s = st.current; pages.current.forEach((el, i) => { if (el && i > 0) { el.style.width = s.width + 'px'; el.style.height = heightFor(i) + 'px'; } }); };

  const unrender = useCallback((n: number) => {
    const s = st.current, t = s.tasks.get(n);
    if (t) { try { t.cancel(); } catch { /* ignore */ } s.tasks.delete(n); }
    s.rendered.delete(n);
    const h = hosts.current[n]; if (h) h.textContent = '';
  }, []);

  const render = useCallback(async (n: number) => {
    const s = st.current, doc = s.doc, key = String(Math.round(s.width));
    if (!doc || !s.width || s.rendered.get(n) === key) return;
    s.rendered.set(n, key);
    const tok = s.token;
    try {
      const page = await doc.getPage(n);
      if (tok !== s.token) return;
      const base = page.getViewport({ scale: 1 });
      s.sizes.set(n, [base.width, base.height]);
      const vp = page.getViewport({ scale: s.width / base.width });
      const wrap = pages.current[n], host = hosts.current[n];
      if (!wrap || !host || !s.vis.has(n) || String(Math.round(s.width)) !== key) { if (s.rendered.get(n) === key) s.rendered.delete(n); return; }
      wrap.style.height = vp.height + 'px';
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, 4096 / vp.width));
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
      const ctx = canvas.getContext('2d')!;
      const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      s.tasks.set(n, task);
      await task.promise;
      s.tasks.delete(n);
      if (tok !== s.token || !s.vis.has(n) || String(Math.round(s.width)) !== key) { s.rendered.delete(n); return; }
      const tl = document.createElement('div');
      tl.className = 'textLayer'; tl.style.setProperty('--scale-factor', String(vp.scale));
      host.textContent = ''; host.appendChild(canvas); host.appendChild(tl);
      const tc = await page.getTextContent();
      if (tok !== s.token || !s.vis.has(n)) return;
      await s.pdfjs.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] }).promise;
    } catch (e: any) {
      if (e && e.name === 'RenderingCancelledException') return;
      s.rendered.delete(n);
    }
  }, []);

  /* load the document */
  useEffect(() => {
    const s = st.current; s.token++;
    pages.current = []; hosts.current = []; s.rendered.clear(); s.vis.clear(); s.sizes.clear(); s.tasks.forEach((t: any) => { try { t.cancel(); } catch { /* ignore */ } }); s.tasks.clear();
    if (s.doc) { try { s.doc.destroy(); } catch { /* ignore */ } s.doc = null; }
    if (!url) { setState({ s: 'idle', n: 0, err: '' }); return; }
    const tok = s.token; let dead = false;
    setState({ s: 'loading', n: 0, err: '' });
    (async () => {
      try {
        const pdfjs = await loadPdfjs(); s.pdfjs = pdfjs;
        const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        if (dead || tok !== s.token) { doc.destroy(); return; }
        const p1 = await doc.getPage(1), v = p1.getViewport({ scale: 1 });
        s.doc = doc; s.ratio = v.height / v.width; s.sizes.set(1, [v.width, v.height]);
        s.base = Math.min(1100, Math.max(200, (scroller.current?.clientWidth || 360) - 16)); s.width = s.base * s.zoom;
        setState({ s: 'ready', n: doc.numPages, err: '' });
      } catch (e: any) {
        if (!dead) setState({ s: 'error', n: 0, err: e?.message || 'Could not open this PDF.' });
      }
    })();
    return () => { dead = true; };
  }, [url, tryN]);

  /* zoom: change the page width, keep the point under the fingers where it is */
  const applyZoom = useCallback((z: number, fx?: number, fy?: number) => {
    const s = st.current, root = scroller.current, box = inner.current; if (!root || !box) return;
    z = clampZ(z); if (Math.abs(z - s.zoom) < 0.001) return;
    const cx = fx ?? root.clientWidth / 2, cy = fy ?? root.clientHeight / 2;
    const px = (root.scrollLeft + cx) / Math.max(1, box.scrollWidth), py = (root.scrollTop + cy) / Math.max(1, box.scrollHeight);
    s.zoom = z; s.width = s.base * z; applySizes();
    s.vis.forEach((n: number) => { unrender(n); render(n); });
    root.scrollLeft = px * box.scrollWidth - cx; root.scrollTop = py * box.scrollHeight - cy;
    onZoomRef.current?.(z);
  }, [render, unrender]); // eslint-disable-line

  /* observe pages, follow the scroll position, re-flow on resize, and handle zoom gestures */
  useEffect(() => {
    if (state.s !== 'ready') return;
    const s = st.current, root = scroller.current!, box = inner.current!;
    s.base = Math.min(1100, Math.max(200, root.clientWidth - 16)); s.width = s.base * s.zoom; applySizes();
    onZoomRef.current?.(s.zoom);
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        const n = +(e.target as HTMLElement).dataset.page!;
        if (e.isIntersecting) { s.vis.add(n); render(n); } else { s.vis.delete(n); unrender(n); }
      });
    }, { root, rootMargin: '220% 0px' });
    pages.current.forEach((el, i) => { if (el && i > 0) io.observe(el); });

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = root.scrollTop + root.clientHeight * 0.3; let cur = s.cur;
        while (cur > 1 && (pages.current[cur]?.offsetTop || 0) > mid) cur--;
        while (cur < state.n && (pages.current[cur + 1]?.offsetTop || Infinity) <= mid) cur++;
        if (cur !== s.cur) { s.cur = cur; onPageRef.current?.(cur, state.n); }
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    let rt: any;
    const ro = new ResizeObserver(() => {
      const w = Math.min(1100, Math.max(200, root.clientWidth - 16));
      if (w < 100 || Math.abs(w - s.base) < 4) return;
      clearTimeout(rt);
      rt = setTimeout(() => {
        s.base = w; s.width = w * s.zoom; applySizes();
        s.vis.forEach((n: number) => { unrender(n); render(n); });
      }, 160);
    });
    ro.observe(root);

    /* pinch (two fingers): live preview with a CSS transform, real re-render on release */
    let p0 = 0, z0 = 1, k = 1, fx = 0, fy = 0, pinching = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    const rr = () => root.getBoundingClientRect();
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true; p0 = dist(e.touches); z0 = s.zoom; k = 1;
        const r = rr(); fx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left; fy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        box.style.transformOrigin = (root.scrollLeft + fx) + 'px ' + (root.scrollTop + fy) + 'px';
        box.style.willChange = 'transform';
      }
    };
    const tm = (e: TouchEvent) => {
      if (!pinching || e.touches.length < 2) return;
      e.preventDefault();
      k = clampZ(z0 * dist(e.touches) / p0) / z0;
      box.style.transform = 'scale(' + k + ')';
    };
    const te = (e: TouchEvent) => {
      if (!pinching || e.touches.length >= 2) return;
      pinching = false;
      box.style.transform = ''; box.style.willChange = ''; box.style.transformOrigin = '';
      applyZoom(z0 * k, fx, fy);
    };
    root.addEventListener('touchstart', ts, { passive: true });
    root.addEventListener('touchmove', tm, { passive: false });
    root.addEventListener('touchend', te, { passive: true });
    root.addEventListener('touchcancel', te, { passive: true });
    /* ctrl + wheel (trackpad pinch / mouse) */
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = rr(); applyZoom(s.zoom * Math.exp(-e.deltaY * 0.0045), e.clientX - r.left, e.clientY - r.top);
    };
    root.addEventListener('wheel', wheel, { passive: false });

    /* tap on a saved highlight: open that note */
    const click = (e: MouseEvent) => {
      const sel = getSelection(); if (sel && !sel.isCollapsed) return;
      const pg = (e.target as HTMLElement).closest?.('[data-page]') as HTMLElement | null; if (!pg) return;
      const b = pg.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height, n = +pg.dataset.page!;
      const hit = notesRef.current.find(nt => nt.page_number === n && (nt.rects || []).some(r => x >= r.x - 0.004 && x <= r.x + r.width + 0.004 && y >= r.y - 0.004 && y <= r.y + r.height + 0.004));
      if (hit) onNoteRef.current?.(hit.id, e.clientX, e.clientY);
    };
    root.addEventListener('click', click);

    onPageRef.current?.(s.cur, state.n);
    return () => {
      io.disconnect(); ro.disconnect(); root.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); clearTimeout(rt);
      root.removeEventListener('touchstart', ts); root.removeEventListener('touchmove', tm); root.removeEventListener('touchend', te); root.removeEventListener('touchcancel', te);
      root.removeEventListener('wheel', wheel); root.removeEventListener('click', click);
    };
    // eslint-disable-next-line
  }, [state.s, state.n]);

  const scrollToPage = useCallback(async (n: number, hi?: Hi | null) => {
    const s = st.current, root = scroller.current, doc = s.doc;
    if (!root || !doc) return;
    n = Math.min(Math.max(1, n), doc.numPages);
    try {
      if (!s.sizes.has(n)) { const p = await doc.getPage(n), v = p.getViewport({ scale: 1 }); s.sizes.set(n, [v.width, v.height]); applySizes(); }
    } catch { /* keep the estimate */ }
    const el = pages.current[n]; if (!el) return;
    const go = () => root.scrollTo({
      top: el.offsetTop + (hi ? Math.max(0, hi.y * el.offsetHeight - root.clientHeight * 0.25) : 0) - 8,
      left: hi && s.zoom > 1.05 ? Math.max(0, el.offsetLeft + hi.x * el.offsetWidth - root.clientWidth * 0.2) : undefined,
      behavior: 'smooth'
    });
    go();
    setTimeout(go, 450); // pages above may have changed height once drawn: aim again
  }, []);

  const fit = useCallback(() => applyZoom(1), [applyZoom]);
  useImperativeHandle(ref, () => ({
    scrollToPage, currentPage: () => st.current.cur, scroller: () => scroller.current,
    zoomBy: (f: number) => applyZoom(st.current.zoom * f), zoomTo: (z: number) => applyZoom(z), fit
  }), [scrollToPage, applyZoom, fit]);

  /* follow the auto-match target: page + highlight */
  useEffect(() => { if (state.s === 'ready' && target) scrollToPage(target.page, target.hi); }, [target, state.s, scrollToPage]);

  const overlays = useMemo(() => {
    const m = new Map<number, { k: string; r: Hi; cls: string }[]>();
    const add = (p: number, k: string, r: Hi, cls: string) => { const a = m.get(p) || []; a.push({ k, r, cls }); m.set(p, a); };
    notes.forEach(n => (n.rects || []).forEach((r, i) => n.page_number && add(n.page_number, n.id + i, r, 'pdf-note c-' + (n.color || 'yellow'))));
    (finds || []).forEach((f, fi) => f.rects.forEach((r, i) => add(f.page, 'f' + fi + '_' + i, r, fi === findIdx ? 'pdf-target' : 'pdf-find')));
    if (target) (target.rects && target.rects.length ? target.rects : target.hi ? [target.hi] : []).forEach((r, i) => add(target.page, 'target' + target.nonce + '_' + i, r, 'pdf-target'));
    if (pending) pending.rects.forEach((r, i) => add(pending.page, 'pend' + i, r, 'pdf-pending'));
    return m;
  }, [notes, target, finds, findIdx, pending]);

  return (
    <div className={'pdf-scroll' + (night ? ' night' : '')} ref={scroller} tabIndex={0} aria-label="PDF pages">
      {state.s === 'loading' && <p className="pdf-msg">Opening PDF…</p>}
      {state.s === 'error' && <div className="pdf-msg"><p>{state.err}</p><button className="ghost" onClick={() => setTryN(x => x + 1)}>Try again</button></div>}
      {state.s === 'idle' && <p className="pdf-msg">Choose a document to read.</p>}
      {state.s === 'ready' && (
        <div className="pdf-inner" ref={inner}>
          {Array.from({ length: state.n }, (_, i) => i + 1).map(n => (
            <div key={n} className="pdf-page" data-page={n} ref={el => { pages.current[n] = el; }} style={{ width: st.current.width || undefined, height: heightFor(n) || undefined }}>
              <div className="pdf-host" ref={el => { hosts.current[n] = el; }} />
              {(overlays.get(n) || []).map(o => (
                <i key={o.k} className={'pdf-hl ' + o.cls} style={{ left: o.r.x * 100 + '%', top: o.r.y * 100 + '%', width: o.r.width * 100 + '%', height: o.r.height * 100 + '%' }} />
              ))}
              <span className="pdf-no">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
