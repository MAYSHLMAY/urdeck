import '../game.css';
import '../quiz.css';
import PlayApp from '@/components/game/PlayApp';

export const metadata = { title: 'Live quiz', robots: { index: false, follow: false }, alternates: { canonical: '/play' } };
export default function Page() { return <PlayApp />; }
