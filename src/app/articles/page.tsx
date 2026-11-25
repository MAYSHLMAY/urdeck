import Link from 'next/link';
import { listArticles, articleUrl } from '@/lib/articles/source';
import { MyArticles } from '@/components/MyArticles';
import './articles.css';

export const metadata = {
  title: 'Interactive articles',
  description: 'Read topics you can touch: live labs, questions that guide you, and notes that explain the why. Free, and they work offline once opened.',
  alternates: { canonical: '/articles' }
};
const hue = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7);

export default function Articles() {
  const all = listArticles();
  return (
    <main className="ar">
      <header className="ar-h"><Link href="/" className="ar-back" aria-label="Home">Home</Link><h1>Articles</h1><p>Topics you can touch. Every idea comes with something to drag, spin or measure.</p></header>
      <ul className="ar-g">
        {all.map(a => (
          <li key={a.slug}>
            <Link href={'/articles/' + a.slug + '/'} className="ar-c" style={{ ['--h' as any]: hue(a.slug) }}>
              <span className="ar-cov" aria-hidden="true"><b>{a.title.slice(0, 1)}</b></span>
              <span className="ar-t"><b>{a.title}</b><span>{a.summary}</span>
                <small>{a.reading_minutes} min read · Interactive · v{a.version}</small>
                <em>{a.tags.slice(0, 4).map(t => <i key={t}>{t}</i>)}</em></span>
            </Link>
          </li>
        ))}
      </ul>
      {!all.length && <p className="ar-note">No articles yet.</p>}
      <MyArticles pub={all.map(a => ({ slug: a.slug, title: a.title, url: articleUrl(a.slug, a.version) }))} />
    </main>
  );
}
