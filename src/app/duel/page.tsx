import Duel from '@/components/Duel';

export const metadata = { title: 'Challenge', robots: { index: false, follow: false }, alternates: { canonical: '/duel' } };

export default function DuelPage() {
  return <Duel />;
}
