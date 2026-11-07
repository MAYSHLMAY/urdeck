/*
 * PDFs that live only on this device. The file bytes go into IndexedDB (which, unlike localStorage, holds large binary files),
 * and nothing here ever touches the network. Only a small description (title, size, links) is kept in localStorage.
 */
const DB = 'fr-localpdfs-v1', ST = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('This browser cannot store files on the device.'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('Could not open the device storage.'));
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, mode), rq = f(t.objectStore(ST));
    t.oncomplete = () => { db.close(); res(rq ? (rq as IDBRequest<T>).result : undefined); };
    t.onerror = () => { db.close(); rej(t.error || new Error('Storage error.')); };
    t.onabort = () => { db.close(); rej(t.error || new Error('Not enough space on this device.')); };
  });
}
export const lpPut = (id: string, blob: Blob) => tx('readwrite', s => s.put(blob, id)).then(() => undefined);
export const lpGet = (id: string) => tx<Blob>('readonly', s => s.get(id)) as Promise<Blob | undefined>;
export const lpDel = (id: string) => tx('readwrite', s => s.delete(id)).then(() => undefined);

/** Ask the browser not to clear this storage under memory pressure, and report free space. */
export async function lpSpace(): Promise<{ free: number | null; persisted: boolean }> {
  let persisted = false, free: number | null = null;
  try { const n: any = navigator; if (n.storage?.persist) persisted = (await n.storage.persisted?.()) || (await n.storage.persist()); } catch { /* ignore */ }
  try { const e = await (navigator as any).storage?.estimate?.(); if (e && e.quota) free = e.quota - (e.usage || 0); } catch { /* ignore */ }
  return { free, persisted };
}
