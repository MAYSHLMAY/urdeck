'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { myAll, myList, myPut, myDelete, myReplace, myUndo, MAX_BYTES } from '@/lib/articles/local';
import { titleOf } from '@/lib/articles/frame';
import { diff, kept, identical, looksLikeUpdate, type Op, type Summary } from '@/lib/articles/diff';
import { fetchRetry } from '@/lib/net';
import { ArticleDiff } from './ArticleDiff';
import type { LocalMeta } from '@/lib/articles/types';

type Pub = { slug: string; title: string; url: string };
type Pending = { html: string; title: string; target: { kind: 'mine' | 'public'; id: string; title: string }; ops: Op[]; sum: Summary; byName: boolean };
const tick = () => new Promise<void>(r => setTimeout(r, 30));   // lets "Comparing..." paint before the heavy work

/** Pages the person adds for themselves. Stored only on this device, never uploaded.
 *  Adding a file that is mostly the same as one already here is treated as an update: the changes are shown and the person chooses. */
export function MyArticles({ pub = [] }: { pub?: Pub[] }) {
  const [list, setList] = useState<LocalMeta[] | null>(null), [msg, setMsg] = useState(''), [sure, setSure] = useState(''), [busy, setBusy] = useState(false), [pend, setPend] = useState<Pending | null>(null);
  const inp = useRef<HTMLInputElement>(null), target = useRef<string | null>(null);
  const load = () => myList().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const pick = (forId: string | null) => { target.current = forId; inp.current?.click(); };
  const addNew = async (html: string, title: string) => { await myPut({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, added: Date.now(), bytes: html.length, html, version: 1 }); };

  const add = async (f: File | undefined) => {
    const forced = target.current; target.current = null;
    if (!f) return; setMsg('');
    if (!/\.(html?|txt)$/i.test(f.name)) { setMsg('Choose an .html file.'); return; }
    if (f.size > MAX_BYTES) { setMsg('That file is too big. The limit is 6 MB.'); return; }
    setBusy(true);
    try {
      let html = await f.text();
      if (/\.txt$/i.test(f.name)) html = '<title>' + f.name + '</title><body style="font:17px/1.6 system-ui;max-width:42rem;margin:auto;padding:20px;white-space:pre-wrap">' + html.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</body>';
      const title = titleOf(html, f.name);
      await tick();
      const mine = await myAll();
      const cands: { kind: 'mine' | 'public'; id: string; title: string; html: string }[] = mine.filter(a => !forced || a.id === forced).map(a => ({ kind: 'mine', id: a.id, title: a.title, html: a.html }));
      if (!forced) for (const p of pub) { try { const r = await fetchRetry(p.url, {}, { ms: 20_000, tries: 2 }); if (r.ok) cands.push({ kind: 'public', id: p.slug, title: p.title, html: await r.text() }); } catch { /* offline: compare with what is here */ } }
      let best: Pending | null = null, bestKept = -1;
      for (const c of cands) {
        await tick(); const d = diff(c.html, html), k = kept(d.sum);
        if (identical(d.sum)) { setMsg('That file is the same as “' + c.title + '”, so there is nothing to update.'); return; }
        if (k > bestKept && (forced || looksLikeUpdate(d.sum))) { bestKept = k; best = { html, title, target: { kind: c.kind, id: c.id, title: c.title }, ops: d.ops, sum: d.sum, byName: !!forced }; }
      }
      if (best) { setPend(best); return; }
      await addNew(html, title); setMsg('Added as a new article. It stays on this device.'); load();
    } catch { setMsg('Could not save it on this device. Free some space and try again.'); }
    finally { setBusy(false); }
  };
  const done = (m: string) => { setPend(null); setMsg(m); load(); };
  return (
    <section className="ar-mine" aria-labelledby="ar-mine-h">
      <h2 id="ar-mine-h">My articles</h2>
      <p className="ar-note">Add a page of your own to read here. Only you can see it. It is saved on this device and is never uploaded. If the file is mostly the same as one you already have, even with a different name, you will see what changed and can replace it.</p>
      <input ref={inp} type="file" accept=".html,.htm,.txt,text/html,text/plain" hidden onChange={e => { add(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className="ar-add" disabled={busy} onClick={() => pick(null)}>{busy ? 'Comparing…' : 'Add an article from a file'}</button>
      {msg && <p className="ar-msg" role="status">{msg}</p>}
      {list && list.length > 0 && <ul className="ar-ml">
        {list.map(a => (
          <li key={a.id}>
            <Link href={'/articles/mine/?id=' + encodeURIComponent(a.id)}><b>{a.title}{a.version > 1 && <i className="ar-ver">v{a.version}</i>}</b><small>{Math.max(1, Math.round(a.bytes / 1024))} KB · {a.updated ? 'updated ' + new Date(a.updated).toLocaleDateString() : 'added ' + new Date(a.added).toLocaleDateString()}</small></Link>
            <span className="ar-acts">
              <button type="button" disabled={busy} onClick={() => pick(a.id)}>Update from file</button>
              {a.hasPrev && <button type="button" onClick={async () => { await myUndo(a.id).catch(() => {}); done('Went back to the previous version.'); }}>Undo update</button>}
              <button type="button" className={sure === a.id ? 'sure' : ''} onClick={async () => { if (sure !== a.id) { setSure(a.id); setTimeout(() => setSure(s => (s === a.id ? '' : s)), 3000); return; } await myDelete(a.id).catch(() => {}); setSure(''); load(); }}>{sure === a.id ? 'Tap again to remove' : 'Remove'}</button>
            </span>
          </li>
        ))}
      </ul>}
      {pend && <ArticleDiff oldTitle={pend.target.title} newTitle={pend.title} ops={pend.ops} sum={pend.sum} newHtml={pend.html} isPublic={pend.target.kind === 'public'} byName={pend.byName}
        onCancel={() => setPend(null)}
        onAddNew={async () => { try { await addNew(pend.html, pend.title); done('Added as a new article.'); } catch { done('Could not save it on this device.'); } }}
        onReplace={async () => { try { const ok = await myReplace(pend.target.id, pend.html, pend.title); done(ok ? 'Replaced. The old version is kept, tap Undo update to go back.' : 'That article is gone, nothing was replaced.'); } catch { done('Could not save it on this device.'); } }} />}
    </section>
  );
}
