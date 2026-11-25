'use client';
import { useEffect, useState } from 'react';
import { offline, onNet } from '@/lib/net';

/** Small pill shown while the connection is gone or not really working: everything keeps working and is saved on the device. */
export function OfflineBadge() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const f = () => setOff(offline()); f();
    const u = onNet(f), t = setInterval(f, 5000);   // the "recent failure" window expires on its own
    return () => { u(); clearInterval(t); };
  }, []);
  if (!off) return null;
  return <div className="offline" role="status"><i /> Offline · your progress is saved on this device</div>;
}
