'use client';
/* If a screen ever fails, show what happened and a way back, instead of the generic "Application error". */
export default function Err({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ maxWidth: 520, margin: '12vh auto', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <h2 style={{ margin: '0 0 8px' }}>Something went wrong on this screen</h2>
      <p style={{ opacity: .75, margin: '0 0 12px' }}>Your cards and progress are safe. Tell me this line and I can fix it:</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, borderRadius: 12, background: 'rgba(127,127,127,.15)', fontSize: 13 }}>{String(error?.message || error)}{error?.digest ? '\n(' + error.digest + ')' : ''}</pre>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => reset()} style={{ padding: '10px 16px', borderRadius: 12, border: '1.5px solid #8884', background: 'transparent', font: 'inherit', fontWeight: 700 }}>Try again</button>
        <a href="/" style={{ padding: '10px 16px', borderRadius: 12, background: '#5b5bd6', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>Go home</a>
      </div>
    </main>
  );
}
