/* Safety net for a full localStorage (about 5 MB per site). When a save does not fit, the value is kept in IndexedDB instead, which has
   far more room, and is read back on the next start. Nothing here is a cache: it only ever holds the newest copy of data the person made. */
const DB = 'ud-spill-v1', ST = 'kv';
const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore(ST); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((res, rej) => { const t = db.transaction(ST, mode), q = f(t.objectStore(ST)); t.oncomplete = () => { db.close(); res(q.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); }; });
};
export const spillPut = (k: string, v: string) => tx('readwrite', s => s.put(v, k)).then(() => true, () => false);
export const spillDel = (k: string) => tx('readwrite', s => s.delete(k)).catch(() => { /* ignore */ });
export async function spillAll(): Promise<Record<string, string>> {
  try {
    const db = await open();
    return await new Promise(res => {
      const out: Record<string, string> = {}, t = db.transaction(ST, 'readonly'), c = t.objectStore(ST).openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[String(cur.key)] = String(cur.value); cur.continue(); } };
      t.oncomplete = () => { db.close(); res(out); }; t.onerror = t.onabort = () => { db.close(); res(out); };
    });
  } catch { return {}; }
}
/** Caches that can always be rebuilt: dropped first when the device is out of space. */
export function freeSpace() { for (const k of ['fr-dict-cache-v1', 'ud-profile-v1']) { try { localStorage.removeItem(k); } catch { /* ignore */ } } }
