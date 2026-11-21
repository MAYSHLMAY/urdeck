import Exam from '@/components/Exam';

export const metadata = { title: 'Mock exam', robots: { index: false, follow: false }, alternates: { canonical: '/exam' } };

export default function ExamPage() {
  return <Exam />;
}
