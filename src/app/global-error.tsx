'use client';
import { useEffect, useState } from 'react';
import { recover } from '@/lib/recover';
import { reportError } from '@/lib/report';
/* The last safety net: if even the page frame fails (usually an old copy meeting a new release), refresh once by itself, then offer a button. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const [fix, setFix] = useState(false);
  useEffect(() => { reportError(error, 'global'); setFix(recover()); }, []); // eslint-disable-line
  return (
    <html lang="en"><body style={{ margin: 0, fontFamily: 'system-ui,sans-serif', background: '#F3F5FB', color: '#171a2e' }}>
      <main style={{ maxWidth: 420, margin: '30vh auto', padding: 20, textAlign: 'center' }}>
        {fix ? <p style={{ opacity: .7 }}>Updating…</p> : <>
          <h2 style={{ margin: '0 0 8px' }}>UrDeck needs a refresh</h2>
          <p style={{ opacity: .75 }}>Your cards and progress are safe.</p>
          <button onClick={() => { try { reset(); } catch { /* ignore */ } location.reload(); }} style={{ padding: '10px 18px', borderRadius: 12, border: 0, background: '#5B5BD6', color: '#fff', font: 'inherit', fontWeight: 700 }}>Reload</button>
        </>}
      </main>
    </body></html>
  );
}
