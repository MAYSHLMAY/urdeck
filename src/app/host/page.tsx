import '../game.css';
import '../quiz.css';
import HostApp from '@/components/game/HostApp';

export const metadata = { title: 'Host a quiz', robots: { index: false, follow: false }, alternates: { canonical: '/host' } };
export default function Page() { return <HostApp />; }
