'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Hi, Target } from '@/lib/refs';
import type { LocalNote } from '@/lib/notes';

export interface PdfViewerHandle {
  scrollToPage(n: number, hi?: Hi | null): void;
  currentPage(): number;
  scroller(): HTMLDivElement | null;
}
interface Props {
  url: string | null;
  target: Target | null;
  notes: LocalNote[];
  onPage?: (n: number, total: number) => void;
}

let pdfjsP: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsP) {
    pdfjsP = import('pdfjs-dist').then((m: any) => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
      return m;
    });
  }
  return pdfjsP;
}

/**
 * Lazy PDF viewer: only pages near the screen are drawn (canvas + selectable text layer), so big PDFs stay fast.
 * It stays mounted while the drawer is hidden, so the scroll position survives toggling.
 */
export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer({ url, target, notes, onPage }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const hosts = useRef<(HTMLDivElement | null)[]>([]);
  const st = useRef<any>({ doc: null, ratio: 1.4142, sizes: new Map(), rendered: new Map(), tasks: new Map(), vis: new Set(), width: 0, pdfjs: null, cur: 1, token: 0 });
  const [state, setState] = useState<{ s: 'idle' | 'loading' | 'ready' | 'error'; n: number; err: string }>({ s: 'idle', n: 0, err: '' });
  const [tryN, setTryN] = useState(0);
  const onPageRef = useRef(onPage); onPageRef.current = onPage;

  const heightFor = (n: number) => { const s = st.current, sz = s.sizes.get(n); return (sz ? sz[1] / sz[0] : s.ratio) * s.width; };
  const applyHeights = () => { const s = st.current; pages.current.forEach((el, i) => { if (el && i > 0) el.style.height = heightFor(i) + 'px'; }); };

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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
      const ctx = canvas.getContext('2d')!;
      const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      s.tasks.set(n, task);
      await task.promise;
      s.tasks.delete(n);
      if (tok !== s.token || !s.vis.has(n)) { s.rendered.delete(n); return; }
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
        s.width = Math.max(200, (scroller.current?.clientWidth || 360) - 16);
        setState({ s: 'ready', n: doc.numPages, err: '' });
      } catch (e: any) {
        if (!dead) setState({ s: 'error', n: 0, err: e?.message || 'Could not open this PDF.' });
      }
    })();
    return () => { dead = true; };
  }, [url, tryN]);

  /* observe pages, follow the scroll position, and re-flow when the panel is resized */
  useEffect(() => {
    if (state.s !== 'ready') return;
    const s = st.current, root = scroller.current!;
    s.width = Math.max(200, root.clientWidth - 16); applyHeights();
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        const n = +(e.target as HTMLElement).dataset.page!;
        if (e.isIntersecting) { s.vis.add(n); render(n); } else { s.vis.delete(n); unrender(n); }
      });
    }, { root, rootMargin: '120% 0px' });
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
      const w = Math.max(200, root.clientWidth - 16);
      if (w < 100 || Math.abs(w - s.width) < 4) return;
      clearTimeout(rt);
      rt = setTimeout(() => {
        s.width = w; applyHeights();
        s.vis.forEach((n: number) => { unrender(n); render(n); });
      }, 160);
    });
    ro.observe(root);
    onPageRef.current?.(s.cur, state.n);
    return () => { io.disconnect(); ro.disconnect(); root.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); clearTimeout(rt); };
    // eslint-disable-next-line
  }, [state.s, state.n]);

  const scrollToPage = useCallback(async (n: number, hi?: Hi | null) => {
    const s = st.current, root = scroller.current, doc = s.doc;
    if (!root || !doc) return;
    n = Math.min(Math.max(1, n), doc.numPages);
    try {
      if (!s.sizes.has(n)) { const p = await doc.getPage(n), v = p.getViewport({ scale: 1 }); s.sizes.set(n, [v.width, v.height]); applyHeights(); }
    } catch { /* keep the estimate */ }
    const el = pages.current[n]; if (!el) return;
    const go = () => root.scrollTo({ top: el.offsetTop + (hi ? Math.max(0, hi.y * el.offsetHeight - root.clientHeight * 0.25) : 0) - 8, behavior: 'smooth' });
    go();
    setTimeout(go, 450); // pages above may have changed height once drawn: aim again
  }, []);

  useImperativeHandle(ref, () => ({ scrollToPage, currentPage: () => st.current.cur, scroller: () => scroller.current }), [scrollToPage]);

  /* follow the auto-match target: page + highlight */
  useEffect(() => { if (state.s === 'ready' && target) scrollToPage(target.page, target.hi); }, [target, state.s, scrollToPage]);

  const overlays = useMemo(() => {
    const m = new Map<number, { k: string; r: Hi; cls: string }[]>();
    const add = (p: number, k: string, r: Hi, cls: string) => { const a = m.get(p) || []; a.push({ k, r, cls }); m.set(p, a); };
    notes.forEach(n => (n.rects || []).forEach((r, i) => n.page_number && add(n.page_number, n.id + i, r, 'pdf-note')));
    if (target && target.hi) add(target.page, 'target' + target.nonce, target.hi, 'pdf-target');
    return m;
  }, [notes, target]);

  return (
    <div className="pdf-scroll" ref={scroller}>
      {state.s === 'loading' && <p className="pdf-msg">Opening PDF…</p>}
      {state.s === 'error' && <div className="pdf-msg"><p>{state.err}</p><button className="ghost" onClick={() => setTryN(x => x + 1)}>Try again</button></div>}
      {state.s === 'idle' && <p className="pdf-msg">Choose a document to read.</p>}
      {state.s === 'ready' && Array.from({ length: state.n }, (_, i) => i + 1).map(n => (
        <div key={n} className="pdf-page" data-page={n} ref={el => { pages.current[n] = el; }} style={{ height: heightFor(n) || undefined }}>
          <div className="pdf-host" ref={el => { hosts.current[n] = el; }} />
          {(overlays.get(n) || []).map(o => (
            <i key={o.k} className={'pdf-hl ' + o.cls} style={{ left: o.r.x * 100 + '%', top: o.r.y * 100 + '%', width: o.r.width * 100 + '%', height: o.r.height * 100 + '%' }} />
          ))}
          <span className="pdf-no">{n}</span>
        </div>
      ))}
    </div>
  );
});
