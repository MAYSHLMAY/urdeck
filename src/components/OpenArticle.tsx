'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pubHtml } from '@/lib/articles/public';
import { myGet } from '@/lib/articles/local';
import { standalone } from '@/lib/articles/frame';

/** Opens an article as a normal full page: this page is replaced by the article itself, so its tabs, buttons, saved settings and links to the app work like any page of the app. */
export function OpenArticle() {
  const [err, setErr] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(location.search), slug = q.get('slug'), mine = q.get('mine');
    (async () => {
      let html: string | null = null;
      try { html = slug ? (await pubHtml(slug))?.html ?? null : mine ? (await myGet(mine))?.html ?? null : null; } catch { /* handled below */ }
      if (!html) { setErr(slug ? 'This article could not be loaded. Check your connection, or it may have been taken down.' : 'This article is not on this device any more.'); return; }
      try { navigator.storage?.persist?.(); } catch { /* ignore */ }   // ask the phone not to clear saved articles when space runs low
      document.open(); document.write(standalone(html, slug ? 'p:' + slug : 'm:' + mine)); document.close();
    })();
  }, []);
  return (
    <main className="ar" style={{ padding: 24 }}>
      {err ? <><p className="ar-note">{err}</p><Link href="/articles" className="ar-back">Back to articles</Link></> : <p className="ar-note" role="status">Opening…</p>}
    </main>
  );
}
