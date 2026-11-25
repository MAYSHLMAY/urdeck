'use client';
import { useEffect, useRef, useState } from 'react';
import { prepare } from '@/lib/articles/frame';
import { fetchRetry } from '@/lib/net';

/** Shows an article inside an isolated frame. The frame is sandboxed WITHOUT same-origin access, so the article's code cannot touch this app's storage, login or page. */
export function ArticleFrame({ src, html, title }: { src?: string; html?: string; title: string }) {
  const [doc, setDoc] = useState<string | null>(html != null ? prepare(html) : null), [ready, setReady] = useState(false), [err, setErr] = useState(''), [full, setFull] = useState(false), [try_, setTry] = useState(0);
  const ref = useRef<HTMLIFrameElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (html != null) { setDoc(prepare(html)); return; }
    if (!src) return;
    let off = false; setErr(''); setDoc(null); setReady(false);
    fetchRetry(src, {}, { ms: 25_000 }).then(async r => { if (!r.ok) throw new Error('missing'); const t = await r.text(); if (!off) setDoc(prepare(t)); })
      .catch(() => { if (!off) setErr('This article could not be loaded. It opens offline once you have read it online one time.'); });
    return () => { off = true; };
  }, [src, html, try_]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === ref.current?.contentWindow && e.data && e.data.ud === 'article' && e.data.t === 'ready') setReady(true); };
    addEventListener('message', on); return () => removeEventListener('message', on);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('ar-full-on', full);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); document.documentElement.classList.remove('ar-full-on'); };
  }, [full]);
  const toggle = () => {
    const next = !full; setFull(next);
    try { if (next) box.current?.requestFullscreen?.().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen(); } catch { /* the page-filling mode still works */ }
  };
  useEffect(() => { const f = () => { if (!document.fullscreenElement) setFull(false); }; document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  return (
    <div ref={box} className={'ar-box' + (full ? ' full' : '')}>
      <button type="button" className="ar-fs" onClick={toggle} aria-pressed={full}>{full ? 'Exit full screen' : 'Full screen'}</button>
      {!ready && !err && <div className="ar-sk" aria-hidden="true"><i /><i /><i /><i /></div>}
      {err && <div className="ar-err" role="alert"><p>{err}</p><button type="button" onClick={() => setTry(n => n + 1)}>Try again</button></div>}
      {doc != null && <iframe ref={ref} className="ar-frame" title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={doc} onLoad={() => setReady(true)} />}
    </div>
  );
}
