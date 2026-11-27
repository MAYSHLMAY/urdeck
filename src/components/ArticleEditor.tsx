'use client';
import { useRef, useState } from 'react';
import { ArticleFrame } from './ArticleFrame';
import { OfflineCheck } from './OfflineCheck';

/** Edit an article's HTML directly. The preview runs in the safe frame. Nothing is saved until Save is pressed. */
export function ArticleEditor({ title, html, saveLabel, note, onSave, onClose }: {
  title: string; html: string; saveLabel: string; note?: string; onSave: (html: string) => Promise<void>; onClose: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null), [tab, setTab] = useState<'edit' | 'preview'>('edit'), [dirty, setDirty] = useState(false), [prev, setPrev] = useState(html), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [ask, setAsk] = useState(false);
  const [f, setF] = useState(''), [r, setR] = useState(''), [stat, setStat] = useState(() => ({ lines: html.split('\n').length, kb: Math.round(html.length / 1024) }));
  const cur = () => ta.current?.value ?? html;
  const touch = () => { setDirty(true); const v = cur(); setStat({ lines: v.split('\n').length, kb: Math.round(v.length / 1024) }); };
  const count = f ? cur().split(f).length - 1 : 0;
  const replaceAll = () => { if (!f || !ta.current) return; const n = cur().split(f).length - 1; if (!n) { setMsg('Nothing found.'); return; } ta.current.value = cur().split(f).join(r); touch(); setMsg('Replaced ' + n + '.'); };
  const find = () => { const t = ta.current; if (!t || !f) return; const i = t.value.indexOf(f, t.selectionEnd || 0), j = i < 0 ? t.value.indexOf(f) : i; if (j < 0) { setMsg('Nothing found.'); return; } t.focus(); t.setSelectionRange(j, j + f.length); const before = t.value.slice(0, j).split('\n').length; t.scrollTop = Math.max(0, (before - 4) * 18); setMsg(''); };
  const save = async () => { const v = cur(); if (v.trim().length < 20) { setMsg('The page is empty.'); return; } setBusy(true); setMsg(''); try { await onSave(v); } catch (e: any) { setMsg(e?.message || 'Could not save.'); setBusy(false); } };
  return (
    <div className="ad ae" role="dialog" aria-modal="true" aria-label={'Edit ' + title}>
      <header className="ad-top"><div><b>Edit “{title}”</b><small>{stat.lines} lines · {stat.kb} KB{dirty ? ' · not saved yet' : ''}</small></div>
        <button type="button" className="ad-x" onClick={() => (dirty && !ask ? setAsk(true) : onClose())}>{ask ? 'Discard changes' : 'Close'}</button></header>
      <div className="ad-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>HTML</button>
        <button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => { setPrev(cur()); setTab('preview'); }}>Preview</button>
      </div>
      <div className="ae-body" hidden={tab !== 'edit'}>
        <div className="ae-find"><input placeholder="Find" value={f} onChange={e => { setF(e.target.value); setMsg(''); }} aria-label="Find" /><input placeholder="Replace with" value={r} onChange={e => setR(e.target.value)} aria-label="Replace with" />
          <button type="button" onClick={find} disabled={!f}>Find{f ? ' (' + count + ')' : ''}</button><button type="button" onClick={replaceAll} disabled={!f}>Replace all</button></div>
        <textarea ref={ta} className="ae-ta" defaultValue={html} onInput={touch} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" aria-label="Page HTML" />
      </div>
      {tab === 'preview' && <div className="ad-prev"><ArticleFrame html={prev} title="Preview" /></div>}
      <footer className="ad-foot">
        {tab === 'preview' && <OfflineCheck html={prev} />}
        {(msg || note) && <p role="status">{msg || note}</p>}
        <div><button type="button" className="ad-go" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : saveLabel}</button><button type="button" onClick={onClose}>Cancel</button></div>
      </footer>
    </div>
  );
}
