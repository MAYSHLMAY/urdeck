'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ic } from './ui';

const PLANE = <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M2 12 22 3l-5 18-5-7z" fill="currentColor" /></svg>;
export const Tibeb = ({ className = '' }: { className?: string }) => <div className={'tibeb ' + className} aria-hidden />;

/** Top bar used on the home page. */
export function SiteNav({ owner, onSettings }: { owner: boolean; onSettings: () => void }) {
  return (
    <nav className="snav" aria-label="Main">
      <Link href="/" className="sbrand">{PLANE}<span>Flight Recall</span></Link>
      <div className="slinks">
        <Link href="/study">Study</Link>
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
  const path = usePathname() || '/';
  if (!(path === '/' || path === '/study' || path === '/lab')) return null;
  const T: [string, string, string][] = [['/', 'home', 'Home'], ['/study', 'cap', 'Study'], ['/play', 'play', 'Quiz'], ['/lab', 'cube', '3D lab']];
  return (
    <nav className="tabbar" aria-label="Main">
      {T.map(([h, ic, l]) => <Link key={h} href={h} className={path === h ? 'on' : ''} aria-current={path === h ? 'page' : undefined}><Ic n={ic} /><span>{l}</span></Link>)}
    </nav>
  );
}
