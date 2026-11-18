'use client';
import { siteOrigin } from '@/lib/base';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { sync, fmtCode } from '@/lib/sync';
import { Ic } from './ui';
import { useMe } from './Welcome';
import { engine } from '@/lib/engine';
import { notes } from '@/lib/notes';
import { labs } from '@/lib/prefs';

const ago = (t: number) => { if (!t) return 'not yet'; const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 90 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; };

export function SyncPanel() {
  const me = useMe(), s = sync(), [, bump] = useState(0), [code, setCode] = useState(''), [err, setErr] = useState(''), [show, setShow] = useState(false), [qr, setQr] = useState('');
  useEffect(() => { s.start(); const u = s.subscribe(() => bump(x => x + 1)), t = setInterval(() => bump(x => x + 1), 5000); return () => { u(); clearInterval(t); }; }, []); // eslint-disable-line
  const cfg = s.cfg, st = s.st, link = cfg ? `${siteOrigin()}/?sync=${cfg.code}` : '';
  useEffect(() => { if (show && link) QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setQr).catch(() => {}); }, [show, link]);
  const go = async (c?: string) => { setErr(''); try { await s.enable(c); setCode(''); } catch (e: any) { setErr(e.message || 'Could not start sync.'); } };
  return (
    <section className="scard"><h4><Ic n="data" />Sync your devices</h4>
      {me ? <Mine /> : <p className="n">Keep progress, notes, mistakes, shaky cards, folders, settings and 3D lab progress the same on your phone and computer. Sign in with Google above and it happens by itself, or pair devices with a secret code. Everything is encrypted before it leaves this device.</p>}
      {!cfg ? <>
        <div className="row"><button className="solid" onClick={() => go()}>Start syncing on this device</button></div>
        <p className="n">{me ? 'Starting sync for your account…' : 'Already syncing on another device? Enter its code:'}</p>
        <div className="row"><input value={code} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" onChange={e => setCode(e.target.value)} style={{ flex: 1, minWidth: 0 }} /><button className="ghost" disabled={code.replace(/[^0-9a-z]/gi, '').length < 20} onClick={() => go(code)}>Link</button></div>
      </> : <>
        <p className="n"><b>{st.state === 'syncing' ? 'Syncing…' : st.state === 'offline' ? 'Offline: will sync when you are back online' : st.state === 'error' ? 'Could not sync' : 'In sync'}</b> · last {ago(st.last)}{st.pending ? ` · ${st.pending} change${st.pending === 1 ? '' : 's'} waiting` : ''}</p>
        {st.state === 'error' && <p className="n" style={{ color: 'var(--bad)' }}>{st.err}</p>}
        <div className="row"><button className="ghost" onClick={() => { s.run(); }}>Sync now</button><button className="ghost" onClick={() => setShow(v => !v)}>{show ? 'Hide code' : 'Add another device'}</button><button className="ghost" onClick={() => { if (confirm('Stop syncing on this device? Your data here stays; it just stops matching your other devices.')) s.disable(); }}>Unlink</button></div>
        {show && <div className="n" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <p style={{ margin: 0 }}>On the other device open Settings → Sync and enter this code, or scan the QR code with its camera.</p>
          <code style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '.04em', userSelect: 'all' }}>{fmtCode(cfg.code)}</code>
          {qr && <img src={qr} alt="QR code to link a device" width={180} height={180} style={{ borderRadius: 10, background: '#fff' }} />}
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
          <p style={{ margin: 0 }}>Anyone with this code can read and change your synced data, so share it only with your own devices.</p>
        </div>}
        <p className="n">Not synced: PDF files (they stay on the device that added them), AI keys, reminders and your live-quiz player.</p>
      </>}
      {err && <p className="n" style={{ color: 'var(--bad)' }}>{err}</p>}
    </section>
  );
}

/** What your account carries, with live counts. All of it works offline; changes wait in the queue until you are online. */
function Mine() {
  const e = engine(), n = notes(), [, b] = useState(0);
  useEffect(() => { const u = [e.subscribe(() => b(x => x + 1)), labs.subscribe(() => b(x => x + 1))]; return () => u.forEach(f => f()); }, []); // eslint-disable-line
  const rows: [string, string][] = [
    ['Progress and streak', Object.keys(e.S.cards).length + ' cards'],
    ['Your cards and folders', e.MY.cards.length + ' cards, ' + e.LF.folders.length + ' folders'],
    ['Notes', n.list().length + ' notes'],
    ['Study settings, look and home layout', 'on'],
    ['3D lab progress', labs.seen() + ' models opened'],
  ];
  return (
    <div className="acc-sync">
      <p className="n" style={{ margin: '0 0 8px' }}>Signed in, so this is automatic and works offline first: everything is saved on the device and sent when you are online.</p>
      <ul className="acc-list">{rows.map(r => <li key={r[0]}><span>{r[0]}</span><b>{r[1]}</b></li>)}</ul>
    </div>
  );
}
