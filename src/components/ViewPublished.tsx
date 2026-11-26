'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pubHtml } from '@/lib/articles/public';
import { ArticleFrame } from './ArticleFrame';

/** An article published after the app was built: loaded by its address from the server. */
export function ViewPublished() {
  const [a, setA] = useState<{ title: string; html: string; sub: string } | null | undefined>(undefined);
  useEffect(() => { const s = new URLSearchParams(location.search).get('slug'); if (!s) { setA(null); return; } pubHtml(s).then(r => setA(r ? { title: r.meta.title, html: r.html, sub: r.meta.summary } : null)); }, []);
  return (
    <main className="ar ar-read">
      <header className="ar-bar"><Link href="/articles/" className="ar-back" aria-label="All articles">Articles</Link><h1>{a ? a.title : 'Article'}</h1></header>
      {a === undefined && <div className="ar-box"><div className="ar-sk" aria-hidden="true"><i /><i /><i /><i /></div></div>}
      {a === null && <p className="ar-note" style={{ padding: 16 }}>This article could not be loaded. Check your connection, or it may have been taken down.</p>}
      {a && <ArticleFrame html={a.html} title={a.title} />}
    </main>
  );
}
