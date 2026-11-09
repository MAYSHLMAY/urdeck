'use client';
import { importToPack, cardsToCsv, cardsToAnki, downloadText } from '@/lib/exchange';
import { useEffect, useState } from 'react';
import { foldList } from '@/lib/tree';
import { parseRaw } from '@/lib/parse';
import { splitPath } from '@/lib/engine';
import { isOwner, lock, unlock } from '@/lib/api';
import { sb } from '@/lib/library';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';

export function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const e = useEngine();
  const [own, setOwn] = useState(false), [pw, setPw] = useState(''), [pwm, setPwm] = useState('');
  const [tab, setTab] = useState<'F' | 'C' | 'X'>('F');
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
              <p className="n">{own ? 'Owner: cards and folders you add are saved for everyone.' : 'Private: everything you add here stays on this device and is never uploaded. Only you can see it.'}</p>
              <div className="tabs2">
                <button type="button" className={tab === 'F' ? 'on' : ''} onClick={() => setTab('F')}>New folder</button>
                <button type="button" className={tab === 'C' ? 'on' : ''} onClick={() => setTab('C')}>Add cards</button>
                <button type="button" className={tab === 'X' ? 'on' : ''} onClick={() => setTab('X')}>Import / export</button>
              </div>
              <label>Where</label>
              <select value={whereVal} onChange={ev => setWhere(ev.target.value)}>{L.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
              {tab === 'X' ? (
                <div>
                  <p className="n">Import a <b>CSV</b> (columns: set, question, correct, wrong1…wrong5, image, pins), an <b>Anki</b> text export, or a two-column <b>Quizlet/Anki</b> file (front, back). Two-column files get their wrong choices borrowed from the other cards.</p>
                  <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" multiple disabled={busy}
                    onChange={async ev => {
                      const t = ev.target, fs = Array.from(t.files || []); t.value = ''; if (!fs.length) return;
                      setBusy(true); const out: string[] = []; let bad = false;
                      for (const f of fs) {
                        const r = importToPack(f.name, await f.text(), '');
                        if (!r.n) { out.push(f.name + ': ' + (r.note || 'no usable cards found')); bad = true; continue; }
                        const a = await e.addPack(f.name.replace(/\.[^.]+$/, '') + '.txt', r.text, await whereFor(r.text), ctags.trim());
                        out.push(a.msg + (r.borrowed ? ' (wrong choices borrowed from other cards)' : '') + (r.skipped ? ` · ${r.skipped} row(s) skipped` : '')); if (!a.ok) bad = true;
                      }
                      setBusy(false); say(out.join('\n'), bad ? 'err' : 'ok');
                    }} />
                  <label>Export your library</label>
                  <div className="row">
                    <button type="button" className="ghost" onClick={() => downloadText('flight-recall-cards.csv', cardsToCsv(e.Q), 'text/csv')}>Download CSV</button>
                    <button type="button" className="ghost" onClick={() => downloadText('flight-recall-anki.txt', cardsToAnki(e.Q))}>Download for Anki</button>
                  </div>
                  <p className="n">CSV keeps pictures and pins. Anki import: File → Import, choose the .txt, tick "Allow HTML in fields".</p>
                </div>
              ) : tab === 'F' ? (
                <div>
                  <label>Folder name, or a path like <b>Materials/Chapter 1</b> (missing folders are created automatically)</label>
                  <input type="text" value={fname} onChange={ev => setFname(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') mkFolder(); }} placeholder="e.g. Materials/Chapter 1" maxLength={120} autoComplete="off" />
                  <div className="row"><button className="solid" type="button" onClick={mkFolder}>Create folder</button></div>
                </div>
              ) : (
                <div>
                  <p className="n">Paste text: a <b>#2.5 Title</b> line, then one question per line as <b>question|correct|wrong1|wrong2|wrong3</b>. Cards are always added, never replaced. Each <b>#Title</b> becomes a card set inside the folder you picked.</p>
                  <label>Extra sub-folders (optional), like <b>Chapter 2/Part A</b></label>
                  <input type="text" value={cpath} onChange={ev => setCpath(ev.target.value)} placeholder="Created inside the folder above" maxLength={120} autoComplete="off" />
                  <label>Tags (optional, comma separated)</label>
                  <input type="text" value={ctags} onChange={ev => setCtags(ev.target.value)} placeholder="e.g. lift, forces, exam" maxLength={120} autoComplete="off" />
                  <input type="file" accept=".txt,text/plain" multiple style={{ marginTop: 10 }} disabled={busy}
                    onChange={async ev => { const t = ev.target; await upload(t.files); t.value = ''; }} />
                  <textarea value={paste} onChange={ev => setPaste(ev.target.value)} placeholder={'#2.5 Theory of Turn\nquestion|correct|wrong1|wrong2|wrong3'} />
                  <div className="row"><button className="solid" type="button" disabled={busy} onClick={addPasted}>{busy ? 'Adding…' : 'Add cards'}</button></div>
                </div>
              )}
              <div id="imsg" className={msg.c}>{msg.t}</div>
              <div id="packs">
                <p className="n" style={{ marginTop: 10 }}><b>Your library:</b> {e.Q.length} cards{e.syncingCloud ? ' · syncing…' : ''}.</p>
                {packs.map(p => (
                  <div className="pk2" key={p.id}><span>{p.name}<br /><small className="gm">{p.card_count} cards · added {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · shared deck</small></span></div>
                ))}
                {e.DATA.packs.map((p, i) => (
                  <div className="pk2" key={'l' + i}><span>{p.name}<br /><small className="gm">on this device only</small></span>
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
