import Home from '@/components/Home';
import Link from 'next/link';

const hide = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;
export default function Page() {
  return (
    <>
      <section style={hide} aria-label="About UrDeck">
        <h1>UrDeck: free flashcards, 3D lab and PDF reader for students</h1>
        <p>Study with spaced-repetition flashcards, import Anki decks, read PDFs with honest page tracking, explore 3D models and host live quizzes. Works offline.</p>
        <nav><Link href="/about">About UrDeck</Link> <Link href="/lab">3D lab</Link> <Link href="/read">PDF reader</Link> <Link href="/privacy">Privacy</Link></nav>
      </section>
      <Home />
    </>
  );
}
