'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { myGet } from '@/lib/articles/local';
import { ArticleFrame } from './ArticleFrame';

export function MineView() {
  const [a, setA] = useState<{ title: string; html: string } | null | undefined>(undefined);
  useEffect(() => { const id = new URLSearchParams(location.search).get('id'); if (!id) { setA(null); return; } myGet(id).then(x => setA(x ? { title: x.title, html: x.html } : null)).catch(() => setA(null)); }, []);
  return (
    <main className="ar ar-read">
      <header className="ar-bar"><Link href="/articles/" className="ar-back" aria-label="All articles">Articles</Link><h1>{a ? a.title : 'My article'}</h1></header>
      {a === undefined && <div className="ar-box"><div className="ar-sk" aria-hidden="true"><i /><i /><i /><i /></div></div>}
      {a === null && <p className="ar-note" style={{ padding: 16 }}>This article is not on this device any more. It may have been removed, or it was added on another device.</p>}
      {a && <ArticleFrame html={a.html} title={a.title} />}
    </main>
  );
}
