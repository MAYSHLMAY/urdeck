'use client';
import { startGuide } from './Guide';
import { safe, type SnapInfo } from '@/lib/safety';
import { off as reportsOff } from '@/lib/report';
import { Connections } from './Research';
import Link from 'next/link';
import { AccountCard } from './Welcome';
import { Appearance } from './Appearance';
import { useEffect, useRef, useState } from 'react';
import { DEF, steps, ymd } from '@/lib/srs';
import { api, isOwner, lock, unlock } from '@/lib/api';
import { dl, Sheet, SheetFrame, useEngine, Ic, ask } from './ui';
import { useRefs } from './refHooks';
import { SyncPanel } from './SyncPanel';
import { AiConnect } from './AiConnect';
import { askPermission, scheduleReminder, supportsReminders } from '@/lib/remind';
import { ACCENTS, applyLook, getLook } from '@/lib/look';

type F = [string, string, string, any?, any?, number?, string?, string?];
const BASIC: [string, string, F[]][] = [
  ['Studying', 'target', [
    ['limit', 'New cards per day', 'num', 1, 500, 1, 'S'],
    ['maxRev', 'Maximum reviews per day', 'num', 0, 2000, 10, '', '0 means no limit'],
    ['newOrder', 'New card order', 'sel', [['seq', 'In order'], ['rand', 'Random']]],
    ['mix', 'Show new cards', 'sel', [['after', 'After reviews'], ['mixed', 'Mixed with reviews'], ['first', 'Before reviews']]],
    ['conf', 'Ask how sure I am before answering', 'chk'],
    ['dailyGoal', 'Daily goal (answers)', 'num', 5, 500, 5, '', 'The ring on Home fills as you answer'],
    ['exam', 'Exam date', 'date', 0, 0, 0, '', 'Shows a countdown and a daily pace'],
    ['examCap', 'Keep every review before the exam date', 'chk', '', '', 0, '', 'Intervals are shortened so no card is scheduled past the day before the exam'],
    ['examPace', 'Raise new cards per day to finish before the exam', 'chk', '', '', 0, '', 'Uses the pace shown on Home as your new-card limit when it is higher']]],
  ['Look', 'palette', [
    ['theme', 'Theme', 'sel', [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']]],
    ['size', 'Text size', 'sel', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']]],
    ['readable', 'Easy-reading text (wider spacing, calmer font)', 'chk'],
    ['contrast', 'High contrast', 'chk'],
    ['vib', 'Vibrate on a wrong answer', 'chk'],
    ['sound', 'Answer sounds', 'chk']]],
  ['Smart help', 'bolt', [
    ['smart', 'Smart help: grade typed answers by meaning, show related cards, spot mistake patterns (works offline)', 'chk']]]
];
const ADVANCED: [string, F[]][] = [
  ['Scheduling', [
    ['rollover', 'Next day starts at (hour)', 'num', 0, 23, 1, '', 'Cards due “tomorrow” appear after this hour. 4 = 4 a.m.'],
    ['steps', 'Learning steps (minutes)', 'text', 0, 0, 0, '', 'Separate with spaces, e.g. 1 10'],
    ['relearn', 'Relearning steps (minutes)', 'text'],
    ['wrongMin', 'Wrong answer returns after, min (minutes)', 'num', 1, 60, 1],
    ['wrongMax', 'Wrong answer returns after, max (minutes)', 'num', 1, 120, 1],
    ['grad', 'Graduating interval (days)', 'num', 1, 30, 1],
    ['easyIv', 'Easy interval (days)', 'num', 1, 60, 1],
    ['startEase', 'Starting ease', 'num', 1.3, 4, .05],
    ['easyBonus', 'Easy bonus', 'num', 1, 2, .05],
    ['hardIv', 'Hard interval', 'num', 1, 2, .05],
    ['retention', 'Target recall (%)', 'num', 70, 97, 1, '', 'How sure you want to be of remembering when a card returns. Higher means shorter intervals and more reviews. 90 is standard'],
    ['revOrder', 'Review order', 'sel', [['due', 'Most overdue first'], ['rand', 'Random'], ['ivl', 'Shortest interval first'], ['ease', 'Lowest ease first']]],
    ['lapseMin', 'Minimum interval after a lapse (days)', 'num', 1, 30, 1],
    ['maxIv', 'Maximum interval (days)', 'num', 7, 36500, 1],
    ['lapseNew', 'Interval kept after a lapse (%)', 'num', 0, 100, 5],
    ['leech', 'Leech threshold (lapses)', 'num', 2, 30, 1],
    ['leechSusp', 'Suspend leeches automatically', 'chk', '', '', 0, '', 'Found again every half threshold. Treat them in the Leech Lab'],
    ['learnAhead', 'Learn-ahead (minutes)', 'num', 0, 60, 1, '', 'Show a learning card early only if it is due within this time. 0 = always wait the full step'],
    ['fuzz', 'Slightly randomise long intervals', 'chk'],
    ['autoGood', 'Quick rating: correct counts as Good', 'chk', '', '', 0, '', 'Hard and Easy stay available as small buttons']]]
];

function Reminder() {
  const e = useEngine(), [msg, setMsg] = useState(''), v = (e.O.remind as string) || '';
  const apply = async (t: string) => {
    if (t) { const err = await askPermission(); if (err) { setMsg(err); return; } }
    e.O.remind = t; e.later = {}; e.save(); e.emit(); await scheduleReminder(e); setMsg(t ? 'Reminder set for ' + t + '.' : 'Reminder off.');
  };
  return (
    <div className="f swf"><label>Daily reminder<small>A notification at this time, with how many cards are waiting</small></label>
      <div className="row" style={{ alignItems: 'center' }}>
        <input type="time" value={v} onChange={ev => apply(ev.target.value)} disabled={!supportsReminders()} />
        {v && <button type="button" className="ghost" onClick={() => apply('')}>Turn off</button>}
      </div>
      {msg && <p className="n">{msg}</p>}
      {!msg && v && <p className="n">Works best once the app is installed (Add to Home Screen). Browsers cannot always wake a closed app, so a push server would be needed for guaranteed delivery.</p>}
    </div>
  );
}

function Swatches() {
  const [a, setA] = useState(getLook().a);
  return (
    <div className="f swf"><label>Colour<small>Pick the accent used across the whole app</small></label>
      <div className="swatches" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map(([id, nm, hex]) => <button key={id} type="button" role="radio" aria-checked={a === id} aria-label={nm} title={nm} className={'swc' + (a === id ? ' on' : '')} style={{ ['--sw' as any]: hex }} onClick={() => { setA(id); applyLook({ a: id }); }} />)}
      </div>
    </div>
  );
}

function SafetyCopies({ say }: { say: (t: string, c?: string) => void }) {
  const [open, setOpen] = useState(false), [list, setList] = useState<SnapInfo[] | null>(null);
  const names: Record<string, string> = { daily: 'Daily copy', update: 'Before an update', shrink: 'Before a big change', restore: 'Before a restore', migrate: 'Before an upgrade' };
  const show = async () => { setOpen(o => !o); if (!list) setList(await safe.list()); };
  return (
    <div className="safec">
      <button className="ghost sm" onClick={show} aria-expanded={open}>Safety copies</button>
      {open && <div className="sflist">
        <p className="n">The app keeps a few copies of your progress on this phone by itself. Restoring one first saves what you have now, so you can undo it.</p>
        {!list ? <p className="n">Looking…</p> : !list.length ? <p className="n">No copies yet. The first one is made the next time you open the app.</p> : list.map(x => (
          <div className="sfrow" key={x.id}>
            <span><b>{names[x.label] || x.label}</b><small>{new Date(x.t).toLocaleString()} · {x.cards} cards tracked</small></span>
            <button className="ghost sm" onClick={async () => { if (!confirm('Put this copy back? Your current progress is saved as a copy first.')) return; if (await safe.restore(x.id)) { say('Restored. Reloading…'); setTimeout(() => location.reload(), 600); } else say('That copy could not be restored.', 'err'); }}>Restore</button>
          </div>))}
      </div>}
    </div>
  );
}

function CrashToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(!reportsOff()); }, []);
  return (
    <label className="safec crash">
      <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); try { localStorage.setItem('ud-noreport', e.target.checked ? '0' : '1'); } catch { /* ignore */ } }} />
      <span><b>Send crash reports</b><small>Only the error text, the page and the app version. Never your cards, notes or name.</small></span>
    </label>
  );
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const e = useEngine(), R = useRefs();
  const [msg, setMsg] = useState<{ t: string; c: string }>({ t: '', c: '' });
  const bk = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState(''), [pwm, setPwm] = useState('');
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const S = e.S, O: any = e.O, owner = isOwner(), say = (t: string, c = 'ok') => setMsg({ t, c });
  const ks = [...new Set(e.Q.filter(q => !q.p && /^\d/.test(q.g)).map(q => q.g))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const change = (f: F, raw: any) => {
    const [k, , t, lo, hi, , tg] = f; let v: any;
    if (t === 'chk') v = !!raw;
    else if (t === 'num') { v = parseFloat(raw); if (isNaN(v)) v = (DEF as any)[k] !== undefined ? (DEF as any)[k] : S[k]; v = Math.min(hi, Math.max(lo, v)); }
    else if (t === 'text') { v = steps(raw, []).join(' '); if (!v) v = (DEF as any)[k]; }
    else v = raw;
    if (tg === 'S') S[k] = v; else O[k] = v;
    if (k === 'wrongMax' || k === 'wrongMin') { if (O.wrongMax < O.wrongMin) O.wrongMax = O.wrongMin; }
    if (k === 'theme') applyLook({ t: v });
    e.later = {}; e.save(); e.emit();
  };

  const field = (f: F) => {
    const [k, l, t, a, , st, tg, help] = f, v = tg === 'S' ? S[k] : O[k];
    const common = { key: k + ':' + String(v) };
    const inp = t === 'sel'
      ? <select {...common} defaultValue={v} onChange={ev => change(f, ev.target.value)}>{(a as [string, string][]).map(([val, lb]) => <option key={val} value={val}>{lb}</option>)}</select>
      : t === 'chk'
        ? <input {...common} type="checkbox" defaultChecked={!!v} onChange={ev => change(f, ev.target.checked)} />
        : t === 'num'
          ? <input {...common} type="number" min={a} max={f[4]} step={st} defaultValue={v} onBlur={ev => change(f, ev.target.value)} />
          : <input {...common} type={t === 'date' ? 'date' : 'text'} defaultValue={v} onBlur={ev => change(f, ev.target.value)} />;
    return <div className="f" key={k}><label>{l}{help ? <small>{help}</small> : null}</label>{inp}</div>;
  };

  async function exportLibrary() {
    try {
      const r = await api<any>('/api/export', undefined, 'GET');
      dl('urdeck-library-' + ymd(new Date()) + '.json', JSON.stringify(r));
      say('Library exported.');
    } catch (x: any) { say(x.message, 'err'); }
  }

  async function doUnlock() {
    setPwm('');
    const err = await unlock(pw.trim());
    if (err) { setPwm(err); return; }
    setPw(''); e.emit(); say('Owner tools unlocked.');
  }

  return (
    <Sheet open={open} onClose={onClose} className="sheet set">
      <SheetFrame title="Settings" onClose={onClose}>
        <div className="sc setp">
          <AccountCard />
          <section className="scard"><h4>Help</h4><p className="wl-hint" style={{ textAlign: 'left' }}>New here? A short guide points at the real buttons and moves on as you tap them.</p><button className="wl-btn pri" onClick={() => { onClose(); setTimeout(startGuide, 400); }}>Show me around</button></section>
          <Appearance onArrange={onClose} />
          {BASIC.map(([g, ic, fs]) => (
            <section className="scard" key={g}><h4><Ic n={ic} />{g}</h4>{g === 'Look' && <Swatches />}{g === 'Studying' && <Reminder />}{fs.map(field)}</section>
          ))}

          <section className="scard"><h4><Ic n="key" />Owner</h4>
            {owner ? <>
              <p className="n">Owner tools are <b>unlocked</b> on this device: you can add cards, folders, PDFs and 3D models. Deleting always asks for the password again.</p>
              <div className="row"><button className="ghost" onClick={() => { lock(); e.emit(); say('Locked.'); }}>Lock owner tools</button></div>
            </> : <>
              <p className="n">Everyone can study. Only the owner can add or change shared content, and nothing can be deleted without the password.</p>
              <div className="pwrow">
                <input type="password" value={pw} autoComplete="current-password" placeholder="Owner password" onChange={ev => setPw(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') doUnlock(); }} />
                <button className="solid" onClick={doUnlock} disabled={!pw.trim()}>Unlock</button>
              </div>
              {pwm && <p className="n err">{pwm}</p>}
            </>}
          </section>

          <AiConnect />
          <SyncPanel />

          <section className="scard"><h4><Ic n="lock" />Your private space</h4>
            {(() => {
              const my = e.myChanges();
              return <>
                <p className="n">Your own PDFs, cards, edits and removals are kept <b>only on this device</b>. They are never uploaded and nobody else sees them.</p>
                <p className="n">{R.localPdfs.length} PDF{R.localPdfs.length === 1 ? '' : 's'} · {my.mine} own card{my.mine === 1 ? '' : 's'} · {my.edited} edited · {my.hidden} removed</p>
                <div className="row">
                  {my.hidden + my.edited > 0 && <button className="ghost" onClick={async () => { const r = await ask({ title: 'Bring back the originals?', msg: 'Your edits and removals are undone. Your own cards and PDFs stay.', acts: [{ k: 'ok', l: 'Restore originals' }] }); if (r && r.act) { e.myRestoreOriginals(); say('Originals restored.'); } }}>Restore originals</button>}
                </div>
              </>;
            })()}
          </section>

          <section className="scard"><h4><Ic n="cloud" />Sources</h4>
            <Connections />
          </section>

          <section className="scard"><h4><Ic n="data" />Your data</h4>
            <p className="n">Your progress is saved <b>automatically on this device</b>. Cards, folders, PDFs and models live in the shared database.</p>
            <div className="row">
              <button className="solid" onClick={() => { dl('UrDeck-backup-' + ymd(new Date()) + '.json', e.backupJSON()); say('Backup downloaded.'); }}>Download backup</button>
              <button className="ghost" onClick={() => bk.current?.click()}>Restore…</button>
              {owner && <button className="ghost" onClick={exportLibrary}>Export library</button>}
            </div>
            <input ref={bk} type="file" accept=".json,application/json" hidden onChange={async ev => {
              const f = ev.target.files?.[0]; if (!f) return;
              try { say(e.restoreBackup(await f.text())); } catch { say('That is not an UrDeck backup file.', 'err'); }
              ev.target.value = '';
            }} />
            <p className={'n ' + msg.c} id="smsg">{msg.t}</p>
            <SafetyCopies say={say} />
            <CrashToggle />
          </section>

          <details className="scard adv"><summary><Ic n="sliders" />Advanced</summary>
            {ADVANCED.map(([g, fs]) => <div key={g}><h5>{g}</h5>{fs.map(field)}</div>)}
            <div className="f"><label>Leech Lab<small>{e.leeches().length} stuck card{e.leeches().length === 1 ? '' : 's'} right now</small></label><Link className="solid" href="/leeches" onClick={onClose} style={{ textAlign: "center", textDecoration: "none" }}>Open</Link></div>
            <h5>Section titles</h5>
            <p className="n">Titles come from your upload headers (for example <b>#2.4 Steady State Flights &amp; Performance</b>). Renames are saved on this device.</p>
            <div id="ttl">
              {ks.length ? ks.map(k => (
                <div className="f" key={k}><label><b className="gk">{k}</b></label>
                  <input type="text" key={k + e.gname(k)} defaultValue={e.gname(k)} placeholder="Title"
                    onBlur={ev => { const v = ev.target.value.trim(); if (v !== e.gname(k)) { e.setTitle(k, v); e.toast('Title updated'); } }} /></div>
              )) : <p className="n">No numbered sections yet.</p>}
            </div>
            <h5>Import</h5>
            {e.oldData() && <div className="row"><button className="ghost" onClick={() => { const o = e.oldData(); if (o) say(e.mergeData(o)); }}>Import from old version in this browser</button></div>}
            <p className="n">Merge an older UrDeck .html file (adds its question banks and progress):</p>
            <input type="file" accept=".html,text/html" onChange={async ev => {
              const f = ev.target.files?.[0]; if (!f) return;
              try {
                const t = await f.text(), m = t.match(/<script id="fr-data" type="application\/json">([\s\S]*?)<\/script>/);
                if (!m) throw 0; say(e.mergeData(JSON.parse(m[1])));
              } catch { say('That is not an UrDeck .html file.', 'err'); }
              ev.target.value = '';
            }} />
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={() => { e.restoreDefaults(); e.toast('Default settings restored'); }}>Restore default settings</button>
              <button className="ghost" onClick={() => { if (confirm('Erase all progress and start again?')) { e.resetProgress(); onClose(); } }}>Reset my progress</button>
            </div>
          </details>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
