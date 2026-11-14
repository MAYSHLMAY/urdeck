'use client';
import { useEffect, useState } from 'react';
import { aiClear, aiExplain, aiHint, aiConnect, aiGet, aiModels, aiSet, chat, cleanKey, looksLikeKey, PROV, provOf, type AICfg } from '@/lib/ai/provider';

export function useAI() {
  const [c, setC] = useState<AICfg | null>(null);
  useEffect(() => { const f = () => setC(aiGet()); f(); addEventListener('fr-ai', f); return () => removeEventListener('fr-ai', f); }, []);
  return c;
}

/** Settings block: paste a key, it checks it, picks a model and you are connected. */
export function AiConnect() {
  const c = useAI(), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [models, setModels] = useState<string[]>([]);
  useEffect(() => { if (c) aiModels(c).then(setModels).catch(() => { /* ignore */ }); }, [c?.key]); // eslint-disable-line
  const connect = async (raw: string) => {
    const k = cleanKey(raw); setKey(k);
    if (!looksLikeKey(k)) { setMsg(k ? 'Keys start with gsk_ (Groq) or xai- (xAI). Copy the whole key.' : ''); return; }
    setBusy(true); setMsg('Checking…');
    try { const cfg = await aiConnect(k); aiSet(cfg); setKey(''); setMsg('Connected. Using ' + cfg.model + '.'); } catch (er: any) { setMsg(er.message); }
    setBusy(false);
  };
  const test = async () => { setBusy(true); setMsg('Asking the AI…'); try { const r = await chat([{ role: 'user', content: 'Reply with the single word: ready' }], 10); setMsg('Reply: ' + r.slice(0, 40)); } catch (er: any) { setMsg(er.message); } setBusy(false); };
  return (
    <section className="scard ai">
      <h4>AI helper (optional)</h4>
      <p className="hint">Adds explanations, hints and a second opinion on typed answers. Works with a Groq or xAI key. Everything still works without it. Your key stays on this device only: it is not synced or included in backups.</p>
      {c ? <>
        <p className="aiok">Connected to {PROV[c.p || provOf(c.key) || 'xai'].name}{c.relay ? ' (via relay)' : ''}. Model:{' '}
          <select value={c.model} onChange={ev => aiSet({ ...c, model: ev.target.value })}>{[...new Set([c.model, ...models])].map(m => <option key={m}>{m}</option>)}</select></p>
        <div className="row"><button className="ghost" disabled={busy} onClick={test}>Test</button><button className="ghost" onClick={() => { aiClear(); setMsg('Disconnected. The key was removed from this device.'); }}>Disconnect</button></div>
      </> : <>
        <input type="password" autoComplete="off" spellCheck={false} placeholder="Paste your gsk_ or xai- key" value={key} disabled={busy}
          onChange={ev => setKey(ev.target.value)} onPaste={ev => { ev.preventDefault(); connect(ev.clipboardData.getData('text')); }} onKeyDown={ev => { if (ev.key === 'Enter') connect(key); }} />
        <div className="row"><button className="solid" disabled={busy || !key} onClick={() => connect(key)}>Connect</button>
          <a className="ghost" href={PROV.groq.keys} target="_blank" rel="noreferrer">Get a Groq key</a><a className="ghost" href={PROV.xai.keys} target="_blank" rel="noreferrer">Get an xAI key</a></div>
        <small className="hint">Create a key at the provider, paste it here, and it connects by itself. Groq offers a free tier with daily limits and no card; xAI gives starter credits. Offers change, so check the provider.</small>
      </>}
      {msg && <p className="aimsg" role="status">{msg}</p>}
    </section>
  );
}

/** Panel for the Explain / Hint chip: runs once when opened. */
export function AiPanel({ q, hint }: { q: any; hint?: boolean }) {
  const [t, setT] = useState(''), [busy, setBusy] = useState(true), [bad, setBad] = useState(false), [n, setN] = useState(0);
  useEffect(() => {
    let live = true; setBusy(true); setBad(false);
    (hint ? aiHint(q) : aiExplain(q)).then(r => live && setT(r), er => { if (live) { setT(er.message); setBad(true); } }).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [q.id, hint, n]); // eslint-disable-line
  return <div className="aipanel" aria-live="polite">{busy ? <p className="aiwait">{hint ? 'Thinking of a hint…' : 'Explaining…'}</p> : <p>{t}</p>}
    {bad && !busy && <button className="ghost" onClick={() => setN(x => x + 1)}>Try again</button>}</div>;
}
