import { ViewPublished } from '@/components/ViewPublished';
import '../articles.css';
export const metadata = { title: 'Article', robots: { index: false, follow: true } };
export default function View() { return <ViewPublished />; }
