export const metadata = { title: 'Privacy', alternates: { canonical: '/privacy' } };

export default function Privacy() {
  const h = { fontSize: '1.15rem', margin: '26px 0 6px' } as const;
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '1.8rem', letterSpacing: '-.02em' }}>UrDeck privacy policy</h1>
      <p style={{ color: 'var(--mute)' }}>Last updated: November 2026</p>
      <p>UrDeck is a study app (flashcards, quizzes and a 3D lab). It works without an account. This page explains what is stored if you use it, and if you choose to sign in with Google.</p>

      <h2 style={h}>What stays on your device</h2>
      <p>Your cards, study progress, settings and any AI key you add are stored on your device. An AI key is never uploaded to our servers or synced. It is sent only to the AI provider you picked, when you use an AI feature.</p>

      <h2 style={h}>If you sign in with Google</h2>
      <p>We receive your name, email address and profile picture from Google. We use them only to show your profile and to keep your account. We store your player card (name, avatar, daily goal) and a reference to your quiz player id so your game history follows you between devices. We do not receive your Google password and we do not access your Google files, contacts or any other Google data.</p>

      <h2 style={h}>Sync</h2>
      <p>If you turn on sync, your study data is encrypted on your device before it is uploaded. The server stores only encrypted data it cannot read. Signing in lets you protect your sync space so that only your account can use it.</p>

      <h2 style={h}>Live quizzes</h2>
      <p>When a live quiz ends, the host's server saves the result: player nickname, avatar and scores, so leaderboards can be shown.</p>

      <h2 style={h}>What we do not do</h2>
      <p>We do not sell your data, show ads or use your data for advertising. We do not share it, except with the services that run the app (hosting and database providers).</p>

      <h2 style={h}>Deleting your data</h2>
      <p>You can remove cards and clear app data on your device at any time. To delete your account and the data stored for it, contact us at the email below and we will remove it.</p>

      <h2 style={h}>Contact</h2>
      <p>educationforlife424@gmail.com</p>
    </main>
  );
}
