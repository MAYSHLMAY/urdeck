'use client';
import { useEffect, useState } from 'react';

/** Small pill shown only while the device is offline: everything keeps working and is saved on the device. */
export function OfflineBadge() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const f = () => setOff(!navigator.onLine); f();
    window.addEventListener('online', f); window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);
  if (!off) return null;
  return <div className="offline" role="status"><i /> Offline · your progress is saved on this device</div>;
}
