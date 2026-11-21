'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, SheetFrame, useEngine, Ic } from './ui';
import { isOwner } from '@/lib/api';
import { withKind, distractors } from '@/lib/kind';
import { withImg } from '@/lib/cardimg';
import { adapters, checkManifest, cite, CATS, EXAMPLE, search, type Cat, type Item, type Manifest } from '@/lib/adapters';

const useAd = () => { const [, b] = useState(0); useEffect(() => { const f = () => b(x => x + 1); addEventListener('ud-adapters', f); return () => removeEventListener('ud-adapters', f); }, []); };
const K_SET = 'ud-res-set';

/** Research pane: papers, pictures and articles from every connected source, without leaving the page you are reading. */
export function ResearchPane({ seed, seedKey, onAsk }: { seed: string; seedKey: number; onAsk: (t: string) => void }) {
  useAd();
  const e = useEngine();
  const cats = CATS.filter(c => adapters.on(c.k).length);
  const [cat, setCat] = useState<Cat>('paper'), [q, setQ] = useState(''), [items, setItems] = useState<Item[] | null>(null), [busy, setBusy] = useState(false), [errs, setErrs] = useState<string[]>([]);
  const [open, setOpen] = useState<string>(''), [view, setView] = useState<Item | null>(null), [mk, setMk] = useState<Item | null>(null), [src, setSrc] = useState(false), [msg, setMsg] = useState('');
  const run = useRef(0);
  const go = async (text = q, c = cat) => {
    const t = text.trim(); if (t.length < 2) return;
    const id = ++run.current; setBusy(true); setErrs([]); setItems(null);
    const r = await search(c, t); if (id !== run.current) return;
    setItems(r.items); setErrs(r.errs); setBusy(false);
  };
  useEffect(() => { if (seed.trim().length > 1) { const t = seed.replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' '); setQ(t); go(t); } }, [seedKey]); // eslint-disable-line
  useEffect(() => { if (cats.length && !cats.some(c => c.k === cat)) setCat(cats[0].k); }, [cats.length]); // eslint-disable-line
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 1800); };
  const copy = (t: string, ok: string) => navigator.clipboard?.writeText(t).then(() => flash(ok), () => flash('Could not copy.'));
  const askAbout = (i: Item) => onAsk('Explain this ' + (i.cat === 'image' ? 'image' : i.cat) + ' in simple words and tell me why it matters for my studies.\n\n' + i.title + (i.by ? ' (' + i.by + (i.year ? ', ' + i.year : '') + ')' : '') + (i.text ? '\n' + i.text : ''));
  const act = (i: Item) => (
    <div className="rch-acts">
      <button type="button" onClick={() => setMk(i)}><Ic n="plus" />Card</button>
      <button type="button" onClick={() => askAbout(i)}><Ic n="sparkle" />Ask AI</button>
      <button type="button" onClick={() => copy(cite(i), 'Citation copied.')}><Ic n="copy" />Cite</button>
      {(i.pdf || i.link) && <a href={i.pdf || i.link} target="_blank" rel="noreferrer"><Ic n="expand" />{i.pdf ? 'PDF' : 'Open'}</a>}
    </div>
  );
  return (
    <div className="rd-pane-in rch">
      <form className="rch-q" onSubmit={ev => { ev.preventDefault(); go(); }}>
        <input value={q} onChange={ev => setQ(ev.target.value)} placeholder="Search papers, images, topics" aria-label="Search" enterKeyHint="search" autoCapitalize="off" />
        <button className="solid" disabled={busy || q.trim().length < 2} aria-label="Search"><Ic n="search" /></button>
        <button type="button" className="rd-ib" aria-label="Sources" title="Choose sources" onClick={() => setSrc(true)}><Ic n="sliders" /></button>
      </form>
      <div className="rd-chips rch-cats" role="tablist">
        {cats.map(c => <button key={c.k} type="button" role="tab" aria-selected={cat === c.k} className={cat === c.k ? 'on' : ''} onClick={() => { setCat(c.k); setItems(null); setErrs([]); if (q.trim().length > 1) go(q, c.k); }}>{c.l}</button>)}
      </div>
      <div className="rch-list">
        {!cats.length && <div className="rd-empty"><span className="rd-ei"><Ic n="cloud" /></span><b>No source is switched on</b><p>Choose where results should come from.</p><button className="solid" onClick={() => setSrc(true)}>Sources</button></div>}
        {cats.length > 0 && items === null && !busy && !errs.length && <div className="rd-empty"><span className="rd-ei"><Ic n="search" /></span><b>Find it without leaving the page</b><p>Select words in the page and choose Research, or type here. Every result can become a card, a citation, or a question for the AI.</p></div>}
        {busy && <div className="rch-skel" aria-label="Searching">{[0, 1, 2].map(i => <i key={i} />)}</div>}
        {items && !items.length && !errs.length && <p className="rd-foot">Nothing found. Try fewer or different words.</p>}
        {errs.map((x, i) => <p key={i} className="rd-foot rch-err">{x}</p>)}
        {items && cat === 'image' && <div className="rch-grid">{items.map(i => <button key={i.id} type="button" className="rch-im" onClick={() => setView(i)} aria-label={i.title}><img src={i.thumb || i.image} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>{i.srcName}</span></button>)}</div>}
        {items && cat !== 'image' && items.map(i => (
          <article key={i.id} className="rch-it">
            <header>{i.thumb && <img src={i.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}<div><h4>{i.title}</h4><small>{[i.by, i.year, i.srcName].filter(Boolean).join(' · ')}</small></div></header>
            {i.text && <p className={open === i.id ? 'full' : ''} onClick={() => setOpen(open === i.id ? '' : i.id)}>{i.text}</p>}
            {act(i)}
          </article>
        ))}
      </div>
      {msg && <div className="rch-toast" role="status">{msg}</div>}
      <Sheet open={!!view} onClose={() => setView(null)} className="sheet rch-sheet">
        {view && <SheetFrame title={<span className="ttl">{view.srcName}</span>} onClose={() => setView(null)}>
          <div className="sc"><img className="rch-big" src={view.image || view.thumb} alt={view.title} referrerPolicy="no-referrer" />
            <b>{view.title}</b><small className="rch-credit">{[view.by && 'By ' + view.by, view.license, view.srcName].filter(Boolean).join(' · ')}</small>
            {act(view)}</div>
        </SheetFrame>}
      </Sheet>
      {mk && <MakeFromItem item={mk} onClose={() => setMk(null)} onDone={t => { setMk(null); flash(t); }} />}
      <Sheet open={src} onClose={() => setSrc(false)} className="sheet cx-sheet">
        <SheetFrame title={<span className="ttl"><Ic n="cloud" /> Sources</span>} onClose={() => setSrc(false)}><div className="sc"><Connections /></div></SheetFrame>
      </Sheet>
    </div>
  );
}

/** Turn a result into a flip card (a picture result becomes a picture card), keeping the credit on the back. */
function MakeFromItem({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: (t: string) => void }) {
  const e = useEngine(), own = isOwner(), img = item.cat === 'image';
  const credit = [item.by, item.year, item.srcName].filter(Boolean).join(', ') + (item.link ? ' · ' + item.link : '');
  const [front, setFront] = useState(img ? 'What is shown here?' : item.title), [back, setBack] = useState(img ? item.title : (item.text ? item.text.slice(0, 520) : '') || item.title);
  const sets = useMemo(() => [...new Set(e.Q.map(x => x.s))].map(k => { const i = e.FT.secInfo.get(k); return { s: k, label: i ? (i.n ? i.n + ' · ' : '') + i.t : k }; }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [e.qver]); // eslint-disable-line
  const [set, setSet] = useState(() => { try { return localStorage.getItem(K_SET) || ''; } catch { return ''; } }), [nw, setNw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if ((!set || (set !== '__new' && !sets.some(x => x.s === set))) && sets.length) setSet(sets[0].s); }, [sets]); // eslint-disable-line
  const name = set === '__new' ? nw.trim() : set, ok = !!name && front.trim() && back.trim();
  async function save() {
    setBusy(true); setErr('');
    const pool = e.Q.filter(x => x.s === name), a = (back.trim() + '\n\n' + credit).slice(0, 1200);
    const q = withKind(img ? withImg(front.trim(), { src: item.image || item.thumb || '', pins: [] }) : front.trim(), 'f').slice(0, 3800);
    const row = { q, c: a, w: distractors(back, pool), p: false };
    const m = own ? await e.addOneCard({ s: name, ...row }) : e.myAddCard({ s: name, ...row });
    setBusy(false); if (m) { setErr(m); return; }
    try { localStorage.setItem(K_SET, name); } catch { /* ignore */ }
    e.toast('Card made'); onDone('Card made.');
  }
  return (
    <Sheet open onClose={onClose} className="sheet rch-mk">
      <SheetFrame title={<span className="ttl"><Ic n="plus" /> Make a card</span>} onClose={onClose}>
        <div className="sc">
          {img && <img className="rch-big sm" src={item.image || item.thumb} alt="" referrerPolicy="no-referrer" />}
          <label className="cl">Front</label><textarea rows={2} value={front} onChange={ev => setFront(ev.target.value)} />
          <label className="cl">Back</label><textarea rows={img ? 2 : 5} value={back} onChange={ev => setBack(ev.target.value)} maxLength={1000} />
          <label className="cl">Set</label>
          <select value={set} onChange={ev => setSet(ev.target.value)}>{sets.map(x => <option key={x.s} value={x.s}>{x.label}</option>)}<option value="__new">New set…</option></select>
          {set === '__new' && <input type="text" value={nw} onChange={ev => setNw(ev.target.value)} placeholder="Name of the new set" />}
          {err && <p className="err" role="alert">{err}</p>}
          <p className="n">The source and author are added to the back of the card.</p>
          <div className="row"><button className="ghost" onClick={onClose}>Cancel</button><button className="solid" disabled={!ok || busy} onClick={save}><Ic n="check" /> Make card</button></div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}

/** The plug board: switch sources on and off, give a source its key, or plug in a new one by pasting its description. */
export function Connections() {
  useAd();
  const [add, setAdd] = useState(false), [txt, setTxt] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const list = adapters.all();
  async function plug() {
    setErr(''); setBusy(true);
    try {
      let t = txt.trim();
      if (/^https:\/\//i.test(t)) { const r = await fetch(t); if (!r.ok) throw new Error('Could not open that address.'); t = await r.text(); }
      let j: any; try { j = JSON.parse(t); } catch { throw new Error('That is not valid JSON.'); }
      const r = checkManifest(j); if (!r.m) throw new Error(r.err);
      adapters.add(r.m); setAdd(false); setTxt('');
    } catch (x: any) { setErr(x.message || 'Could not add it.'); }
    setBusy(false);
  }
  return (
    <div className="cx">
      <p className="n">Each source is a plug. Switch on the ones you want; results from all of them appear together in the Research pane of the Reader. Keys stay on this device.</p>
      {CATS.map(c => { const ms = list.filter(m => m.cat === c.k); return ms.length ? (
        <div key={c.k} className="cx-grp"><h5>{c.l}</h5>
          {ms.map(m => <Row key={m.id} m={m} />)}
        </div>) : null; })}
      {!add ? <button type="button" className="ghost cx-add" onClick={() => { setAdd(true); setTxt(''); setErr(''); }}><Ic n="plus" />Plug in another source</button> : (
        <div className="cx-form">
          <p className="n">Paste the source description (JSON) or an https address that serves it. Descriptions are only data, so they cannot run anything on your device.</p>
          <textarea rows={8} value={txt} onChange={ev => setTxt(ev.target.value)} spellCheck={false} placeholder='{"id":"…","name":"…","cat":"paper","url":"https://…{q}…","items":"…","map":{"title":"…"}}' />
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row"><button className="ghost" onClick={() => setTxt(EXAMPLE)}>Fill an example</button><button className="ghost" onClick={() => setAdd(false)}>Cancel</button><button className="solid" disabled={busy || !txt.trim()} onClick={plug}>{busy ? 'Checking…' : 'Plug in'}</button></div>
        </div>
      )}
    </div>
  );
}
function Row({ m }: { m: Manifest }) {
  const on = adapters.isOn(m.id), [k, setK] = useState(adapters.key(m.id)), [show, setShow] = useState(false);
  return (
    <div className={'cx-row' + (on ? ' on' : '')}>
      <button type="button" className="cx-sw" role="switch" aria-checked={on} aria-label={m.name} onClick={() => adapters.toggle(m.id)}><i /></button>
      <div className="cx-tx"><b>{m.name}{m.builtin ? '' : ' · yours'}</b><small>{m.about || m.url.split('/')[2]}</small>
        {m.key && on && <input type="password" value={k} onChange={ev => setK(ev.target.value)} onBlur={() => adapters.setKey(m.id, k)} placeholder={(m.key.required ? 'Key needed' : 'Key (optional)') + (m.key.help ? ' · ' + m.key.help : '')} autoComplete="off" spellCheck={false} />}
      </div>
      {!m.builtin && <button type="button" className="rd-ib sm" aria-label={'Remove ' + m.name} onClick={() => { if (!show) { setShow(true); setTimeout(() => setShow(false), 2500); } else adapters.remove(m.id); }}>{show ? <small>Tap again</small> : <Ic n="trash" />}</button>}
    </div>
  );
}
