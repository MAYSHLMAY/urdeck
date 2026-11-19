'use client';
import { useEffect, useRef, useState } from 'react';
import { aiConnect, aiGet, aiSet, chat, PROV } from '@/lib/ai/provider';
import { notes as notesStore, type LocalNote } from '@/lib/notes';
import { boxOf } from '@/lib/pdfindex';
import { Ic } from './ui';

/** Companion panes that sit beside the pages: an AI helper that knows the page you are on, a web view, and your notes. */

type Turn = { r: 'u' | 'a'; t: string; bad?: boolean };
const CHIPS: [string, string][] = [
  ['Explain this page', 'Explain this page in simple words, as if to a student meeting it for the first time.'],
  ['Summarize', 'Summarize this page in 4 short bullet points.'],
  ['Key terms', 'List the key terms on this page with a one-line meaning each.'],
  ['Quiz me', 'Ask me 3 short questions about this page, one at a time. Ask the first now and wait for my answer.']
];

export function AiPane({ title, page, getText, getSel }: { title: string; page: number; getText: () => Promise<string>; getSel: () => string }) {
  const [cfg, setCfg] = useState(aiGet()), [key, setKey] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Turn[]>([]), [q, setQ] = useState(''), [useSel, setUseSel] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = () => setCfg(aiGet()); addEventListener('fr-ai', f); return () => removeEventListener('fr-ai', f); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [log, busy]);
  useEffect(() => { setLog([]); }, [title]);

  async function connect() {
    setBusy(true); setErr('');
    try { aiSet(await aiConnect(key.trim())); setKey(''); } catch (x: any) { setErr(x.message || 'Could not connect.'); }
    setBusy(false);
  }
  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return;
    setLog(l => [...l, { r: 'u', t }]); setQ(''); setBusy(true);
    try {
      const sel = useSel ? getSel() : '', pg = (await getText()).slice(0, 5500);
      const sys = 'You are a patient study helper reading "' + title + '" with the student, who is on page ' + page + '. Answer from the page text when it covers the question; if you add outside knowledge, say so. Be concise and clear. Plain text, no markdown symbols.';
      const ctx = (sel ? 'The student selected this passage:\n"' + sel.slice(0, 1500) + '"\n\n' : '') + 'Text of page ' + page + ':\n' + pg;
      const hist = log.slice(-6).map(x => ({ role: x.r === 'u' ? 'user' : 'assistant', content: x.t }));
      const a = await chat([{ role: 'system', content: sys + '\n\n' + ctx }, ...hist, { role: 'user', content: t }] as any, 700);
      setLog(l => [...l, { r: 'a', t: a || 'No answer came back.' }]);
    } catch (x: any) { setLog(l => [...l, { r: 'a', t: x.message || 'Something went wrong.', bad: true }]); }
    setBusy(false);
  }

  if (!cfg) return (
    <div className="rd-pane-in rd-ai">
      <div className="rd-empty">
        <span className="rd-ei"><Ic n="sparkle" /></span>
        <b>Ask AI while you read</b>
        <p>Paste your own free key from Groq or xAI. It stays on this device only and is never synced. The AI then sees the page you are on.</p>
        <input value={key} onChange={e => setKey(e.target.value)} placeholder="gsk_… or xai-…" autoComplete="off" spellCheck={false} aria-label="API key" />
        <button className="solid" disabled={busy || key.trim().length < 20} onClick={connect}>{busy ? 'Checking…' : 'Connect'}</button>
        {err && <p className="rd-err">{err}</p>}
        <small>Get a key: {Object.values(PROV).map((p, i) => <span key={p.name}>{i ? ' · ' : ''}<a href={p.keys} target="_blank" rel="noreferrer">{p.name}</a></span>)}</small>
      </div>
    </div>
  );
  return (
    <div className="rd-pane-in rd-ai">
      <div className="rd-chat">
        {!log.length && <div className="rd-hint"><b>Page {page}</b><span>Ask anything about it, or start with one of these.</span></div>}
        {log.map((m, i) => <div key={i} className={'rd-msg ' + m.r + (m.bad ? ' bad' : '')}>{m.t}</div>)}
        {busy && <div className="rd-msg a dots"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <div className="rd-chips">{CHIPS.map(([l, p]) => <button key={l} type="button" disabled={busy} onClick={() => send(p)}>{l}</button>)}</div>
      <form className="rd-ask" onSubmit={e => { e.preventDefault(); send(q); }}>
        <label className="rd-chk"><input type="checkbox" checked={useSel} onChange={e => setUseSel(e.target.checked)} /><span>Use my selection</span></label>
        <div className="rd-askr"><input value={q} onChange={e => setQ(e.target.value)} placeholder={'Ask about page ' + page} aria-label="Ask" /><button className="solid" disabled={busy || !q.trim()} aria-label="Send"><Ic n="arrowR" /></button></div>
      </form>
    </div>
  );
}

const QUICK: { n: string; u: string; win?: boolean }[] = [
  { n: 'Wikipedia', u: 'https://en.m.wikipedia.org/wiki/Special:Search?search=' },
  { n: 'Khan Academy', u: 'https://www.khanacademy.org/search?page_search_query=' },
  { n: 'ChatGPT', u: 'https://chatgpt.com/', win: true },
  { n: 'Gemini', u: 'https://gemini.google.com/app', win: true },
  { n: 'Claude', u: 'https://claude.ai/new', win: true },
  { n: 'Perplexity', u: 'https://www.perplexity.ai/', win: true }
];
const K_WEB = 'ud-rd-web';
/** Open a site in its own window placed on the other half of the screen (many AI sites refuse to be embedded). */
export function openBeside(url: string) {
  try {
    const w = Math.round((screen.availWidth || 1000) / 2), h = screen.availHeight || 800, l = (screen as any).availLeft || 0, t = (screen as any).availTop || 0;
    window.open(url, 'ud-side', 'popup=yes,width=' + w + ',height=' + h + ',left=' + (l + w) + ',top=' + t) || window.open(url, '_blank');
  } catch { window.open(url, '_blank'); }
}
export function WebPane({ seed }: { seed: string }) {
  const [url, setUrl] = useState(() => { try { return localStorage.getItem(K_WEB) || ''; } catch { return ''; } }), [text, setText] = useState(url), [n, setN] = useState(0);
  const fix = (s: string) => { s = s.trim(); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[^\s]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s; return 'https://en.m.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(s); };
  const go = (s: string) => { const u = fix(s); if (!u) return; setUrl(u); setText(u); setN(x => x + 1); try { localStorage.setItem(K_WEB, u); } catch { /* ignore */ } };
  return (
    <div className="rd-pane-in rd-web">
      <form className="rd-url" onSubmit={e => { e.preventDefault(); go(text); }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Address or a word to look up" aria-label="Address" inputMode="url" autoCapitalize="off" spellCheck={false} />
        <button type="button" className="rd-ib" aria-label="Open in its own window" title="Open in its own window beside this one" disabled={!url} onClick={() => openBeside(url)}><Ic n="expand" /></button>
      </form>
      <div className="rd-chips">
        {QUICK.map(x => <button key={x.n} type="button" onClick={() => x.win ? openBeside(x.u) : go(x.u + encodeURIComponent(seed))}>{x.n}{x.win ? ' ↗' : ''}</button>)}
      </div>
      {url
        ? <iframe key={n} className="rd-frame" src={url} title="Web page" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        : <div className="rd-empty"><span className="rd-ei"><Ic n="search" /></span><b>Look things up beside the page</b><p>Type a word or an address. Sites marked with an arrow (ChatGPT, Gemini, Claude) do not allow being shown inside other apps, so they open in their own window placed on the other half of the screen. On a phone, use split-screen to keep both in view.</p></div>}
      {url && <p className="rd-foot">Blank page? That site blocks embedding. Use the window button above.</p>}
    </div>
  );
}

export function NotesPane({ pdfId, onOpen }: { pdfId: string; onOpen: (n: LocalNote) => void }) {
  const [, b] = useState(0), st = notesStore();
  useEffect(() => { st.start(); return st.subscribe(() => b(x => x + 1)); }, []); // eslint-disable-line
  const list = st.list(pdfId).slice().sort((a, c) => (a.page_number || 0) - (c.page_number || 0));
  return (
    <div className="rd-pane-in rd-notes">
      {!list.length && <div className="rd-empty"><span className="rd-ei"><Ic n="note" /></span><b>No notes yet</b><p>Select text in the page and choose Highlight or Note. They appear here and stay linked to the page.</p></div>}
      {list.map(n => (
        <div key={n.id} className={'rd-note c-' + (n.color || 'yellow')}>
          <button type="button" className="rd-np" onClick={() => onOpen(n)}>p. {n.page_number || '?'}</button>
          <blockquote>{n.selected_text}</blockquote>
          <textarea key={n.id + n.updated_at} defaultValue={n.note_content} placeholder="Add your own note…" maxLength={4000} onBlur={e => { if (e.target.value !== n.note_content) st.update(n.id, { note_content: e.target.value }); }} />
          <button type="button" className="rd-ib sm" aria-label="Delete note" onClick={() => st.remove(n.id)}><Ic n="trash" /></button>
        </div>
      ))}
    </div>
  );
}
export { boxOf };
