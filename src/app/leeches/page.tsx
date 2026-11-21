import LeechLab from '@/components/LeechLab';

export const metadata = { title: 'Leech Lab', robots: { index: false, follow: false }, alternates: { canonical: '/leeches' } };

export default function LeechPage() {
  return <LeechLab />;
}
