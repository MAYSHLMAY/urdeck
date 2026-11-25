/* "My articles": pages a person adds for themselves. They live only in this browser or app (IndexedDB), are never uploaded, and are only ever shown in the sandboxed frame. */
import type { LocalArticle, LocalMeta } from './types';
const DB = 'ud-articles-v1', ST = 'a';
export const MAX_BYTES = 6 * 1024 * 1024;
const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('Storage is not available here.'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore(ST, { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((res, rej) => { const t = db.transaction(ST, mode), q = f(t.objectStore(ST)); t.oncomplete = () => { db.close(); res(q.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); }; });
};
export const myAll = (): Promise<LocalArticle[]> => run<LocalArticle[]>('readonly', s => s.getAll());
export const myList = async (): Promise<LocalMeta[]> => (await myAll()).map(a => ({ id: a.id, title: a.title, added: a.added, bytes: a.bytes, version: a.version || 1, updated: a.updated, hasPrev: !!a.prev?.length })).sort((x, y) => (y.updated || y.added) - (x.updated || x.added));
export const myGet = (id: string) => run<LocalArticle | undefined>('readonly', s => s.get(id));
export const myPut = (a: LocalArticle) => run('readwrite', s => s.put(a));
export const myDelete = (id: string) => run('readwrite', s => s.delete(id));
export const KEEP_VERSIONS = 3;
/** Replace an article in place. The old text is kept as a previous version (the last few are kept), so a replace can always be undone. */
export async function myReplace(id: string, html: string, title: string): Promise<boolean> {
  const old = await myGet(id); if (!old) return false;
  const prev = [{ version: old.version || 1, saved: Date.now(), bytes: old.bytes, html: old.html }, ...(old.prev || [])].slice(0, KEEP_VERSIONS);
  await myPut({ ...old, title, html, bytes: html.length, version: (old.version || 1) + 1, updated: Date.now(), prev }); return true;
}
/** Bring back the previous version. The version being replaced becomes the newest "previous" one, so this can be undone too. */
export async function myUndo(id: string): Promise<boolean> {
  const cur = await myGet(id); if (!cur?.prev?.length) return false;
  const [back, ...rest] = cur.prev;
  await myPut({ ...cur, html: back.html, bytes: back.bytes, version: back.version, updated: Date.now(), prev: [{ version: cur.version || 1, saved: Date.now(), bytes: cur.bytes, html: cur.html }, ...rest].slice(0, KEEP_VERSIONS) }); return true;
}
