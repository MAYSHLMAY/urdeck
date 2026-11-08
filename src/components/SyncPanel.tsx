'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { sync, fmtCode } from '@/lib/sync';
import { Ic } from './ui';

const ago = (t: number) => { if (!t) return 'not yet'; const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 90 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; };

export function SyncPanel() {
  const s = sync(), [, bump] = useState(0), [code, setCode] = useState(''), [err, setErr] = useState(''), [show, setShow] = useState(false), [qr, setQr] = useState('');
  useEffect(() => { s.start(); const u = s.subscribe(() => bump(x => x + 1)), t = setInterval(() => bump(x => x + 1), 5000); return () => { u(); clearInterval(t); }; }, []); // eslint-disable-line
  const cfg = s.cfg, st = s.st, link = cfg ? `${location.origin}/?sync=${cfg.code}` : '';
  useEffect(() => { if (show && link) QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setQr).catch(() => {}); }, [show, link]);
  const go = async (c?: string) => { setErr(''); try { await s.enable(c); setCode(''); } catch (e: any) { setErr(e.message || 'Could not start sync.'); } };
  return (
    <section className="scard"><h4><Ic n="data" />Sync your devices</h4>
      <p className="n">Keep progress, notes, mistakes, shaky cards, folders and your own cards the same on your phone and computer. No account: devices pair with a secret code and everything is encrypted before it leaves this device.</p>
      {!cfg ? <>
        <div className="row"><button className="solid" onClick={() => go()}>Start syncing on this device</button></div>
        <p className="n">Already syncing on another device? Enter its code:</p>
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
        <p className="n">Not synced: PDF files (they stay on the device that added them), display settings and your live-quiz player.</p>
      </>}
      {err && <p className="n" style={{ color: 'var(--bad)' }}>{err}</p>}
    </section>
  );
}
