import Link from 'next/link';

export const metadata = {
  title: 'About: free flashcards, 3D lab and PDF reader',
  description: 'What UrDeck does: spaced-repetition flashcards, Anki .apkg import, a 3D lab, a PDF reader that tracks real reading, live quizzes and research sources. Free and offline-first.',
  alternates: { canonical: '/about' }
};
const FAQ: [string, string][] = [
  ['Is UrDeck free?', 'Yes. You can study, read PDFs and use the 3D lab without paying or creating an account.'],
  ['Can I import my Anki decks?', 'Yes. Choose Add, then Import, and pick an Anki .apkg file. Notes become flip, reversed or cloze cards, and the first picture on a front is kept.'],
  ['Does it work offline?', 'Yes. Cards, progress and the reader work without a connection. Searching papers and images needs the internet.'],
  ['How does the reader count pages as read?', 'A page counts only after you spend enough time on it for its length, so scrolling past does not add to your streak.'],
  ['Where is my data stored?', 'On your device. Sign-in is optional and only used to sync your progress between your devices. AI keys never leave your device.']
];
export default function About() {
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  const h = { fontSize: '1.15rem', margin: '26px 0 6px' } as const;
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px', lineHeight: 1.6 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <h1 style={{ fontSize: '1.8rem', letterSpacing: '-.02em' }}>UrDeck: one place to read, practise and remember</h1>
      <p>UrDeck is a free study app for students. Read your PDFs, turn what you read into flashcards, review them with spaced repetition, and explore 3D models, all in one app that works offline.</p>
      <p><Link href="/">Open UrDeck</Link></p>
      <h2 style={h}>What you can do</h2>
      <ul>
        <li><b>Flashcards with spaced repetition.</b> Multiple choice, flip, typed, cloze and image-occlusion cards, a Leech Lab for stubborn cards, mock exams and speed rounds.</li>
        <li><b>Import from Anki, Quizlet and spreadsheets.</b> Bring an Anki .apkg, a CSV or a text file and keep studying.</li>
        <li><b>PDF reader.</b> Tabs, themes, split screen, read aloud, notes and highlights, and a page counter that only counts pages you really read.</li>
        <li><b>Research without leaving the page.</b> Search papers, images and articles from open sources and turn any result into a card or citation. Plug in your own sources.</li>
        <li><b>3D lab.</b> Rotate models and simulations, quiz yourself on their parts and make cards from them.</li>
        <li><b>Live quiz.</b> Host a quiz for a class and play along from a phone.</li>
        <li><b>Streaks that mean something.</b> Cards, real reading, lab quizzes and fixing hard cards all count, with a weekly streak freeze.</li>
      </ul>
      <h2 style={h}>Frequently asked questions</h2>
      {FAQ.map(([q, a]) => <div key={q}><h3 style={{ fontSize: '1rem', margin: '16px 0 4px' }}>{q}</h3><p style={{ margin: 0 }}>{a}</p></div>)}
      <p style={{ marginTop: 28 }}><Link href="/privacy">Privacy policy</Link></p>
    </main>
  );
}
