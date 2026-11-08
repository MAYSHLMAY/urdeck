'use client';
import { useRef, useState } from 'react';
import { DEF, steps, ymd } from '@/lib/srs';
import { api, isOwner, lock, unlock } from '@/lib/api';
import { dl, Sheet, SheetFrame, useEngine, Ic, ask } from './ui';
import { useRefs } from './refHooks';
import { SyncPanel } from './SyncPanel';

type F = [string, string, string, any?, any?, number?, string?, string?];
const BASIC: [string, string, F[]][] = [
  ['Studying', 'target', [
    ['limit', 'New cards per day', 'num', 1, 500, 1, 'S'],
    ['maxRev', 'Maximum reviews per day', 'num', 0, 2000, 10, '', '0 means no limit'],
    ['newOrder', 'New card order', 'sel', [['seq', 'In order'], ['rand', 'Random']]],
    ['mix', 'Show new cards', 'sel', [['after', 'After reviews'], ['mixed', 'Mixed with reviews'], ['first', 'Before reviews']]],
    ['exam', 'Exam date', 'date', 0, 0, 0, '', 'Shows a countdown and a daily pace']]],
  ['Look', 'palette', [
    ['theme', 'Theme', 'sel', [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']]],
    ['size', 'Text size', 'sel', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']]],
    ['vib', 'Vibrate on a wrong answer', 'chk']]]
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
    ['ivMod', 'Interval modifier', 'num', .5, 2, .05, '', 'Below 1 shows cards more often'],
    ['maxIv', 'Maximum interval (days)', 'num', 7, 36500, 1],
    ['lapseNew', 'Interval kept after a lapse (%)', 'num', 0, 100, 5],
    ['leech', 'Leech threshold (lapses)', 'num', 2, 30, 1],
    ['leechSusp', 'Suspend leeches', 'chk'],
    ['learnAhead', 'Learn-ahead (minutes)', 'num', 0, 60, 1, '', 'Show a learning card early only if it is due within this time. 0 = always wait the full step'],
    ['fuzz', 'Slightly randomise long intervals', 'chk'],
    ['autoGood', 'Quick rating: correct counts as Good', 'chk', '', '', 0, '', 'Hard and Easy stay available as small buttons']]]
];

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
      dl('flight-recall-library-' + ymd(new Date()) + '.json', JSON.stringify(r));
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
          {BASIC.map(([g, ic, fs]) => (
            <section className="scard" key={g}><h4><Ic n={ic} />{g}</h4>{fs.map(field)}</section>
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

          <section className="scard"><h4><Ic n="data" />Your data</h4>
            <p className="n">Your progress is saved <b>automatically on this device</b>. Cards, folders, PDFs and models live in the shared database.</p>
            <div className="row">
              <button className="solid" onClick={() => { dl('Flight-Recall-backup-' + ymd(new Date()) + '.json', e.backupJSON()); say('Backup downloaded.'); }}>Download backup</button>
              <button className="ghost" onClick={() => bk.current?.click()}>Restore…</button>
              {owner && <button className="ghost" onClick={exportLibrary}>Export library</button>}
            </div>
            <input ref={bk} type="file" accept=".json,application/json" hidden onChange={async ev => {
              const f = ev.target.files?.[0]; if (!f) return;
              try { say(e.restoreBackup(await f.text())); } catch { say('That is not a Flight Recall backup file.', 'err'); }
              ev.target.value = '';
            }} />
            <p className={'n ' + msg.c} id="smsg">{msg.t}</p>
          </section>

          <details className="scard adv"><summary><Ic n="sliders" />Advanced</summary>
            {ADVANCED.map(([g, fs]) => <div key={g}><h5>{g}</h5>{fs.map(field)}</div>)}
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
            <p className="n">Merge an older Flight Recall .html file (adds its question banks and progress):</p>
            <input type="file" accept=".html,text/html" onChange={async ev => {
              const f = ev.target.files?.[0]; if (!f) return;
              try {
                const t = await f.text(), m = t.match(/<script id="fr-data" type="application\/json">([\s\S]*?)<\/script>/);
                if (!m) throw 0; say(e.mergeData(JSON.parse(m[1])));
              } catch { say('That is not a Flight Recall .html file.', 'err'); }
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
