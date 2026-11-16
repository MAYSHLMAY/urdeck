'use client';
import { isSim, is3d, simTitle } from '@/lib/sim';
import { refs } from '@/lib/refs';
import { importToPack, cardsToCardsFile, cardsToCsv, cardsToAnki, downloadText } from '@/lib/exchange';
import { useEffect, useState } from 'react';
import { AiCards } from './AiCards';
import { foldList } from '@/lib/tree';
import { parseRaw } from '@/lib/parse';
import { splitPath } from '@/lib/engine';
import { isOwner, lock, unlock } from '@/lib/api';
import { sb } from '@/lib/library';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';

/** "ai-1763269781234.txt" and "pasted-2026-11-16-07-09.txt" are file names, not titles: show what they are and when they were added. */
const packLabel = (n: string) => {
  const b = n.replace(/\.txt$/i, ''), d = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  let m = b.match(/^(ai|batch)-(\d{12,14})$/); if (m) return (m[1] === 'ai' ? 'AI cards' : 'Batch add') + ' · ' + d(+m[2]);
  m = b.match(/^pasted-(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)$/); if (m) return 'Pasted · ' + d(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime());
  return b;
};
export function AddDialog({ open, onClose, onManage }: { open: boolean; onClose: () => void; onManage?: () => void }) {
  const e = useEngine();
  const [own, setOwn] = useState(false), [pw, setPw] = useState(''), [pwm, setPwm] = useState('');
  const [flipIn, setFlipIn] = useState(true);
  const [tab, setTab] = useState<'F' | 'C' | 'X' | 'A'>('F');
  const [where, setWhere] = useState('root'), [fname, setFname] = useState(''), [cpath, setCpath] = useState(''), [ctags, setCtags] = useState(''), [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ t: string; c: string }>({ t: '', c: '' });
  const [packs, setPacks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOwn(isOwner()); setMsg({ t: '', c: '' });
    setWhere(e.FT.name.has(e.BR) ? e.BR : 'root');
    // eslint-disable-next-line
  }, [open]);

  useEffect(() => {
    if (!open || !own) return;
    sb().from('packs').select('id,name,card_count,created_at').order('id', { ascending: false }).limit(30)
      .then(r => { if (!r.error) setPacks(r.data || []); });
  }, [open, own, e.cardsBusy]);

  const say = (t: string, c = 'ok') => setMsg({ t, c });
  const L = foldList(e.FT);
  const whereVal = L.some(x => x.id === where) ? where : 'root';

  async function doUnlock() {
    setPwm('');
    const err = await unlock(pw.trim());
    if (err) { setPwm(err); return; }
    setPw(''); setOwn(true); e.emit();
  }
  async function whereFor(text: string) {
    if (!cpath.trim() || !parseRaw('x', text).cards.length) return whereVal;
    return e.ensurePath(whereVal, cpath).id;
  }
  function mkFolder() {
    const nm = fname.trim(); if (!nm) { say('Type a folder name or path first.', 'err'); return; }
    const x = e.ensurePath(whereVal, nm);
    setFname(''); e.BR = x.id; setWhere(x.id);
    say(x.created ? 'Created ' + splitPath(nm).join(' / ') + '.' : 'That folder already exists.');
  }
  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); const out: string[] = []; let bad = false;
    for (const f of Array.from(files)) {
      const txt = await f.text(), w = await whereFor(txt), r = await e.addPack(f.name, txt, w, ctags.trim());
      out.push(r.msg); if (!r.ok) bad = true;
    }
    setBusy(false); say(out.join('\n'), bad ? 'err' : 'ok');
  }
  async function addPasted() {
    if (!paste.trim()) return;
    setBusy(true);
    const w = await whereFor(paste), r = await e.addPack('pasted-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.txt', paste, w, ctags.trim());
    setBusy(false); say(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) setPaste('');
  }

  const locked = false;   // everyone can add; non-owners add privately, on this device only
  return (
    <Sheet open={open} onClose={onClose} className="sheet addm">
      <SheetFrame title={<>Add <Ic n={own ? 'unlock' : 'lock'} /></>} onClose={onClose}>
        <div className="sc">
          {onManage && <button type="button" className="ad-manage" onClick={() => { onClose(); onManage(); }}><Ic n="pencil" /><span><b>Manage cards</b><small>Select, move, delete, find &amp; replace</small></span><Ic n="chevR" /></button>}
          {locked ? (
            <div>
              <p className="n">Owner only. Enter the password to add folders or cards.</p>
              <input type="password" value={pw} onChange={ev => setPw(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') doUnlock(); }}
                placeholder="Password" autoComplete="off" spellCheck={false}
                style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', padding: '9px 10px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }} />
              <div className="row"><button className="solid" type="button" onClick={doUnlock}>Unlock</button></div>
              <p className="n" style={{ color: 'var(--bad)' }}>{pwm}</p>
            </div>
          ) : (
            <div>
              <p className="ad-priv"><Ic n={own ? 'unlock' : 'lock'} /> {own ? 'Owner: what you add is saved for everyone' : 'Private: stays on this device'}</p>
              <div className="tabs2 ad-tabs" role="tablist">
                <button type="button" className={tab === 'F' ? 'on' : ''} onClick={() => setTab('F')}>Folder</button>
                <button type="button" className={tab === 'C' ? 'on' : ''} onClick={() => setTab('C')}>Cards</button>
                <button type="button" className={tab === 'X' ? 'on' : ''} onClick={() => setTab('X')}>Import</button>
                <button type="button" className={tab === 'A' ? 'on' : ''} onClick={() => setTab('A')}>AI</button>
              </div>
              <label className="ad-l">Add to</label>
              <select value={whereVal} onChange={ev => setWhere(ev.target.value)}>{L.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
              {tab === 'A' ? (
                <div className="addc"><AiCards where={whereVal} tags={ctags.trim()} onMsg={say} /></div>
              ) : tab === 'X' ? (
                <div>
                  <p className="ad-help">Bring cards in from a spreadsheet, Anki, Quizlet or a cards file.</p>
                  <div className="ad-chips" aria-hidden><span>CSV</span><span>Anki</span><span>Quizlet</span><span>Cards file</span><span>3D sim</span></div>
                  <label className="pickr"><input type="checkbox" checked={flipIn} onChange={ev => setFlipIn(ev.target.checked)} /><span>Two-column files become flip cards</span></label>
                  <input type="file" className="ad-file" accept=".csv,.tsv,.txt,.html,.htm,.js,text/html,text/javascript,text/csv,text/plain,text/tab-separated-values" multiple disabled={busy}
                    onChange={async ev => {
                      const t = ev.target, fs = Array.from(t.files || []); t.value = ''; if (!fs.length) return;
                      setBusy(true); const out: string[] = []; let bad = false;
                      for (const f of fs) {
                        const txt = await f.text();
                        if (isSim(txt)) {
                          if (!isOwner()) { out.push(f.name + ': simulations can only be added by the owner (sign in as owner).'); bad = true; continue; }
                          try { const row = await refs().uploadModel(simTitle(txt, f.name.replace(/\.\w+$/, '')), is3d(txt) ? '3D simulation' : '2D simulation', '', txt, null); out.push('Simulation “' + row.name + '” added to the 3D lab.'); }
                          catch (x: any) { out.push(f.name + ': ' + (x?.message || 'upload failed')); bad = true; }
                          continue;
                        }
                        const r = importToPack(f.name, txt, '', flipIn);
                        if (!r.n) { out.push(f.name + ': ' + (r.note || 'no usable cards found')); bad = true; continue; }
                        const a = await e.addPack(f.name.replace(/\.[^.]+$/, '') + '.txt', r.text, await whereFor(r.text), ctags.trim());
                        out.push(a.msg + (r.borrowed ? ' (wrong choices borrowed from other cards)' : '') + (r.skipped ? ` · ${r.skipped} row(s) skipped` : '')); if (!a.ok) bad = true;
                      }
                      setBusy(false); say(out.join('\n'), bad ? 'err' : 'ok');
                    }} />
                  <details className="ad-more"><summary>Cards file format</summary>
                    <ul className="ad-ref">
                      <li><code>#Set name</code> starts a set</li>
                      <li><code>Q: question | correct | wrong…</code> multiple choice</li>
                      <li><code>F: front | back</code> flip, <code>R:</code> reversed, <code>T:</code> type-in</li>
                      <li><code>C: The {'{{c1::heart}}'} pumps…</code> cloze</li>
                      <li><code>O: image-url | hide-one | Wing@x,y,w,h</code> occlusion</li>
                      <li>Simulations: an .html/.js starting with <code>/* flight-recall-sim */</code> (owner only)</li>
                    </ul></details>
                  <details className="ad-more"><summary>Export your library</summary>
                  <div className="ad-btns">
                    <button type="button" className="ghost" onClick={() => downloadText('urdeck-cards.csv', cardsToCsv(e.Q), 'text/csv')}>CSV</button>
                    <button type="button" className="ghost" onClick={() => downloadText('urdeck-cards.txt', cardsToCardsFile(e.Q))}>Cards file</button>
                    <button type="button" className="ghost" onClick={async () => { const txt = cardsToCardsFile(e.Q); try { const f = new File([txt], 'urdeck-cards.txt', { type: 'text/plain' }); if ((navigator as any).canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: 'UrDeck cards' }); return; } await navigator.share?.({ title: 'UrDeck cards', text: txt.slice(0, 60000) }); if (!navigator.share) downloadText('urdeck-cards.txt', txt); } catch { /* cancelled */ } }}>Share…</button>
                    <button type="button" className="ghost" onClick={() => downloadText('urdeck-anki.txt', cardsToAnki(e.Q))}>Anki</button>
                  </div>
                  <p className="ad-help">CSV keeps pictures and pins. Anki import: File → Import, choose the .txt, tick "Allow HTML in fields".</p>
                  </details>
                </div>
              ) : tab === 'F' ? (
                <div>
                  <label className="ad-l">Folder name</label>
                  <input type="text" value={fname} onChange={ev => setFname(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') mkFolder(); }} placeholder="Chapter 1" maxLength={120} autoComplete="off" />
                  <p className="ad-help">Tip: write <b>Biology/Chapter 1</b> to make nested folders in one go.</p>
                  <div className="row"><button className="solid" type="button" onClick={mkFolder}>Create folder</button></div>
                </div>
              ) : (
                <div>
                  <p className="ad-help">One card per line: <code>question|correct|wrong1|wrong2</code>. Start a set with <code>#Set name</code>.</p>
                  <textarea value={paste} onChange={ev => setPaste(ev.target.value)} placeholder={'#2.5 Theory of Turn\nquestion|correct|wrong1|wrong2|wrong3'} />
                  <details className="ad-more"><summary>More options</summary>
                    <label className="ad-l">Sub-folders</label>
                    <input type="text" value={cpath} onChange={ev => setCpath(ev.target.value)} placeholder="Chapter 2/Part A" maxLength={120} autoComplete="off" />
                    <label className="ad-l">Tags</label>
                    <input type="text" value={ctags} onChange={ev => setCtags(ev.target.value)} placeholder="lift, forces, exam" maxLength={120} autoComplete="off" />
                  </details>
                  <p className="ad-or">or add a .txt file</p>
                  <input type="file" accept=".txt,text/plain" multiple className="ad-file" disabled={busy}
                    onChange={async ev => { const t = ev.target; await upload(t.files); t.value = ''; }} />
                  <div className="row"><button className="solid" type="button" disabled={busy} onClick={addPasted}>{busy ? 'Adding…' : 'Add cards'}</button></div>
                </div>
              )}
              <div id="imsg" className={msg.c}>{msg.t}</div>
              <div id="packs">
                <p className="ad-lib"><b>Your library</b><span>{e.Q.length} cards{e.syncingCloud ? ' · syncing…' : ''}</span></p>
                {packs.map(p => (
                  <div className="pk2" key={p.id}><span title={p.name}>{packLabel(p.name)}<br /><small className="gm">{p.card_count} cards · added {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · shared deck</small></span></div>
                ))}
                {e.DATA.packs.map((p, i) => (
                  <div className="pk2" key={'l' + i}><span title={p.name}>{packLabel(p.name)}<br /><small className="gm">on this device only</small></span>
                    <span><button type="button" className="ghost" onClick={() => { if (confirm('Remove "' + p.name + '" from this device?')) e.removeLocalPack(i); }}>Remove</button></span></div>
                ))}
              </div>
              {own ? <div className="row" style={{ marginTop: 12 }}>
                <button className="ghost" type="button" onClick={() => { lock(); setOwn(false); e.emit(); }}>Lock</button>
              </div> : (
                <details className="mgbox" style={{ marginTop: 12 }}>
                  <summary>I am the owner</summary>
                  <input type="password" value={pw} onChange={ev => setPw(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') doUnlock(); }} placeholder="Owner password" autoComplete="off" spellCheck={false} />
                  <div className="row"><button className="solid" type="button" onClick={doUnlock}>Unlock</button></div>
                  <p className="n" style={{ color: 'var(--bad)' }}>{pwm}</p>
                </details>
              )}
            </div>
          )}
        </div>
      </SheetFrame>
    </Sheet>
  );
}
