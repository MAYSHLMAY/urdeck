'use client';
import { useMemo } from 'react';
import { externalRefs, summary, BREAKS, LABEL } from '@/lib/articles/offline';

/** Tells the author whether a page will work with no connection, and lists what will not. */
export function OfflineCheck({ html }: { html: string }) {
  const list = useMemo(() => externalRefs(html), [html]), s = summary(list);
  if (s.ok) return <p className="oc ok" role="status">Works offline. Nothing is loaded from the internet.</p>;
  return (
    <details className={'oc ' + (s.breaks ? 'bad' : 'warn')}>
      <summary>{s.breaks ? `Needs internet: ${s.breaks} part${s.breaks === 1 ? '' : 's'} will not work offline` : `Mostly works offline: ${s.missing} item${s.missing === 1 ? '' : 's'} will be missing`}</summary>
      <ul>{list.map(e => <li key={e.kind + e.url}><b>{LABEL[e.kind]}{BREAKS.has(e.kind) ? '' : ' (looks different offline)'}</b><span>{e.host}</span></li>)}</ul>
      <p>To fix it, put the file inside the page itself, or save it in the app and point to it.</p>
    </details>
  );
}
