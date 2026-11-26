'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { pubList, pubHtml, pubSync, publish, type PubMeta } from '@/lib/articles/public';
import { isOwner } from '@/lib/api';
import { titleOf } from '@/lib/articles/frame';
import { slugOf, validSlug } from '@/lib/articles/meta';
import { diff, kept, identical, looksLikeUpdate, type Op, type Summary } from '@/lib/articles/diff';
import { MyArticles } from './MyArticles';
import { ArticleDiff } from './ArticleDiff';

const hue = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7);
const MAX = 6 * 1024 * 1024;
type Draft = { html: string; title: string; slug: string; summary: string };

/** The Articles page body: articles the owner has published (open to everyone), the owner's publish tool, and each person's private articles. */
export function ArticlesHome() {
  const [list, setList] = useState<PubMeta[] | null>(null), [owner, setOwner] = useState(false), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Draft | null>(null), [cmp, setCmp] = useState<{ d: Draft; slug: string; title: string; ops: Op[]; sum: Summary } | null>(null);
  const inp = useRef<HTMLInputElement>(null);
  const load = () => pubList().then(l => { setList(l); pubSync(l); });
  useEffect(() => { load(); setOwner(isOwner()); }, []);

  const choose = async (f: File | undefined) => {
    if (!f) return; setMsg('');
    if (!/\.html?$/i.test(f.name)) { setMsg('Choose an .html file.'); return; }
    if (f.size > MAX) { setMsg('That file is too big. The limit is 6 MB.'); return; }
    setBusy(true);
    try {
      const html = await f.text(), title = titleOf(html, f.name), d: Draft = { html, title, slug: slugOf(title), summary: '' };
      let best: typeof cmp = null, bk = -1;
      for (const p of list || []) {
        await new Promise(r => setTimeout(r, 30));
        const r = await pubHtml(p.slug); if (!r) continue;
        const x = diff(r.html, html), k = kept(x.sum);
        if (identical(x.sum)) { setMsg('That file is the same as “' + p.title + '”. Nothing to update.'); return; }
        if (looksLikeUpdate(x.sum) && k > bk) { bk = k; best = { d: { ...d, slug: p.slug, title: p.title, summary: p.summary }, slug: p.slug, title: p.title, ops: x.ops, sum: x.sum }; }
      }
      if (best) setCmp(best); else setForm(d);
    } catch { setMsg('Could not read that file.'); } finally { setBusy(false); }
  };
  const go = async (d: Draft) => {
    if (!validSlug(d.slug)) { setMsg('The address needs 3 to 60 letters, numbers or dashes.'); return; }
    setBusy(true); setMsg('');
    try { const r = await publish({ slug: d.slug, title: d.title, summary: d.summary, html: d.html }); setForm(null); setCmp(null); setMsg(r.version > 1 ? 'Replaced for everyone (version ' + r.version + ').' : 'Published. Everyone can open it now.'); load(); }
    catch (e: any) { setMsg(e?.message || 'Could not publish.'); } finally { setBusy(false); }
  };
  const exists = !!form && !!list?.some(p => p.slug === form.slug);
  return (<>
    <h2 className="ar-sec">Published</h2>
    {list && !list.length && <p className="ar-note">Nothing published yet.</p>}
    <ul className="ar-g">
      {(list || []).map(a => (
        <li key={a.slug}>
          <a href={'/articles/open?slug=' + encodeURIComponent(a.slug)} className="ar-c" style={{ ['--h' as any]: hue(a.slug) }}>
            <span className="ar-cov" aria-hidden="true"><b>{a.title.slice(0, 1)}</b></span>
            <span className="ar-t"><b>{a.title}</b>{a.summary && <span>{a.summary}</span>}<small>{a.reading_minutes} min read · Interactive{a.version > 1 ? ' · updated' : ''}</small></span>
          </a>
        </li>
      ))}
    </ul>
    {owner && <section className="ar-mine" aria-label="Owner tools">
      <h2>Publish for everyone</h2>
      <p className="ar-note">Owner only. Choose an .html page. Everyone can then open it and use it. If it is mostly the same as a published article, you will see what changed and can replace it.</p>
      <input ref={inp} type="file" accept=".html,.htm,text/html" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className="ar-add" disabled={busy} onClick={() => inp.current?.click()}>{busy ? 'Working…' : 'Publish an .html article'}</button>
      {msg && <p className="ar-msg" role="status">{msg}</p>}
    </section>}
    {!owner && msg && <p className="ar-msg" role="status">{msg}</p>}
    {form && <div className="ad" role="dialog" aria-modal="true" aria-label="Publish article">
      <header className="ad-top"><div><b>Publish a new article</b><small>Everyone will be able to open it.</small></div><button type="button" className="ad-x" onClick={() => setForm(null)}>Close</button></header>
      <div className="ar-form">
        <label>Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} maxLength={160} /></label>
        <label>Address<input value={form.slug} onChange={e => setForm({ ...form, slug: slugOf(e.target.value) })} maxLength={60} /></label>
        {exists && <p className="ar-note">This address already exists. Publishing will replace that article.</p>}
        <label>Short description (optional)<textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} maxLength={600} rows={3} /></label>
      </div>
      <footer className="ad-foot"><div><button type="button" className="ad-go" disabled={busy || !form.title.trim()} onClick={() => go(form)}>{exists ? 'Replace for everyone' : 'Publish'}</button><button type="button" onClick={() => setForm(null)}>Cancel</button></div></footer>
    </div>}
    {cmp && <ArticleDiff oldTitle={cmp.title} newTitle={cmp.d.title} ops={cmp.ops} sum={cmp.sum} newHtml={cmp.d.html} isPublic byName={false}
      onReplace={() => {}} ownerAction={{ label: 'Replace for everyone', run: () => { go({ ...cmp.d, title: cmp.title }); } }} addLabel="Publish as a new article instead"
      onAddNew={() => { setForm({ ...cmp.d, title: titleOf(cmp.d.html, 'article'), slug: slugOf(titleOf(cmp.d.html, 'article')) + '-2', summary: '' }); setCmp(null); }} onCancel={() => setCmp(null)} />}
    <MyArticles pub={(list || []).map(p => ({ slug: p.slug, title: p.title }))} />
  </>);
}
