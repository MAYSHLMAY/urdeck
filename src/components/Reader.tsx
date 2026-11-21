'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PdfViewer, type PdfViewerHandle } from './PdfViewer';
import { SelMenu } from './SelMenu';
import { DefineCard, selectionReq, type DefReq } from './Define';
import { MakeCard } from './MakeCard';
import { AiPane, WebPane, NotesPane, openBeside } from './ReaderPanes';
import { ResearchPane } from './Research';
import { useNoteCapture, useRefs } from './refHooks';
import { AskHost, Ic, Sheet, SheetFrame, Toast, ask, useEngine } from './ui';
import { notes as notesStore, type NoteColor } from '@/lib/notes';
import { findPhrase, getIndex, boxOf, type Hit } from '@/lib/pdfindex';
import { readerStore } from '@/lib/reader';
import { refs, canAddLocal } from '@/lib/refs';

type Theme = 'light' | 'sepia' | 'paper' | 'night';
type Side = 'outline' | 'pages' | 'marks' | 'find';
type Split = 'off' | 'ai' | 'res' | 'web' | 'notes' | 'pdf';
const THEMES: [Theme, string][] = [['light', 'Light'], ['sepia', 'Sepia'], ['paper', 'Paper'], ['night', 'Night']];
const K_UI = 'ud-rd-ui';
interface UI { tabs: string[]; act: string; theme: Theme; br: number; split: Split; ratio: number; bId: string; rate: number; side: boolean; sideTab: Side }
const DEF: UI = { tabs: [], act: '', theme: 'light', br: 100, split: 'off', ratio: 56, bId: '', rate: 1, side: false, sideTab: 'outline' };
const loadUI = (): UI => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(K_UI) || '{}'), split: 'off' }; } catch { return DEF; } };
const useWide = () => { const [w, setW] = useState(false); useEffect(() => { const m = matchMedia('(min-width: 820px)'), f = () => setW(m.matches); f(); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []); return w; };

/** The Reader: a full-page PDF reading room with tabs, a side pane (AI, web, notes or a second PDF), outline, thumbnails and memory of where you stopped. */
export default function Reader() {
  const e = useEngine(), R = useRefs(), wide = useWide();
  const [ui, setUi] = useState<UI>(DEF), [ready, setReady] = useState(false);
  const up = (p: Partial<UI>) => setUi(u => ({ ...u, ...p }));
  useEffect(() => { setUi(loadUI()); setReady(true); e.init(); R.load(); notesStore().start(); }, []); // eslint-disable-line
  useEffect(() => { if (ready) try { localStorage.setItem(K_UI, JSON.stringify(ui)); } catch { /* ignore */ } }, [ui, ready]);

  const viewer = useRef<PdfViewerHandle>(null), viewerB = useRef<PdfViewerHandle>(null), body = useRef<HTMLDivElement>(null), panes = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<any>(null), [page, setPage] = useState({ n: 1, total: 0 }), [zoom, setZoom] = useState(1);
  const [lib, setLib] = useState(false), [pop, setPop] = useState<'' | 'aa' | 'split'>(''), [focus, setFocus] = useState(false);
  const [lq, setLq] = useState(''), [onlyField, setOnlyField] = useState(true), [msg, setMsg] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow'), [marker, setMarker] = useState(false), [coarse, setCoarse] = useState(false);
  const [menu, setMenu] = useState(false), [defReq, setDefReq] = useState<DefReq | null>(null), [mk, setMk] = useState<{ text: string; page: number } | null>(null);
  const [, nb] = useState(0), [, rb] = useState(0);
  useEffect(() => { setCoarse(matchMedia('(pointer: coarse)').matches); const a = notesStore().subscribe(() => nb(x => x + 1)), b = readerStore().subscribe(() => rb(x => x + 1)); return () => { a(); b(); }; }, []);

  const pdf = R.pdf(ui.act || null), url = R.url(pdf), pdfB = R.pdf(ui.bId || null), urlB = R.url(pdfB);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(m => (m === t ? '' : m)), 2200); };

  /* open documents: from ?pdf=, a tab, or the library */
  const open = useCallback((id: string) => { setUi(u => ({ ...u, tabs: u.tabs.includes(id) ? u.tabs : [...u.tabs, id], act: id })); setLib(false); }, []);
  useEffect(() => { if (!ready) return; const id = new URLSearchParams(location.search).get('pdf'); if (id) open(id); else if (!ui.act && ui.tabs.length) up({ act: ui.tabs[0] }); }, [ready]); // eslint-disable-line
  const closeTab = (id: string) => setUi(u => { const tabs = u.tabs.filter(t => t !== id); return { ...u, tabs, act: u.act === id ? (tabs[Math.max(0, u.tabs.indexOf(id) - 1)] || '') : u.act }; });
  /* drop tabs whose document no longer exists (only once the list has loaded) */
  useEffect(() => { if (R.loaded && ready) setUi(u => { const t = u.tabs.filter(id => R.pdf(id)); return t.length === u.tabs.length ? u : { ...u, tabs: t, act: t.includes(u.act) ? u.act : t[0] || '' }; }); }, [R.loaded, R.ver, ready]); // eslint-disable-line

  /* reading memory: restore the page, then save while scrolling */
  const restoring = useRef(false), actRef = useRef(''); actRef.current = ui.act;
  const onReady = useCallback((d: any) => {
    setDoc(d); restoring.current = true;
    const pr = readerStore().prog(actRef.current);
    if (pr?.zoom && pr.zoom > 0.5 && pr.zoom < 5) viewer.current?.zoomTo(pr.zoom);
    if (pr && pr.page > 1) setTimeout(() => viewer.current?.scrollToPage(pr.page, null, true), 60);
    setTimeout(() => { restoring.current = false; const v = viewer.current; if (v && actRef.current) readerStore().at(actRef.current, v.currentPage(), d.numPages, v.zoom()); }, 900);
  }, []);
  useEffect(() => { setDoc(null); setPage({ n: 1, total: 0 }); setFinds([]); setFindIdx(-1); stopSpeak(); }, [ui.act]); // eslint-disable-line
  const onPage = useCallback((n: number, total: number) => {
    setPage(p => (p.n === n && p.total === total ? p : { n, total }));
    if (!restoring.current && actRef.current) readerStore().at(actRef.current, n, total, viewer.current?.zoom());
  }, []);

  /* selection → floating menu */
  const cap = useNoteCapture(body, pdf ? pdf.id : null, !!pdf, { on: marker, opts: { color } });
  const [res, setRes] = useState({ q: '', k: 0 }), [aiSeed, setAiSeed] = useState({ t: '', k: 0 });
  const pend = cap.pending, selKey = pend ? pend.page + '|' + pend.text : '', lastSel = useRef('');
  if (pend) lastSel.current = pend.text;
  useEffect(() => { setMenu(false); if (!pend || marker) return; const t = setTimeout(() => setMenu(true), coarse ? 380 : 260); return () => clearTimeout(t); }, [selKey, marker, coarse]); // eslint-disable-line
  const saveSel = (o: { style?: 'ul' | 'st' } = {}) => { const id = cap.save({ color, ...o }); flash(id ? (o.style === 'ul' ? 'Underlined.' : o.style === 'st' ? 'Struck through.' : 'Highlight saved.') : 'Select the text again.'); setMenu(false); };
  const acts = {
    hl: () => saveSel(), ul: () => saveSel({ style: 'ul' }), st: () => saveSel({ style: 'st' }),
    note: async () => { setMenu(false); const r = await ask({ title: 'Add a note', msg: pend?.text.slice(0, 120), text: '', ok: 'Save' }); if (r && r.text != null) { const id = cap.save({ color, note: r.text }); flash(id ? 'Note saved.' : 'Select the text again.'); } },
    copy: () => { const s = cap.recent(); if (s) navigator.clipboard?.writeText(s.text).then(() => flash('Copied.'), () => flash('Could not copy.')); setMenu(false); },
    define: () => { const s = cap.recent(); if (!s) return; const r = selectionReq(s.text, s.page); if (r) { setDefReq(r); setMenu(false); } },
    find: () => { const s = cap.recent(); if (!s) return; setFq(s.text.split(' ').slice(0, 6).join(' ')); up({ side: true, sideTab: 'find' }); setMenu(false); },
    ask: () => { up({ split: 'ai' }); setMenu(false); },
    res: () => { const s = cap.recent(); setRes(r => ({ q: s?.text || '', k: r.k + 1 })); up({ split: 'res' }); setMenu(false); },
    card: () => { const s = cap.recent(); if (s) setMk({ text: s.text, page: s.page }); setMenu(false); }
  };

  /* search inside the document (uses the background text index) */
  const [fq, setFq] = useState(''), [finds, setFinds] = useState<Hit[]>([]), [findIdx, setFindIdx] = useState(-1), [finding, setFinding] = useState(false);
  useEffect(() => {
    if (!pdf || !url || fq.trim().length < 2) { setFinds([]); setFindIdx(-1); setFinding(false); return; }
    let dead = false; setFinding(true);
    const t = setTimeout(async () => {
      try { const ix = await getIndex(pdf.file_path, url); if (dead) return; const h = findPhrase(ix, fq); setFinds(h); setFinding(false); if (h.length) { setFindIdx(0); viewer.current?.scrollToPage(h[0].page, h[0].box); } else setFindIdx(-1); }
      catch { if (!dead) { setFinding(false); flash('This PDF has no readable text (it may be a scan).'); } }
    }, 220);
    return () => { dead = true; clearTimeout(t); };
  }, [fq, pdf?.id, url]); // eslint-disable-line
  const stepFind = (d: number) => { if (!finds.length) return; const k = (findIdx + d + finds.length) % finds.length; setFindIdx(k); viewer.current?.scrollToPage(finds[k].page, finds[k].box); };

  /* outline */
  const [outline, setOutline] = useState<any[] | null>(null);
  useEffect(() => { setOutline(null); if (doc) doc.getOutline().then((o: any) => setOutline(o || [])).catch(() => setOutline([])); }, [doc]);
  const pageOf = async (dest: any): Promise<number | null> => { try { let d = dest; if (typeof d === 'string') d = await doc.getDestination(d); if (!d) return null; return (await doc.getPageIndex(d[0])) + 1; } catch { return null; } };

  /* page text (AI pane, read aloud) */
  const textOf = useCallback(async (n: number): Promise<string> => { try { const p = await doc.getPage(n), t = await p.getTextContent(); return t.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ').trim(); } catch { return ''; } }, [doc]);

  /* read aloud */
  const [speaking, setSpeaking] = useState(false), spk = useRef(false), spkGen = useRef(0);
  function stopSpeak() { spk.current = false; spkGen.current++; try { speechSynthesis.cancel(); } catch { /* ignore */ } setSpeaking(false); }
  async function speakFrom(n: number) {
    const gen = ++spkGen.current; spk.current = true; setSpeaking(true);
    const txt: string = await textOf(n); if (gen !== spkGen.current) return;
    const parts = ((txt.match(/[^.!?]+[.!?]*\s*/g) || [txt]) as string[]).reduce<string[]>((a, s) => { const l = a[a.length - 1]; if (l && l.length + s.length < 240) a[a.length - 1] = l + s; else a.push(s); return a; }, []).filter(s => s.trim());
    if (!parts.length) { if (n < page.total) { viewer.current?.scrollToPage(n + 1); speakFrom(n + 1); } else stopSpeak(); return; }
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    parts.forEach((s, i) => { const u = new SpeechSynthesisUtterance(s); u.rate = ui.rate; if (i === parts.length - 1) u.onend = () => { if (gen !== spkGen.current || !spk.current) return; if (n < page.total) { viewer.current?.scrollToPage(n + 1); speakFrom(n + 1); } else stopSpeak(); }; u.onerror = () => { if (gen === spkGen.current) stopSpeak(); }; speechSynthesis.speak(u); });
  }
  useEffect(() => () => { try { speechSynthesis.cancel(); } catch { /* ignore */ } }, []);

  /* real reading: a page counts only after real time on it, scaled to how much text it has (not a quick scroll past) */
  const [dw, setDw] = useState(0), dwell = useRef(new Map<string, number>()), need = useRef(new Map<string, number>()), lastAct = useRef(Date.now()), pageRef = useRef(1);
  pageRef.current = page.n;
  useEffect(() => { const f = () => { lastAct.current = Date.now(); }; const ev = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']; ev.forEach(x => addEventListener(x, f, { passive: true, capture: true })); return () => ev.forEach(x => removeEventListener(x, f, true)); }, []);
  useEffect(() => {
    if (!pdf || !doc) return;
    const id = pdf.id, tick = async () => {
      const n = pageRef.current, key = id + ':' + n;
      if (document.hidden || n < 1) return;
      if (readerStore().isRead(id, n)) { setDw(1); return; }
      if (Date.now() - lastAct.current > 60000 && !spk.current) return; // walked away
      let nd = need.current.get(key);
      if (nd == null) { const w = (await textOf(n)).split(/\s+/).filter(Boolean).length; nd = Math.min(28, Math.max(7, Math.round(w / 12))); need.current.set(key, nd); }
      if (pageRef.current !== n) return; // moved on while we measured
      const d = (dwell.current.get(key) || 0) + 1; dwell.current.set(key, d);
      setDw(Math.min(1, d / nd));
      if (d >= nd) { readerStore().markRead(id, n); setDw(1); }
    };
    const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [pdf?.id, doc, textOf]); // eslint-disable-line
  useEffect(() => { const k = (pdf?.id || '') + ':' + page.n; setDw(pdf && readerStore().isRead(pdf.id, page.n) ? 1 : Math.min(1, (dwell.current.get(k) || 0) / (need.current.get(k) || 12))); }, [page.n, pdf?.id]); // eslint-disable-line

  /* bookmarks, jump, keyboard */
  const rs = readerStore(), marked = !!pdf && rs.hasBm(pdf.id, page.n), bms = pdf ? rs.bms(pdf.id) : [];
  const toggleBm = () => { if (!pdf) return; rs.toggleBm(pdf.id, page.n, 'Page ' + page.n); flash(rs.hasBm(pdf.id, page.n) ? 'Bookmarked page ' + page.n + '.' : 'Bookmark removed.'); };
  const go = (n: number, instant = false) => viewer.current?.scrollToPage(Math.min(Math.max(1, n), page.total || 1), null, instant);
  const cycleTheme = () => up({ theme: THEMES[(THEMES.findIndex(t => t[0] === ui.theme) + 1) % 4][0] });
  const pi = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ev.metaKey || ev.altKey) return;
      const c = ev.key;
      if ((ev.ctrlKey && c === 'f') || c === '/') { ev.preventDefault(); up({ side: true, sideTab: 'find' }); setTimeout(() => document.getElementById('rd-fq')?.focus(), 80); return; }
      if (ev.ctrlKey) return;
      if (c === 'j') go(page.n + 1); else if (c === 'k') go(page.n - 1);
      else if (c === '+' || c === '=') viewer.current?.zoomBy(1.15); else if (c === '-') viewer.current?.zoomBy(1 / 1.15);
      else if (c === '0') viewer.current?.fit(); else if (c === 'b') toggleBm(); else if (c === 'f') setFocus(f => !f);
      else if (c === 't') cycleTheme(); else if (c === 's') up({ side: !ui.side }); else if (c === 'g') { ev.preventDefault(); pi.current?.select(); pi.current?.focus(); }
      else if (c === 'h' && cap.pending) saveSel(); else if (c === 'n' && cap.pending) acts.note();
      else if (c === ']' || c === '[') { const i = ui.tabs.indexOf(ui.act), j = i + (c === ']' ? 1 : -1); if (ui.tabs[j]) up({ act: ui.tabs[j] }); }
      else if (c === 'Escape') { setPop(''); setFocus(false); setLib(false); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }); // every render: handlers close over fresh state

  /* the divider between the pages and the side pane */
  const drag = (ev: React.PointerEvent) => {
    const box = panes.current?.getBoundingClientRect(); if (!box) return;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId); document.body.classList.add('rd-drag');
    const mv = (m: PointerEvent) => up({ ratio: Math.round(Math.min(78, Math.max(24, wide ? ((m.clientX - box.left) / box.width) * 100 : ((m.clientY - box.top) / box.height) * 100)) * 10) / 10 });
    const end = () => { document.body.classList.remove('rd-drag'); removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); };
    addEventListener('pointermove', mv); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  };

  /* library */
  const all = useMemo(() => [...R.pdfs, ...R.localPdfs], [R.ver]); // eslint-disable-line
  const fld = e.field && e.fieldOk() ? e.fields().find(f => f.id === e.field) : null;
  const shown = all.filter(d => (!fld || !onlyField || e.itemInField('pdf:' + d.id)) && (!lq.trim() || d.title.toLowerCase().includes(lq.trim().toLowerCase())));
  const fileRef = useRef<HTMLInputElement>(null);
  const addFile = async (f: File | undefined) => { if (!f) return; try { const d = await R.addLocalPdf(f, '', []); open(d.id); flash('Added to this device.'); } catch (x: any) { flash(x.message || 'Could not add that file.'); } };
  const Row = ({ d }: { d: { id: string; title: string; local?: boolean } }) => {
    const p = rs.prog(d.id), pc = p?.total ? Math.min(100, Math.round((rs.readCount(d.id) / p.total) * 100)) : 0;
    return (
      <button type="button" className={'rd-row' + (d.id === ui.act ? ' on' : '')} onClick={() => open(d.id)}>
        <span className="rd-ric"><Ic n="file" /></span>
        <span className="rd-rt"><b>{d.title}</b><small>{p ? (p.total ? rs.readCount(d.id) + ' of ' + p.total + ' pages read' : 'Page ' + p.page) : 'Not opened yet'}{d.local ? ' · on this device' : ''}</small>{pc > 0 && <i className="rd-bar"><u style={{ width: pc + '%' }} /></i>}</span>
        <Ic n="chevR" />
      </button>
    );
  };
  const recent = rs.recent(5).filter(r => R.pdf(r.id));
  const cats = R.categories.map(c => ({ c, l: R.pdfsOf(c.id).filter(d => shown.some(s => s.id === d.id)) })).filter(x => x.l.length);
  const loose = shown.filter(d => !R.catsOf(d.id).length);

  const title = (pdf?.title || 'Reader'), pc = page.total ? page.n / page.total : 0;
  const left = page.total ? Math.max(0, page.total - page.n) : 0, mins = Math.round(left * 1.6);
  const tone = ui.theme === 'sepia' ? 'sepia' : ui.theme === 'paper' ? 'paper' : '';
  const aSize = ui.split === 'off' ? undefined : { flex: `0 0 ${ui.ratio}%` };
  const sideBody = (() => {
    if (!pdf) return null;
    if (ui.sideTab === 'outline') return !doc || outline === null ? <p className="rd-n">Reading the outline…</p> : outline.length ? <Outline items={outline} pageOf={pageOf} go={n => { go(n); if (!wide) up({ side: false }); }} /> : <p className="rd-n">This PDF has no outline. Use Pages to jump around.</p>;
    if (ui.sideTab === 'pages') return doc ? <Thumbs doc={doc} total={page.total} cur={page.n} done={rs.readPages(pdf.id)} go={n => { go(n, true); if (!wide) up({ side: false }); }} /> : null;
    if (ui.sideTab === 'marks') return (
      <div className="rd-marks">
        <button type="button" className="rd-wide" onClick={toggleBm}><Ic n="pin" fill={marked} />{marked ? 'Remove bookmark on page ' + page.n : 'Bookmark page ' + page.n}</button>
        {bms.map(b => <div key={b.p} className="rd-bm"><button type="button" onClick={() => { go(b.p); if (!wide) up({ side: false }); }}><Ic n="pin" fill /><b>{b.l || 'Page ' + b.p}</b><small>p. {b.p}</small></button><button type="button" className="rd-ib sm" aria-label="Remove bookmark" onClick={() => rs.toggleBm(pdf.id, b.p)}><Ic n="close" /></button></div>)}
        {!bms.length && <p className="rd-n">No bookmarks yet. Press B to mark the page you are on.</p>}
        <h5>Notes in this PDF</h5>
        {notesStore().list(pdf.id).slice().sort((a, b) => (a.page_number || 0) - (b.page_number || 0)).map(n => <button key={n.id} type="button" className={'rd-nl c-' + (n.color || 'yellow')} onClick={() => { go(n.page_number || 1); viewer.current?.scrollToPage(n.page_number || 1, boxOf(n.rects)); if (!wide) up({ side: false }); }}><small>p. {n.page_number}</small>{n.selected_text.slice(0, 110)}</button>)}
      </div>
    );
    return (
      <div className="rd-find">
        <div className="rd-fi"><Ic n="search" /><input id="rd-fq" value={fq} onChange={ev => setFq(ev.target.value)} placeholder="Search this document" aria-label="Search this document" onKeyDown={ev => { if (ev.key === 'Enter') stepFind(ev.shiftKey ? -1 : 1); }} />{fq && <button type="button" className="rd-ib sm" aria-label="Clear" onClick={() => setFq('')}><Ic n="close" /></button>}</div>
        <div className="rd-fs"><span>{finding ? 'Searching…' : fq.trim().length < 2 ? 'Type at least 2 letters' : finds.length ? (findIdx + 1) + ' of ' + finds.length : 'No matches'}</span><button type="button" className="rd-ib sm" aria-label="Previous match" disabled={!finds.length} onClick={() => stepFind(-1)}><Ic n="chevL" /></button><button type="button" className="rd-ib sm" aria-label="Next match" disabled={!finds.length} onClick={() => stepFind(1)}><Ic n="chevR" /></button></div>
        <div className="rd-fl">{Object.entries(finds.reduce<Record<number, number>>((m, h) => { m[h.page] = (m[h.page] || 0) + 1; return m; }, {})).slice(0, 80).map(([p, n]) => <button key={p} type="button" onClick={() => { const k = finds.findIndex(h => h.page === +p); setFindIdx(k); viewer.current?.scrollToPage(+p, finds[k].box); if (!wide) up({ side: false }); }}>Page {p}<small>{n} match{n === 1 ? '' : 'es'}</small></button>)}</div>
      </div>
    );
  })();

  if (!ready) return <div className="rdr t-light"><p className="rd-n" style={{ padding: 24 }}>Loading…</p></div>;
  return (
    <div className={'rdr t-' + ui.theme + (focus ? ' focus' : '') + (wide ? ' wide' : '')} style={{ ['--rdbr' as any]: ui.br / 100 }}>
      {!focus && (
        <header className="rd-top">
          <Link href="/" className="rd-ib" aria-label="Back to home"><Ic n="arrowL" /></Link>
          <h1 title={title}>{title}</h1>
          <button type="button" className="rd-ib" aria-label="Library" title="Library" onClick={() => setLib(true)}><Ic n="folder" /></button>
          <button type="button" className={'rd-ib' + (ui.split !== 'off' ? ' on' : '')} aria-label="Side by side" aria-expanded={pop === 'split'} title="Read side by side" onClick={() => setPop(pop === 'split' ? '' : 'split')}><Ic n="layers" /></button>
          {pop === 'split' && (
            <div className="rd-pop rd-pop-t" role="menu" onPointerDown={ev => ev.stopPropagation()}>
              <h4>Beside the page</h4>
              {([['ai', 'sparkle', 'Ask AI', 'Knows the page you are on'], ['res', 'search', 'Research', 'Papers, images and articles'], ['web', 'search', 'Web', 'Look things up or open a site'], ['notes', 'note', 'Notes', 'Your highlights and notes'], ['pdf', 'file', 'Another PDF', 'Compare two documents']] as const).map(([k, i, l, d]) => <button key={k} type="button" className={ui.split === k ? 'on' : ''} onClick={() => { up({ split: k, bId: k === 'pdf' && !ui.bId ? ui.tabs.find(t => t !== ui.act) || '' : ui.bId }); setPop(''); }}><Ic n={i} /><span><b>{l}</b><small>{d}</small></span></button>)}
              <button type="button" onClick={() => { openBeside(location.href); setPop(''); }}><Ic n="expand" /><span><b>New window beside this one</b><small>Open ChatGPT, Gemini or Claude next to the reader</small></span></button>
              {ui.split !== 'off' && <button type="button" className="rd-x" onClick={() => { up({ split: 'off' }); setPop(''); }}><Ic n="close" /><span><b>Close side pane</b></span></button>}
            </div>
          )}
        </header>
      )}
      {!focus && (
        <nav className="rd-tabs" aria-label="Open documents">
          {ui.tabs.map(id => <div key={id} className={'rd-tab' + (id === ui.act ? ' on' : '')}><button type="button" onClick={() => up({ act: id })} title={R.pdf(id)?.title}>{R.pdf(id)?.title || 'Document'}</button><button type="button" aria-label="Close tab" onClick={() => closeTab(id)}><Ic n="close" /></button></div>)}
          <button type="button" className="rd-tabadd" aria-label="Open a document" onClick={() => setLib(true)}><Ic n="plus" /></button>
        </nav>
      )}
      {!focus && pdf && <i className="rd-prog"><u style={{ width: pc * 100 + '%' }} /><u className="r" style={{ width: (page.total ? rs.readCount(pdf.id) / page.total * 100 : 0) + '%' }} /></i>}

      <div className="rd-main" onPointerDown={() => pop && setPop('')}>
        {ui.side && pdf && (
          <>
            {!wide && <button type="button" className="rd-scrim" aria-label="Close panel" onClick={() => up({ side: false })} />}
            <aside className="rd-side" aria-label="Document panel">
              <div className="rd-st" role="tablist">{([['outline', 'Outline'], ['pages', 'Pages'], ['marks', 'Marks'], ['find', 'Find']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={ui.sideTab === k} className={ui.sideTab === k ? 'on' : ''} onClick={() => up({ sideTab: k })}>{l}</button>)}</div>
              <div className="rd-sb">{sideBody}</div>
            </aside>
          </>
        )}
        <div className={'rd-panes' + (ui.split !== 'off' ? ' split' : '')} ref={panes}>
          <section className="rd-a" ref={body} style={{ ...aSize, filter: ui.br < 100 ? `brightness(${ui.br / 100})` : undefined }}>
            {pdf ? (
              <PdfViewer ref={viewer} url={url} target={null} notes={notesStore().list(pdf.id)} night={ui.theme === 'night'} tone={tone as any}
                pending={pend ? { page: pend.page, rects: pend.rects } : null} finds={finds} findIdx={findIdx}
                onReady={onReady} onPage={onPage} onZoom={setZoom} onNote={() => { /* opened from the Notes pane */ }} />
            ) : (
              <div className="rd-home">
                <span className="rd-ei big"><Ic n="book" /></span>
                <h2>Your reading room</h2>
                <p>Read any PDF with no flashcards involved. Your place, bookmarks and notes are remembered.</p>
                <button className="solid" onClick={() => setLib(true)}>Open a document</button>
                {recent.length > 0 && <div className="rd-rec">{recent.slice(0, 3).map(r => <Row key={r.id} d={R.pdf(r.id)!} />)}</div>}
              </div>
            )}
            {pdf && focus && <button type="button" className="rd-exit" onClick={() => setFocus(false)}><Ic n="collapse" />Exit focus</button>}
          </section>
          {ui.split !== 'off' && pdf && (
            <>
              <div className="rd-div" role="separator" aria-orientation={wide ? 'vertical' : 'horizontal'} aria-label="Resize" tabIndex={0} onPointerDown={drag} onKeyDown={ev => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') up({ ratio: Math.max(24, ui.ratio - 3) }); if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') up({ ratio: Math.min(78, ui.ratio + 3) }); }}><i /></div>
              <section className="rd-b">
                <div className="rd-bh" role="tablist">
                  {([['ai', 'Ask AI'], ['res', 'Research'], ['web', 'Web'], ['notes', 'Notes'], ['pdf', 'PDF']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={ui.split === k} className={ui.split === k ? 'on' : ''} onClick={() => up({ split: k, bId: k === 'pdf' && !ui.bId ? ui.tabs.find(t => t !== ui.act) || '' : ui.bId })}>{l}</button>)}
                  <button type="button" className="rd-ib sm" aria-label="Close side pane" onClick={() => up({ split: 'off' })}><Ic n="close" /></button>
                </div>
                <div className="rd-bb">
                  {ui.split === 'res' && <ResearchPane seed={res.q} seedKey={res.k} onAsk={t => { setAiSeed(a => ({ t, k: a.k + 1 })); up({ split: 'ai' }); }} />}
                  {ui.split === 'ai' && <AiPane seed={aiSeed.t} seedKey={aiSeed.k} title={pdf.title} page={page.n} getText={() => textOf(page.n)} getSel={() => lastSel.current} />}
                  {ui.split === 'web' && <WebPane seed={lastSel.current.split(' ').slice(0, 4).join(' ')} />}
                  {ui.split === 'notes' && <NotesPane pdfId={pdf.id} onOpen={n => viewer.current?.scrollToPage(n.page_number || 1, boxOf(n.rects))} />}
                  {ui.split === 'pdf' && (
                    <div className="rd-pane-in">
                      <select className="rd-sel" value={ui.bId} onChange={ev => up({ bId: ev.target.value })} aria-label="Second document">
                        <option value="">Choose a document</option>{all.filter(d => d.id !== ui.act).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                      </select>
                      <div className="rd-bpdf"><PdfViewer ref={viewerB} url={urlB} target={null} notes={[]} night={ui.theme === 'night'} tone={tone as any} /></div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {!focus && pdf && (
        <footer className="rd-bar">
          <button type="button" className={'rd-ib' + (ui.side ? ' on' : '')} aria-label="Outline, pages, bookmarks and search" aria-pressed={ui.side} title="Panel (S)" onClick={() => up({ side: !ui.side })}><Ic n="list" /></button>
          <button type="button" className="rd-ib" aria-label="Previous page" disabled={page.n <= 1} onClick={() => go(page.n - 1)}><Ic n="chevL" /></button>
          <label className={'rd-pg' + (dw >= 1 ? ' got' : '')} style={{ ['--dw' as any]: dw }} title={dw >= 1 ? 'Counted as read' : 'Counts as read after you spend time on it'}><input ref={pi} inputMode="numeric" aria-label="Page number" key={page.n} defaultValue={page.n} onFocus={ev => ev.target.select()} onKeyDown={ev => { if (ev.key === 'Enter') { const v = parseInt((ev.target as HTMLInputElement).value, 10); if (v) go(v, true); (ev.target as HTMLInputElement).blur(); } }} onBlur={ev => { ev.target.value = String(page.n); }} /><span>/ {page.total || '–'}</span>{dw >= 1 && <Ic n="check" />}</label>
          <button type="button" className="rd-ib" aria-label="Next page" disabled={page.n >= page.total} onClick={() => go(page.n + 1)}><Ic n="chevR" /></button>
          <button type="button" className={'rd-ib' + (marked ? ' on' : '')} aria-label="Bookmark this page" aria-pressed={marked} title="Bookmark (B)" onClick={toggleBm}><Ic n="pin" fill={marked} /></button>
          <button type="button" className={'rd-ib' + (pop === 'aa' ? ' on' : '')} aria-label="View options" aria-expanded={pop === 'aa'} onClick={() => setPop(pop === 'aa' ? '' : 'aa')}><b className="rd-aa">Aa</b></button>
          {pop === 'aa' && (
            <div className="rd-pop rd-pop-b" role="dialog" aria-label="View options" onPointerDown={ev => ev.stopPropagation()}>
              <div className="rd-th" role="radiogroup" aria-label="Page theme">{THEMES.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={ui.theme === k} className={'th-' + k + (ui.theme === k ? ' on' : '')} onClick={() => up({ theme: k })}><i />{l}</button>)}</div>
              <label className="rd-sl"><span>Brightness</span><input type="range" min={40} max={100} value={ui.br} onChange={ev => up({ br: +ev.target.value })} /></label>
              <div className="rd-zr"><button type="button" onClick={() => viewer.current?.zoomBy(1 / 1.15)} aria-label="Zoom out"><Ic n="minus" /></button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => viewer.current?.zoomBy(1.15)} aria-label="Zoom in"><Ic n="plus" /></button><button type="button" onClick={() => viewer.current?.fit()}>Fit width</button><button type="button" onClick={() => viewer.current?.fitPage()}>Fit page</button></div>
              <div className="rd-zr"><button type="button" className={speaking ? 'on' : ''} onClick={() => speaking ? stopSpeak() : speakFrom(page.n)}><Ic n={speaking ? 'stop' : 'play'} />{speaking ? 'Stop reading' : 'Read aloud'}</button>
                <select aria-label="Reading speed" value={ui.rate} onChange={ev => up({ rate: +ev.target.value })}>{[0.8, 1, 1.25, 1.5, 1.8].map(r => <option key={r} value={r}>{r}x</option>)}</select>
                <button type="button" onClick={() => { setFocus(true); setPop(''); }}><Ic n="expand" />Focus</button></div>
              <label className="rd-chk"><input type="checkbox" checked={marker} onChange={ev => setMarker(ev.target.checked)} /><span>Marker mode: highlight as soon as you select</span></label>
              {page.total > 0 && pdf && <p className="rd-n"><b>{rs.readCount(pdf.id)}</b> of {page.total} pages read · {Math.min(5, rs.todayPages())}/5 today for your streak<br />{left ? 'About ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min') + ' left (estimate)' : ' · last page'}</p>}
            </div>
          )}
        </footer>
      )}

      {menu && pend && <SelMenu sel={pend} coarse={coarse} color={color} onColor={setColor} acts={acts} />}
      <DefineCard req={defReq} hint={pdf?.title || ''} onClose={() => setDefReq(null)} />
      {pdf && <MakeCard open={!!mk} onClose={() => setMk(null)} text={mk?.text || ''} pdfId={pdf.id} page={mk?.page || 1} />}
      {msg && <div className="rd-toast" role="status">{msg}</div>}

      <Sheet open={lib} onClose={() => setLib(false)} className="sheet rd-lib">
        <SheetFrame title="Library" onClose={() => setLib(false)}>
          <div className="rd-lb">
            <div className="rd-fi"><Ic n="search" /><input value={lq} onChange={ev => setLq(ev.target.value)} placeholder="Search documents" aria-label="Search documents" /></div>
            {canAddLocal() && <><button type="button" className="rd-wide" onClick={() => fileRef.current?.click()}><Ic n="plus" />Add a PDF from this device</button><input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={ev => { addFile(ev.target.files?.[0]); ev.target.value = ''; }} /></>}
            {fld && <label className="rd-chk"><input type="checkbox" checked={onlyField} onChange={ev => setOnlyField(ev.target.checked)} /><span>Only in {fld.name}</span></label>}
            {!lq && recent.length > 0 && <><h5>Continue reading</h5>{recent.map(r => <Row key={r.id} d={R.pdf(r.id)!} />)}</>}
            {cats.map(x => <div key={x.c.id}><h5>{x.c.name}</h5>{x.l.map(d => <Row key={d.id} d={d} />)}</div>)}
            {loose.length > 0 && <div><h5>{cats.length ? 'Other' : 'Documents'}</h5>{loose.map(d => <Row key={d.id} d={d} />)}</div>}
            {!shown.length && <p className="rd-n">{R.loading ? 'Loading…' : all.length ? 'Nothing matches.' : 'No documents yet. Add a PDF from this device and it will stay private to it.'}</p>}
          </div>
        </SheetFrame>
      </Sheet>
      <AskHost /><Toast />
    </div>
  );
}

function Outline({ items, pageOf, go }: { items: any[]; pageOf: (d: any) => Promise<number | null>; go: (n: number) => void }) {
  return <ul className="rd-ol">{items.map((it, i) => <OutlineItem key={i} it={it} pageOf={pageOf} go={go} />)}</ul>;
}
function OutlineItem({ it, pageOf, go }: { it: any; pageOf: (d: any) => Promise<number | null>; go: (n: number) => void }) {
  const [o, setO] = useState(false), kids = it.items || [];
  return (
    <li>
      <div className="rd-oi">
        {kids.length > 0 ? <button type="button" className={'rd-oc' + (o ? ' on' : '')} aria-label={o ? 'Collapse' : 'Expand'} aria-expanded={o} onClick={() => setO(!o)}><Ic n="chevR" /></button> : <span className="rd-oc" />}
        <button type="button" className="rd-ot" onClick={async () => { const n = await pageOf(it.dest); if (n) go(n); }}>{it.title || 'Untitled'}</button>
      </div>
      {o && kids.length > 0 && <Outline items={kids} pageOf={pageOf} go={go} />}
    </li>
  );
}

/** Lazy page thumbnails: a page is only drawn once it scrolls into view. */
function Thumbs({ doc, total, cur, go, done }: { doc: any; total: number; cur: number; done: Set<number>; go: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector('.on')?.scrollIntoView({ block: 'center' }); }, []); // eslint-disable-line
  return <div className="rd-th-g" ref={box}>{Array.from({ length: total }, (_, i) => <Thumb key={i} doc={doc} n={i + 1} on={i + 1 === cur} read={done.has(i + 1)} go={go} />)}</div>;
}
function Thumb({ doc, n, on, read, go }: { doc: any; n: number; on: boolean; read: boolean; go: (n: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null), el = useRef<HTMLButtonElement>(null), done = useRef(false);
  useEffect(() => {
    const b = el.current; if (!b) return;
    const io = new IntersectionObserver(async es => {
      if (!es[0].isIntersecting || done.current) return; done.current = true; io.disconnect();
      try {
        const p = await doc.getPage(n), v0 = p.getViewport({ scale: 1 }), s = (112 * Math.min(2, devicePixelRatio || 1)) / v0.width, v = p.getViewport({ scale: s }), c = cv.current; if (!c) return;
        c.width = v.width; c.height = v.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: v }).promise;
      } catch { /* a page that fails to draw stays blank */ }
    }, { rootMargin: '300px' });
    io.observe(b); return () => io.disconnect();
  }, [doc, n]);
  return <button type="button" ref={el} className={'rd-thb' + (on ? ' on' : '')} onClick={() => go(n)} aria-label={'Page ' + n}><canvas ref={cv} /><span>{n}{read && <Ic n="check" />}</span></button>;
}
