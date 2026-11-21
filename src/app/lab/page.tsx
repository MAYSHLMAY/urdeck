import Lab from '@/components/Lab';
import './lab.css';

export const metadata = { title: '3D lab', description: 'Explore 3D models and simulations, and turn their parts into flashcards.', alternates: { canonical: '/lab' } };

export default function LabPage() {
  return <Lab />;
}
