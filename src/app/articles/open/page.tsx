import { OpenArticle } from '@/components/OpenArticle';
import '../articles.css';
export const metadata = { title: 'Article', robots: { index: false, follow: true } };
export default function Open() { return <OpenArticle />; }
