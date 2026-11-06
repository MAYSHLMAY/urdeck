'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sheet, SheetFrame } from './ui';
import { BUILTIN } from '@/lib/models';
import { useRefs } from './refHooks';

/** 3D models grouped by the category (pool) they belong to. Upload and category changes happen in the 3D lab, owner only. */
export function ModelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter(), R = useRefs();
  if (!open) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const all = [...BUILTIN, ...R.models.filter(m => !BUILTIN.some(b => b.id === m.id))];
  const name = (id: string) => (R.modelCat[id] && R.category(R.modelCat[id])?.name) || 'Uncategorized';
  const cats = [...new Set(all.map(m => name(m.id)))].sort((a, b) => (a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)));

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetFrame title="3D Models" onClose={onClose}>
        <div className="sc">
          <p className="info">Models are grouped by category. Tap one to open it in the 3D lab. The owner can upload new models there and choose their category.</p>
          <div className="row"><Link className="ghost" href="/lab" style={{ textDecoration: 'none' }}>Open 3D lab</Link></div>
          <div style={{ marginTop: 10 }}>
            {cats.map(c => {
              const xs = all.filter(m => name(m.id) === c);
              return (
                <details className="grp" open key={c}>
                  <summary><span><span className="gn">{c}</span> <span className="gm">{xs.length} model{xs.length > 1 ? 's' : ''}</span></span></summary>
                  <div className="subs">
                    {xs.map(x => (
                      <div className="frow" key={x.id} role="button" tabIndex={0} onClick={() => router.push('/lab#' + encodeURIComponent(x.id))}
                        onKeyDown={ev => { if (ev.key === 'Enter') router.push('/lab#' + encodeURIComponent(x.id)); }}>
                        <span className="ic">🧊</span>
                        <span className="tx"><b>{x.name}<span className="mtag">MODEL</span></b><small>{(x.sub ? x.sub + ' · ' : '') + String(x.info || '').slice(0, 80)}</small></span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </SheetFrame>
    </Sheet>
  );
}
