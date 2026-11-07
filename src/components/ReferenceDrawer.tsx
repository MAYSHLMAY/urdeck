'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isOwner } from '@/lib/api';
import { notes as notesStore, NOTE_COLORS, NOTE_TAGS, type LocalNote, type NoteColor } from '@/lib/notes';
import { findPhrase, getIndex, indexProgress, type Hit } from '@/lib/pdfindex';
import type { QCard } from '@/lib/types';
import { PdfViewer, type PdfViewerHandle } from './PdfViewer';
import { CategoryPool, PdfChooserModal } from './CategoryPool';
import { useNoteCapture, useNotesStore, useRefs } from './refHooks';

const boxOf = (rs: { x: number; y: number; width: number; height: number }[]) => {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.width)), y1 = Math.max(...rs.map(r => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
const lsGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const PAGE_NOTE = '(page note)';

function Dots({ value, onPick }: { value: NoteColor; onPick: (c: NoteColor) => void }) {
  return <span className="dots" role="radiogroup" aria-label="Highlight colour">{NOTE_COLORS.map(c => (
    <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className={'cdot c-' + c + (value === c ? ' on' : '')} onClick={() => onPick(c)} />
  ))}</span>;
}

/**
 * The reference panel. It lives next to the quiz (side panel on wide screens, bottom sheet on phones) and keeps its
 * own state outside the quiz card, so opening, hiding or switching PDFs never resets the question or your progress.
 * Once opened, the viewer stays mounted (just hidden), so your place in the PDF is kept.
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

  useEffect(() => { setColorS(lsGet('fr-note-color', 'yellow') as NoteColor); setMarkerS(lsGet('fr-marker', '0') === '1'); setNightS(lsGet('fr-pdf-night', '0') === '1'); }, []);
  const setColor = (c: NoteColor) => { setColorS(c); lsSet('fr-note-color', c); };
  const setMarker = (v: boolean) => { setMarkerS(v); lsSet('fr-marker', v ? '1' : '0'); };
  const setNight = (v: boolean) => { setNightS(v); lsSet('fr-pdf-night', v ? '1' : '0'); };

  /* first open: mount the panel and start the local note store */
  useEffect(() => { if (R.open && !mounted) { setMounted(true); notesStore().start(); } }, [R.open, mounted]);
  /* layout class on <body> so the quiz makes room */
  useEffect(() => { document.body.classList.toggle('ref-open', R.open); return () => document.body.classList.remove('ref-open'); }, [R.open]);
  /* the card changed while the panel is open: re-run auto-matching */
  useEffect(() => { if (R.open) R.resolve(q); /* eslint-disable-next-line */ }, [q?.id]);
  /* Esc closes the panel when nothing else is open */
  useEffect(() => {
    const f = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && R.open && !document.querySelector('dialog[open]')) { if (findOn) setFindOn(false); else R.close(); } };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [R, findOn]);
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

  if (!mounted) return null;

  const mapsHere = q && pdf ? R.mapsCached(String(q.id)).filter(m => m.pdf_id === pdf.id) : [];
  const auto = R.auto && q && R.auto.qid === String(q.id) ? R.auto : null;
  const status = N.status === 'offline' ? 'Offline: notes are saved on this device and will sync later.'
    : N.status === 'error' ? 'Cloud backup failed (' + N.lastError + '). Notes are safe on this device; retrying.'
    : N.status === 'syncing' ? 'Backing up…' : !N.syncOn ? 'Cloud backup is off. Notes stay on this device.' : N.pending ? N.pending + ' waiting to back up.' : 'All notes backed up.';
  const idxPct = pdf ? indexProgress.get(pdf.file_path) : undefined;

  async function mapHere() {
    if (!q || !pdf) return;
    const s = cap.recent();
    const pg = s ? s.page : viewer.current?.currentPage() || 1;
    try { await R.setMapping(String(q.id), pdf.id, pg, s ? s.box : null); setMsg({ t: `Saved: this question now opens page ${pg}${s ? ' with the passage highlighted' : ''}.` }); }
    catch (e: any) { setMsg({ t: e.message, bad: true }); }
  }
  function flash(t: string) { setMsg({ t }); setTimeout(() => setMsg(m => (m.t === t ? { t: '' } : m)), 1800); }
  function saveNote(withText: boolean) {
    const id = cap.save({ note: withText ? noteText.trim() : '', color, qid });
    if (id) { setNoteEdit(false); setNoteText(''); flash(withText ? 'Note saved.' : 'Highlight saved.'); try { navigator.vibrate?.(12); } catch { /* ignore */ } }
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
        md += `\n- **p. ${n.page_number || '?'}**${n.pin ? ' ★' : ''}${n.tags?.length ? ' · ' + n.tags.map(t => '#' + t).join(' ') : ''}\n`;
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

  return (
    <aside className={'refd' + (R.open ? ' on' : '') + (full ? ' full' : '')} aria-hidden={!R.open} aria-label="Reference PDF">
      <header className="refh">
        <div className="reft">
          {tab('pools', 'Pools')}{tab('viewer', 'PDF')}{tab('notes', 'Notes', forPdf.length)}
        </div>
        <span className="refn" title={pdf?.title || ''}>{pdf ? pdf.title : 'No PDF selected'}</span>
        <button className="ico" onClick={() => setFull(f => !f)} aria-label={full ? 'Smaller' : 'Full screen'} title={full ? 'Smaller' : 'Full screen'}>{full ? '⤡' : '⤢'}</button>
        <button className="ico" onClick={() => R.close()} aria-label="Hide reference PDF">✕</button>
      </header>

      <div className="refb" ref={body}>
        {/* viewer stays mounted; only its visibility changes, so the scroll position is kept */}
        <section className={'refv' + (R.view === 'viewer' ? ' show' : '')}>
          {pdf && (
            <div className="vbar" role="toolbar" aria-label="PDF tools">
              <button className="vb" onClick={() => viewer.current?.zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
              <button className="vb wide" onClick={() => viewer.current?.fit()} title="Fit to width">{Math.round(zoom * 100)}%</button>
              <button className="vb" onClick={() => viewer.current?.zoomBy(1.25)} aria-label="Zoom in">+</button>
              <span className="vsep" />
              <label className="pgbox" title="Go to page"><input type="number" min={1} max={page.total || undefined} value={page.n} aria-label="Page"
                onChange={ev => setPage(p => ({ ...p, n: +ev.target.value || 1 }))}
                onKeyDown={ev => { if (ev.key === 'Enter') { viewer.current?.scrollToPage(page.n); (ev.target as HTMLInputElement).blur(); } }} /><span>/ {page.total || '–'}</span></label>
              <span className="vsep" />
              <button className={'vb' + (findOn ? ' on' : '')} onClick={() => setFindOn(f => !f)} aria-label="Search in PDF" aria-pressed={findOn}>🔍</button>
              <button className={'vb' + (marker ? ' on' : '')} onClick={() => { setMarker(!marker); flash(!marker ? 'Marker on: selected text is highlighted automatically.' : 'Marker off.'); }} aria-label="Marker mode" aria-pressed={marker} title="Marker: auto-highlight whatever you select">🖍</button>
              <button className={'vb' + (night ? ' on' : '')} onClick={() => setNight(!night)} aria-label="Night mode" aria-pressed={night}>🌙</button>
            </div>
          )}
          {pdf && findOn && (
            <div className="findbar">
              <input autoFocus type="search" value={findQ} placeholder="Search in this PDF" onChange={ev => setFindQ(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') stepFind(ev.shiftKey ? -1 : 1); }} />
              <span className="fc">{finding ? '…' : findQ.trim().length < 2 ? '' : finds.length ? `${findIdx + 1}/${finds.length}` : 'none'}</span>
              <button className="vb" onClick={() => stepFind(-1)} disabled={!finds.length} aria-label="Previous">‹</button>
              <button className="vb" onClick={() => stepFind(1)} disabled={!finds.length} aria-label="Next">›</button>
              <button className="vb" onClick={() => setFindOn(false)} aria-label="Close search">✕</button>
            </div>
          )}
          {pdf && (q || auto) && (
            <div className="reftools">
              {auto && auto.state === 'working' && <span className="chipx soft">✨ Finding where this is explained…{idxPct !== undefined ? ` ${Math.round(idxPct * 100)}%` : ''}</span>}
              {auto && auto.state === 'ready' && auto.matches.length > 0 && (
                <span className="chipx">✨ Best match p. {auto.matches[auto.idx].page}
                  {auto.matches.length > 1 && <> · <button aria-label="Previous match" onClick={() => nextMatch(-1)}>‹</button> {auto.idx + 1}/{auto.matches.length} <button aria-label="Next match" onClick={() => nextMatch(1)}>›</button></>}
                </span>
              )}
              {auto && auto.state === 'nomatch' && <span className="chipx soft">No exact passage found</span>}
              {mapsHere.length > 0 && <span className="chipx">Mapped: p. {mapsHere[0].page_number}{own && <button aria-label="Remove mapping" onClick={() => R.deleteMapping(String(q!.id), mapsHere[0].id).catch(e => setMsg({ t: e.message, bad: true }))}>✕</button>}</span>}
              {mapsHere.length > 0 && R.target && <button className="ghost" onClick={() => viewer.current?.scrollToPage(mapsHere[0].page_number, mapsHere[0].highlight_data)}>Jump to source</button>}
              {own && q && <button className="ghost" disabled={!!R.busy} onPointerDown={ev => ev.preventDefault()} onClick={mapHere} title="Select the passage first to highlight it">📍 Map this question here</button>}
            </div>
          )}
          <PdfViewer ref={viewer} url={url} target={R.target} notes={forPdf} night={night}
            pending={cap.pending ? { page: cap.pending.page, rects: cap.pending.rects } : null}
            finds={finds} findIdx={findIdx}
            onZoom={setZoom} onNote={id => setPop(id)}
            onPage={(n, total) => setPage(p => (p.n === n && p.total === total ? p : { n, total }))} />
          {!pdf && R.view === 'viewer' && <div className="pdf-msg"><p>No document is open.</p><button className="solid" onClick={() => R.setView('pools')}>Choose from the pools</button></div>}
        </section>

        <section className={'refp' + (R.view === 'pools' ? ' show' : '')}>
          <CategoryPool section={q ? q.s : null} />
        </section>

        <section className={'refp' + (R.view === 'notes' ? ' show' : '')}>
          <div className="notehead">
            <div className="nsearch">
              <input type="search" value={nq} onChange={ev => setNq(ev.target.value)} placeholder="Search your notes" />
              <button className="ghost" onClick={pageNote} disabled={!pdf} title="Add a note to the page you are on">＋ Page note</button>
            </div>
            <div className="nfilters">
              {(['pdf', 'all', ...(q ? ['card'] : [])] as ('pdf' | 'all' | 'card')[]).map(sc => (
                <button key={sc} className={'chip' + (scope === sc ? ' on' : '')} onClick={() => setScope(sc)}>{sc === 'pdf' ? 'This PDF' : sc === 'all' ? 'All PDFs' : 'This card'}</button>
              ))}
              <button className={'chip' + (onlyPin ? ' on' : '')} onClick={() => setOnlyPin(!onlyPin)}>★ Pinned</button>
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
          {!list.length && <p className="info">{N.list(null).length ? 'No notes match these filters.' : <>No notes yet. In the PDF, select some text, then tap <b>Highlight</b> (or turn on the 🖍 marker to highlight as you select).</>}</p>}
        </section>

        {/* selection bar: pinned to the bottom, so the phone's own selection menu never covers it */}
        {cap.pending && R.view === 'viewer' && (
          <div className="selbar" onPointerDown={ev => { if (!(ev.target as HTMLElement).closest('textarea')) ev.preventDefault(); }}>
            <p className="selq">“{cap.pending.text.length > 90 ? cap.pending.text.slice(0, 90) + '…' : cap.pending.text}” <small>p. {cap.pending.page}</small></p>
            {noteEdit && <textarea autoFocus value={noteText} onChange={ev => setNoteText(ev.target.value)} placeholder="Your note (optional)" maxLength={4000} />}
            <div className="selrow">
              <Dots value={color} onPick={setColor} />
              {noteEdit
                ? <><button className="ghost" onClick={() => setNoteEdit(false)}>Back</button><button className="solid" onClick={() => saveNote(true)}>Save note</button></>
                : <><button className="solid" onClick={() => saveNote(false)}>Highlight</button><button className="ghost" onClick={() => setNoteEdit(true)}>＋ Note</button><button className="ghost" onClick={copySel} aria-label="Copy">⧉</button><button className="ghost" onClick={() => { cap.dismiss(); setNoteEdit(false); }} aria-label="Dismiss">✕</button></>}
            </div>
          </div>
        )}
        {/* tapped a saved highlight */}
        {popNote && !cap.pending && R.view === 'viewer' && (
          <div className="selbar notepop">
            {popNote.selected_text !== PAGE_NOTE && <p className="selq">“{popNote.selected_text.length > 120 ? popNote.selected_text.slice(0, 120) + '…' : popNote.selected_text}” <small>p. {popNote.page_number}</small></p>}
            <textarea key={popNote.id + popNote.updated_at} defaultValue={popNote.note_content} placeholder="Add your own note…" maxLength={4000}
              onBlur={ev => { if (ev.target.value !== popNote.note_content) notesStore().update(popNote.id, { note_content: ev.target.value }); }} />
            <div className="selrow">
              <Dots value={popNote.color || 'yellow'} onPick={c => notesStore().update(popNote.id, { color: c })} />
              <button className={'ghost' + (popNote.pin ? ' on' : '')} onClick={() => notesStore().update(popNote.id, { pin: !popNote.pin })} aria-label="Pin">★</button>
              <button className="ghost" onClick={() => { notesStore().remove(popNote.id); setPop(null); }} aria-label="Delete note">🗑</button>
              <button className="ghost" onClick={() => setPop(null)} aria-label="Close">✕</button>
            </div>
          </div>
        )}
        {(cap.error || msg.t) && R.view === 'viewer' && <p className={'refmsg' + ((cap.error || msg.bad) ? ' bad' : '')} role="status">{cap.error || msg.t}</p>}
      </div>
      <PdfChooserModal />
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
        <span className="sync" title={n.synced ? 'Backed up' : 'Waiting to back up'}>{n.synced ? '✓' : '⏳'}</span>
        <button className={'go mgr' + (n.pin ? ' on' : '')} aria-label="Pin note" onClick={() => st.update(n.id, { pin: !n.pin })}>{n.pin ? '★' : '☆'}</button>
        <button className="go mgr" aria-label="Delete note" onClick={() => st.remove(n.id)}>🗑</button>
      </div>
      {n.selected_text !== PAGE_NOTE && <blockquote>{n.selected_text}</blockquote>}
      <textarea id={'nt-' + n.id} key={n.id + n.updated_at} defaultValue={n.note_content} placeholder="Add your own note…" maxLength={4000}
        onBlur={ev => { if (ev.target.value !== n.note_content) st.update(n.id, { note_content: ev.target.value }); }} />
      <div className="ntags">
        <Dots value={n.color || 'yellow'} onPick={c => st.update(n.id, { color: c })} />
        {[...NOTE_TAGS, ...tags.filter(t => !(NOTE_TAGS as readonly string[]).includes(t))].map(t => (
          <button key={t} className={'chip sm' + (tags.includes(t) ? ' on' : '')} onClick={() => toggleTag(t)}>#{t}</button>
        ))}
        <input className="tagin" value={tagIn} placeholder="＋ tag" maxLength={24} onChange={ev => setTagIn(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') addTag(); }} onBlur={addTag} />
      </div>
    </div>
  );
}
