'use client';
import { useRef, useState } from 'react';
import { isOwner } from '@/lib/api';
import { canAddLocal, canUpload, MAX_PDF_MB, type Category, type PdfDoc } from '@/lib/refs';
import { Sheet, askPassword, ask, Ic } from './ui';
import { notes } from '@/lib/notes';
import { useRefs } from './refHooks';

const mb = (n: number | null) => (n ? (n / 1048576 >= 1 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '');

/* ---------- checkbox picker: the many-to-many link editor, used from both sides ---------- */
interface PickItem { id: string; label: string; sub?: string; checked: boolean }
function CheckPicker({ title, hint, items, onToggle, onClose }: { title: string; hint?: string; items: PickItem[]; onToggle: (id: string, on: boolean) => Promise<void>; onClose: () => void }) {
  const [err, setErr] = useState(''), [busy, setBusy] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} className="mini2">
      <div>
        <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
        {hint && <p className="n">{hint}</p>}
        <div className="pickl">
          {items.length ? items.map(it => (
            <label key={it.id} className="pickr">
              <input type="checkbox" checked={it.checked} disabled={busy === it.id}
                onChange={async ev => { const on = ev.target.checked; setBusy(it.id); setErr(''); try { await onToggle(it.id, on); } catch (e: any) { setErr(e.message); } setBusy(null); }} />
              <span>{it.label}{it.sub ? <small className="gm"> · {it.sub}</small> : null}</span>
            </label>
          )) : <p className="info">Nothing to show yet.</p>}
        </div>
        {err && <p className="n" style={{ color: 'var(--bad)' }}>{err}</p>}
        <div className="row"><button className="solid" onClick={onClose}>Done</button></div>
      </div>
    </Sheet>
  );
}

/* ---------- several documents match: let the reader choose one ---------- */
export function PdfChooserModal() {
  const R = useRefs(), c = R.chooser, [remember, setRemember] = useState(true);
  return (
    <Sheet open={!!c} onClose={() => R.dismissChooser()} className="mini2">
      {c && <div>
        <h3 style={{ margin: '0 0 6px' }}>{c.title}</h3>
        <p className="n">Which document do you want to open?</p>
        <div className="pickl">
          {c.pdfs.map(p => {
            const m = c.maps.find(x => x.pdf_id === p.id);
            return (
              <button key={p.id} className="pdfrow" onClick={() => R.choose(p.id, remember)}>
                <span className="ic"><Ic n="file" /></span>
                <span className="tx"><b>{p.title}</b><small>{[mb(p.file_size), m ? 'opens at page ' + m.page_number : ''].filter(Boolean).join(' · ')}</small></span>
              </button>
            );
          })}
        </div>
        {c.catId && <label className="pickr" style={{ marginTop: 8 }}><input type="checkbox" checked={remember} onChange={ev => setRemember(ev.target.checked)} /><span>Remember my choice for this category</span></label>}
        <div className="row"><button className="ghost" onClick={() => R.dismissChooser()}>Cancel</button></div>
      </div>}
    </Sheet>
  );
}

/**
 * Category pool selector + link manager.
 * Categories are drawn as pools whose water level shows how many PDFs they hold. Selecting one lists its documents.
 */
export function CategoryPool({ section }: { section: string | null }) {
  const R = useRefs(), own = isOwner(), up = canUpload();
  const [err, setErr] = useState(''), [info, setInfo] = useState('');
  const [picker, setPicker] = useState<null | { kind: 'pdfCats'; pdf: PdfDoc } | { kind: 'catPdfs'; cat: Category } | { kind: 'myCats'; pdf: PdfDoc }>(null);
  const [nm, setNm] = useState(''), [color, setColor] = useState('#3b82f6');
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(''), [upCats, setUpCats] = useState<Set<string>>(new Set());
  const fileEl = useRef<HTMLInputElement>(null);
  const [lf, setLf] = useState<File | null>(null), [lt, setLt] = useState(''), [lc, setLc] = useState<Set<string>>(new Set()), lel = useRef<HTMLInputElement>(null);

  const act = async (f: () => Promise<unknown>, ok = '') => { setErr(''); setInfo(''); try { await f(); if (ok) setInfo(ok); } catch (e: any) { setErr(e.message || 'Something went wrong.'); } };
  const maxN = Math.max(1, ...R.categories.map(c => R.pdfsOf(c.id).length));
  const sel = R.category(R.catId), docs = sel ? R.pdfsOf(sel.id) : [];

  if (R.loading && !R.loaded) return <p className="pdf-msg">Loading the reference library…</p>;

  return (
    <div className="pools-wrap">
      {R.error && <p className="n" style={{ color: 'var(--bad)' }}>{R.error} <button className="ghost" onClick={() => R.load(true)}>Retry</button></p>}
      <p className="n" style={{ margin: '2px 0 8px' }}>Pick a subject pool. Its linked PDFs open in the reader.</p>

      <div className="pools">
        {R.categories.map(c => {
          const n = R.pdfsOf(c.id).length;
          return (
            <button key={c.id} className={'pool' + (R.catId === c.id ? ' on' : '')} style={{ ['--c' as any]: c.color_theme, ['--lvl' as any]: (n ? 22 + 62 * n / maxN : 10) + '%' }}
              onClick={() => R.selectCategory(c.id, false)} aria-pressed={R.catId === c.id}>
              <span className="water"><span className="wv" /><span className="wv w2" /></span>
              <span className="pn"><b>{c.name}</b><small>{n} PDF{n === 1 ? '' : 's'}</small></span>
            </button>
          );
        })}
        {!R.categories.length && <p className="info">No categories yet.{own ? ' Create the first one below.' : ' The owner has not created any yet.'}</p>}
      </div>

      {sel && (
        <div className="poold">
          <div className="poolh">
            <span className="dot" style={{ background: sel.color_theme }} /><b>{sel.name}</b>
            {docs.length > 1 && <button className="ghost" onClick={() => R.selectCategory(sel.id)}>Open…</button>}
          </div>
          {section && own && (
            <label className="pickr"><input type="checkbox" checked={R.sectionsOf(sel.id).includes(section)} onChange={ev => act(() => R.setSectionLink(sel.id, section, ev.target.checked))} />
              <span>Use this pool for the current card set <small className="gm">(opens it automatically from those cards)</small></span></label>
          )}
          {docs.map(p => (
            <div className="pdfrow" key={p.id}>
              <button className="pdfopen" onClick={() => R.openPdf(p.id, 1, null, sel.id)}>
                <span className="ic"><Ic n="file" /></span><span className="tx"><b>{p.title}</b><small>{mb(p.file_size)}{R.catsOf(p.id).length > 1 ? ` · in ${R.catsOf(p.id).length} pools` : ''}</small></span>
              </button>
              {own && !p.local && <button className="go mgr" aria-label="Pools for this PDF" title="Pools for this PDF" onClick={() => setPicker({ kind: 'pdfCats', pdf: p })}><Ic n="layers" /></button>}
              {own && !p.local && <button className="go mgr" aria-label="Delete PDF" title="Delete PDF" onClick={async () => { const pw = await askPassword(`Delete “${p.title}”?`, 'This removes the PDF for everyone. Enter the owner password.'); if (pw) act(() => R.deletePdf(p.id, pw), 'PDF deleted.'); }}><Ic n="trash" /></button>}
            </div>
          ))}
          {!docs.length && <p className="info">No PDFs in this pool yet.</p>}
          {own && <div className="row">
            <button className="ghost" onClick={() => setPicker({ kind: 'catPdfs', cat: sel })}>Link existing PDFs…</button>
            <button className="ghost" onClick={async () => { const pw = await askPassword(`Delete the pool “${sel.name}”?`, 'Its PDFs stay in the library; models are unlinked. Enter the owner password.'); if (pw) act(() => R.deleteCategory(sel.id, pw)); }}>Delete pool</button>
          </div>}
        </div>
      )}

      {up && (
        <details className="mgbox">
          <summary>Upload a PDF</summary>
          <p className="n">PDFs are shared with everyone using the app. Up to {MAX_PDF_MB} MB.</p>
          <input ref={fileEl} type="file" accept="application/pdf,.pdf" onChange={ev => { const f = ev.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.pdf$/i, '')); }} />
          <input type="text" className="fld" placeholder="Title" value={title} onChange={ev => setTitle(ev.target.value)} maxLength={200} />
          {R.categories.length > 0 && <div className="pickl small">
            <p className="n" style={{ margin: 0 }}>Add to pools:</p>
            {R.categories.map(c => (
              <label key={c.id} className="pickr"><input type="checkbox" checked={upCats.has(c.id)} onChange={ev => { const s = new Set(upCats); ev.target.checked ? s.add(c.id) : s.delete(c.id); setUpCats(s); }} /><span>{c.name}</span></label>
            ))}
          </div>}
          <div className="row">
            <button className="solid" disabled={!file || !!R.busy} onClick={() => file && act(async () => {
              const ids = upCats.size ? [...upCats] : (sel ? [sel.id] : []);
              await R.uploadPdf(file, title, ids); setFile(null); setTitle(''); setUpCats(new Set()); if (fileEl.current) fileEl.current.value = '';
            }, 'PDF uploaded.')}>{R.busy === 'Uploading…' ? 'Uploading…' : 'Upload'}</button>
          </div>
        </details>
      )}
      {canAddLocal() && (
        <details className="mgbox" open={R.localPdfs.length > 0}>
          <summary>My PDFs <small className="gm">· only on this device</small></summary>
          <p className="n">These files are stored on this device (phone or computer) and are <b>never uploaded</b>. Notes you take on them stay here too.</p>
          {R.localPdfs.map(p => (
            <div key={p.id}>
              <div className="pdfrow">
                <button className="pdfopen" onClick={() => R.openPdf(p.id, 1, null, null)}>
                  <span className="ic"><Ic n="file" /></span><span className="tx"><b>{p.title}</b><small>{mb(p.file_size)} · on this device</small></span>
                </button>
                <button className="go mgr" aria-label="Pools for this PDF" title="Show in pools" onClick={() => setPicker({ kind: 'myCats', pdf: p })}><Ic n="layers" /></button>
                <button className="go mgr" aria-label="Remove PDF" title="Remove from this device" onClick={async () => { const r = await ask({ title: `Remove “${p.title}”?`, msg: 'It is deleted from this device only, together with your notes on it.', acts: [{ k: 'ok', l: 'Remove from this device' }] }); if (r && r.act) { notes().list(p.id).forEach(n => notes().remove(n.id)); await R.deleteLocalPdf(p.id); setInfo('Removed from this device.'); } }}><Ic n="trash" /></button>
              </div>
              {section && <label className="pickr"><input type="checkbox" checked={R.localSecs.some(l => l.pdf_id === p.id && l.section === section)} onChange={ev => R.setLocalSection(p.id, section, ev.target.checked)} /><span>Open this for the current card set <small className="gm">(finds the matching page automatically)</small></span></label>}
            </div>
          ))}
          <input ref={lel} type="file" accept="application/pdf,.pdf" onChange={ev => { const f = ev.target.files?.[0] || null; setLf(f); if (f && !lt) setLt(f.name.replace(/\.pdf$/i, '')); }} />
          <input type="text" className="fld" placeholder="Title" value={lt} onChange={ev => setLt(ev.target.value)} maxLength={200} />
          {R.categories.length > 0 && <div className="pickl small">
            <p className="n" style={{ margin: 0 }}>Show in pools (optional):</p>
            {R.categories.map(c => (
              <label key={c.id} className="pickr"><input type="checkbox" checked={lc.has(c.id)} onChange={ev => { const s = new Set(lc); ev.target.checked ? s.add(c.id) : s.delete(c.id); setLc(s); }} /><span>{c.name}</span></label>
            ))}
          </div>}
          <div className="row">
            <button className="solid" disabled={!lf || !!R.busy} onClick={() => lf && act(async () => {
              const d = await R.addLocalPdf(lf, lt, [...lc]); setLf(null); setLt(''); setLc(new Set()); if (lel.current) lel.current.value = ''; R.openPdf(d.id, 1, null, null);
            }, 'Saved on this device.')}>Save on this device</button>
          </div>
        </details>
      )}
      {!up && !own && <p className="n">Shared PDFs are added by the owner. Your own PDFs go in <b>My PDFs</b> above.</p>}

      {own && (
        <details className="mgbox">
          <summary>New pool</summary>
          <input type="text" className="fld" placeholder="Pool name, e.g. Aerodynamics" value={nm} onChange={ev => setNm(ev.target.value)} maxLength={60}/>
          <div className="row" style={{ alignItems: 'center' }}>
            <input type="color" value={color} onChange={ev => setColor(ev.target.value)} aria-label="Pool colour" style={{ width: 44, height: 36, padding: 0, border: 0, background: 'none' }} />
            <button className="solid" disabled={!nm.trim() || !!R.busy} onClick={() => act(async () => { const c = await R.addCategory(nm, color); setNm(''); R.selectCategory(c.id, false); }, 'Pool created.')}>Create pool</button>
          </div>
        </details>
      )}

      {(err || info) && <p className="n" style={{ color: err ? 'var(--bad)' : 'var(--ok)' }} role="status">{err || info}</p>}

      {picker && picker.kind === 'pdfCats' && (
        <CheckPicker title={`Pools for “${picker.pdf.title}”`} hint="One PDF can live in several pools."
          items={R.categories.map(c => ({ id: c.id, label: c.name, checked: R.catsOf(picker.pdf.id).includes(c.id) }))}
          onToggle={(id, on) => R.setLink(id, picker.pdf.id, on)} onClose={() => setPicker(null)} />
      )}
      {picker && picker.kind === 'myCats' && (
        <CheckPicker title={`Pools for “${picker.pdf.title}”`} hint="Only on this device. Other people never see this link."
          items={R.categories.map(c => ({ id: c.id, label: c.name, checked: R.catsOf(picker.pdf.id).includes(c.id) }))}
          onToggle={async (id, on) => R.setLocalLink(id, picker.pdf.id, on)} onClose={() => setPicker(null)} />
      )}
      {picker && picker.kind === 'catPdfs' && (
        <CheckPicker title={`PDFs in “${picker.cat.name}”`} hint="One pool can hold several PDFs."
          items={R.pdfs.map(p => ({ id: p.id, label: p.title, sub: mb(p.file_size), checked: R.catsOf(p.id).includes(picker.cat.id) }))}
          onToggle={(id, on) => R.setLink(picker.cat.id, id, on)} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}
