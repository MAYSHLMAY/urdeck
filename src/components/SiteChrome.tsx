'use client';
import { isNative } from '@/lib/base';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Ic } from './ui';

const PLANE = <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><rect x="5.2" y="3.2" width="11.6" height="15.6" rx="2.6" fill="currentColor" opacity=".3" transform="rotate(-14 11 11)" /><rect x="6.6" y="4" width="11.6" height="15.6" rx="2.6" fill="currentColor" opacity=".55" transform="rotate(-6 12 12)" /><rect x="7.6" y="4.6" width="11.2" height="15.2" rx="2.6" fill="currentColor" /><path d="m10.6 12.4 2 2 3.6-4.4" fill="none" stroke="var(--card,#fff)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>;
export const Tibeb = ({ className = '' }: { className?: string }) => <div className={'tibeb ' + className} aria-hidden />;

/** Top bar used on the home page. */
export function SiteNav({ owner, onSettings }: { owner: boolean; onSettings: () => void }) {
  return (
    <nav className="snav" aria-label="Main">
      <Link href="/" className="sbrand">{PLANE}<span>UrDeck</span></Link>
      <div className="slinks">
        <Link href="/study">Study</Link>
        <Link href="/articles">Articles</Link>
        <Link href="/lab">3D lab</Link>
        <Link href="/play">Live quiz</Link>
        {owner && <Link href="/host">Host</Link>}
      </div>
      <div className="stools">
        {owner && <span className="own" title="Owner tools are unlocked"><Ic n="key" /> Owner</span>}
        <button className="ico" onClick={onSettings} aria-label="Settings" title="Settings"><Ic n="sliders" /></button>
      </div>
    </nav>
  );
}

/** App-style bottom tab bar (phones only; hidden on wide screens, where the top bar is used). */
export function TabBar() {
  const router = useRouter();
  useEffect(() => { const go = () => ['/', '/study', '/lab', '/play', '/exam', '/duel'].filter(r => r !== '/lab' || isNative()).forEach(r => { try { router.prefetch(r); } catch { /* ignore */ } }); const w: any = window; const h = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1200); return () => { if (w.cancelIdleCallback && w.requestIdleCallback) w.cancelIdleCallback(h); else clearTimeout(h); }; }, [router]);
  const path = (usePathname() || '/').replace(/(.)\/$/, '$1'); // the app build uses trailing slashes
  if (!(path === '/' || path === '/study' || path === '/lab')) return null;
  const T: [string, string, string][] = [['/', 'home', 'Home'], ['/study', 'cap', 'Study'], ['/play', 'play', 'Quiz'], ['/lab', 'cube', '3D lab']];
  return (
    <nav className="tabbar" aria-label="Main">
      {T.map(([h, ic, l]) => <Link key={h} href={h} className={path === h ? 'on' : ''} aria-current={path === h ? 'page' : undefined}><Ic n={ic} /><span>{l}</span></Link>)}
    </nav>
  );
}
