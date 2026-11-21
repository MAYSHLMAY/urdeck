import Reader from '@/components/Reader';
import './read.css';

export const metadata = { title: 'PDF reader', description: 'Read PDFs with themes, split screen, read aloud and honest page tracking. Make flashcards from any selection.', alternates: { canonical: '/read' } };

export default function ReadPage() {
  return <Reader />;
}
