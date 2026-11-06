'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isOwner } from '@/lib/api';
import { notes as notesStore } from '@/lib/notes';
import type { QCard } from '@/lib/types';
import { PdfViewer, type PdfViewerHandle } from './PdfViewer';
import { CategoryPool, PdfChooserModal } from './CategoryPool';
import { useNoteCapture, useNotesStore, useRefs } from './refHooks';

const boxOf = (rs: { x: number; y: number; width: number; height: number }[]) => {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.width)), y1 = Math.max(...rs.map(r => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

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
  const [msg, setMsg] = useState<{ t: string; bad?: boolean }>({ t: '' });
  const [noteEdit, setNoteEdit] = useState(false), [noteText, setNoteText] = useState('');
  const [allNotes, setAllNotes] = useState(false);
  const own = isOwner();

  const pdf = R.pdf(R.pdfId), url = R.url(pdf);
  const cap = useNoteCapture(body, pdf ? pdf.id : null, R.open && R.view === 'viewer');
  const list = useMemo(() => N.list(allNotes ? null : pdf?.id || '__none__'), [N.ver, pdf?.id, allNotes]); // eslint-disable-line
  const forPdf = useMemo(() => N.list(pdf?.id || '__none__'), [N.ver, pdf?.id]); // eslint-disable-line

  /* first open: mount the panel and start the local note store */
  useEffect(() => { if (R.open && !mounted) { setMounted(true); notesStore().start(); } }, [R.open, mounted]);
  /* layout class on <body> so the quiz makes room */
  useEffect(() => { document.body.classList.toggle('ref-open', R.open); return () => document.body.classList.remove('ref-open'); }, [R.open]);
  /* the card changed while the panel is open: re-run auto-matching */
  useEffect(() => { if (R.open) R.resolve(q); /* eslint-disable-next-line */ }, [q?.id]);
  /* Esc closes the panel when nothing else is open */
  useEffect(() => {
    const f = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && R.open && !document.querySelector('dialog[open]')) R.close(); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [R]);
  useEffect(() => { setMsg({ t: '' }); setNoteEdit(false); setNoteText(''); }, [pdf?.id]);

  if (!mounted) return null;

  const mapsHere = q && pdf ? R.mapsCached(String(q.id)).filter(m => m.pdf_id === pdf.id) : [];
  const status = N.status === 'offline' ? 'Offline: notes are saved on this device and will sync later.'
    : N.status === 'error' ? 'Cloud backup failed (' + N.lastError + '). Notes are safe on this device; retrying.'
    : N.status === 'syncing' ? 'Backing up…' : !N.syncOn ? 'Cloud backup is off. Notes stay on this device.' : N.pending ? N.pending + ' waiting to back up.' : 'All notes backed up.';

  async function mapHere() {
    if (!q || !pdf) return;
    const s = cap.recent();
    const pg = s ? s.page : viewer.current?.currentPage() || 1;
    try { await R.setMapping(String(q.id), pdf.id, pg, s ? s.box : null); setMsg({ t: `Saved: this question now opens page ${pg}${s ? ' with the passage highlighted' : ''}.` }); }
    catch (e: any) { setMsg({ t: e.message, bad: true }); }
  }
  function saveNote(withText: boolean) {
    const id = cap.save(withText ? noteText.trim() : '');
    if (id) { setNoteEdit(false); setNoteText(''); setMsg({ t: 'Note saved.' }); setTimeout(() => setMsg(m => (m.t === 'Note saved.' ? { t: '' } : m)), 1600); }
  }

  const tab = (v: 'viewer' | 'pools' | 'notes', label: string, n?: number) => (
    <button className={R.view === v ? 'on' : ''} onClick={() => R.setView(v)} aria-pressed={R.view === v}>{label}{n ? <small> {n}</small> : null}</button>
  );

  return (
    <aside className={'refd' + (R.open ? ' on' : '')} aria-hidden={!R.open} aria-label="Reference PDF">
      <header className="refh">
        <div className="reft">
          {tab('pools', 'Pools')}{tab('viewer', 'PDF')}{tab('notes', 'Notes', forPdf.length)}
        </div>
        <span className="refn" title={pdf?.title || ''}>{pdf ? pdf.title : 'No PDF selected'}{pdf && R.view === 'viewer' && page.total ? ` · p. ${page.n}/${page.total}` : ''}</span>
        <button className="ico" onClick={() => R.close()} aria-label="Hide reference PDF">✕</button>
      </header>

      <div className="refb" ref={body}>
        {/* viewer stays mounted; only its visibility changes, so the scroll position is kept */}
        <section className={'refv' + (R.view === 'viewer' ? ' show' : '')}>
          {R.view === 'viewer' && (q || pdf) && pdf && (
            <div className="reftools">
              {mapsHere.length > 0 && <span className="chipx">Mapped: p. {mapsHere[0].page_number}{own && <button aria-label="Remove mapping" onClick={() => R.deleteMapping(String(q!.id), mapsHere[0].id).catch(e => setMsg({ t: e.message, bad: true }))}>✕</button>}</span>}
              {mapsHere.length > 0 && R.target && <button className="ghost" onClick={() => viewer.current?.scrollToPage(mapsHere[0].page_number, mapsHere[0].highlight_data)}>Jump to source</button>}
              {own && q && <button className="ghost" disabled={!!R.busy} onPointerDown={ev => ev.preventDefault()} onClick={mapHere} title="Select the passage first to highlight it">📍 Map this question here</button>}
            </div>
          )}
          <PdfViewer ref={viewer} url={url} target={R.target} notes={forPdf} onPage={(n, total) => setPage(p => (p.n === n && p.total === total ? p : { n, total }))} />
          {!pdf && R.view === 'viewer' && <div className="pdf-msg"><p>No document is open.</p><button className="solid" onClick={() => R.setView('pools')}>Choose from the pools</button></div>}
        </section>

        <section className={'refp' + (R.view === 'pools' ? ' show' : '')}>
          <CategoryPool section={q ? q.s : null} />
        </section>

        <section className={'refp' + (R.view === 'notes' ? ' show' : '')}>
          <div className="notehead">
            <label className="pickr"><input type="checkbox" checked={N.syncOn} onChange={ev => N.setSync(ev.target.checked)} /><span>Back up notes to the cloud</span></label>
            <p className="n" role="status">{status}</p>
            <div className="row">
              <button className="ghost" onClick={() => N.syncNow()} disabled={!N.syncOn || N.status === 'syncing'}>Sync now</button>
              <button className={'chip' + (allNotes ? ' on' : '')} onClick={() => setAllNotes(!allNotes)}>{allNotes ? 'All PDFs' : 'This PDF'}</button>
            </div>
          </div>
          {list.map(n => {
            const p = R.pdf(n.pdf_id);
            return (
              <div className="nrow" key={n.id}>
                <div className="nmeta">
                  <button className="ghost" disabled={!p} onClick={() => p && R.openPdf(p.id, n.page_number || 1, boxOf(n.rects))}>
                    {p ? (allNotes ? p.title + ' · ' : '') + 'p. ' + (n.page_number || '?') : '(PDF removed)'}
                  </button>
                  <span className="sync" title={n.synced ? 'Backed up' : 'Waiting to back up'}>{n.synced ? '✓' : '⏳'}</span>
                  <button className="go mgr" aria-label="Delete note" onClick={() => notesStore().remove(n.id)}>🗑</button>
                </div>
                <blockquote>{n.selected_text}</blockquote>
                <textarea key={n.id + n.updated_at} defaultValue={n.note_content} placeholder="Add your own note…" maxLength={4000}
                  onBlur={ev => { if (ev.target.value !== n.note_content) notesStore().update(n.id, { note_content: ev.target.value }); }} />
              </div>
            );
          })}
          {!list.length && <p className="info">No notes yet. In the PDF, select some text and tap <b>Save note</b>.</p>}
        </section>

        {/* floating bubble over a text selection: save instantly */}
        {cap.pending && R.view === 'viewer' && (
          <div className="selbub" style={{ top: cap.pending.anchor.top, left: cap.pending.anchor.left }} onPointerDown={ev => { if (!(ev.target as HTMLElement).closest('textarea')) ev.preventDefault(); }}>
            {noteEdit ? <>
              <textarea autoFocus value={noteText} onChange={ev => setNoteText(ev.target.value)} placeholder="Your note (optional)" maxLength={4000} />
              <div className="row"><button className="ghost" onClick={() => setNoteEdit(false)}>Back</button><button className="solid" onClick={() => saveNote(true)}>Save</button></div>
            </> : <div className="row">
              <button className="solid" onClick={() => saveNote(false)}>💾 Save note</button>
              <button className="ghost" onClick={() => setNoteEdit(true)}>＋ Add text</button>
            </div>}
          </div>
        )}
        {(cap.error || msg.t) && R.view === 'viewer' && <p className={'refmsg' + ((cap.error || msg.bad) ? ' bad' : '')} role="status">{cap.error || msg.t}</p>}
      </div>
      <PdfChooserModal />
    </aside>
  );
}
