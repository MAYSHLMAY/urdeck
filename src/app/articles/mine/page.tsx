import { MineView } from '@/components/MineView';
import '../articles.css';
export const metadata = { title: 'My article', robots: { index: false, follow: false } };
export default function Mine() { return <MineView />; }
