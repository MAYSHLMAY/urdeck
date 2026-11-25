import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, listArticles, articleUrl } from '@/lib/articles/source';
import { ArticleFrame } from '@/components/ArticleFrame';
import '../articles.css';

export const dynamicParams = false;
export const generateStaticParams = () => listArticles().map(a => ({ slug: a.slug }));
export function generateMetadata({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug); if (!a) return {};
  const url = '/articles/' + a.slug + '/';
  return {
    title: a.title, description: a.summary, alternates: { canonical: url }, keywords: a.tags, authors: [{ name: a.author }],
    openGraph: { type: 'article', title: a.title, description: a.summary, url, publishedTime: a.published_at, tags: a.tags, images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title: a.title, description: a.summary }
  };
}

export default function Article({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug); if (!a) notFound();
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.summary, author: { '@type': 'Organization', name: a.author }, datePublished: a.published_at, inLanguage: a.language, keywords: a.tags.join(', ') };
  return (
    <main className="ar ar-read">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <header className="ar-bar"><Link href="/articles/" className="ar-back" aria-label="All articles">Articles</Link><h1>{a.title}</h1></header>
      <ArticleFrame src={articleUrl(a.slug, a.version)} title={a.title} />
      <section className="ar-seo" aria-label="About this article">
        <p>{a.summary}</p>
        <p className="ar-meta">{a.reading_minutes} min read · {a.author} · version {a.version} · {a.published_at}</p>
        <details><summary>Contents ({a.outline.length} topics)</summary><ol>{a.outline.map(h => <li key={h}>{h}</li>)}</ol></details>
      </section>
    </main>
  );
}
