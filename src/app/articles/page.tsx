import Link from 'next/link';
import { ArticlesHome } from '@/components/ArticlesHome';
import './articles.css';

export const metadata = {
  title: 'Interactive articles',
  description: 'Read topics you can touch: live labs, questions that guide you, and notes that explain the why.',
  alternates: { canonical: '/articles' }
};

export default function Articles() {
  return (
    <main className="ar">
      <header className="ar-h"><Link href="/" className="ar-back" aria-label="Home">Home</Link><h1>Articles</h1><p>Topics you can touch. Every idea comes with something to drag, spin or measure.</p></header>
      <ArticlesHome />
    </main>
  );
}
