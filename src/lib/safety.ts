/* Data safety net. Three jobs, none of which change how the app works:
   1. Keep a few automatic copies of the learner's data on the phone (a daily one, and one right before a new build runs for the first time).
   2. Take a copy straight away if a save would suddenly make the progress file much smaller (a sign something went wrong).
   3. Let the person put one of those copies back. Nothing here ever deletes the live data. */

export const SCHEMA = 1;
const K_SCHEMA = 'ud-schema-v1', K_BUILD = 'ud-build-seen';
const DB = 'ud-safe-v1', ST = 'snap';
export const PROG = 'fr-progress-v1';
export const SAFE_KEYS = [PROG, 'fr-mine-v1', 'fr-shaky-v1', 'fr-mistakes-v1', 'fr-my-v1', 'fr-folders-local-v1', 'fr-notes-v1', 'fr-aux-v1'];

export type Snap = { id: string; t: number; label: 'daily' | 'update' | 'shrink' | 'restore' | 'migrate'; build: string; schema: number; data: Record<string, string> };
export type SnapInfo = { id: string; t: number; label: Snap['label']; cards: number; bytes: number };

/* ---------- pure helpers (these are the parts under test) ---------- */
export const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA');

/** How many cards the progress file knows about; -1 when it is not readable. */
export function countCards(raw: string | null | undefined): number {
  if (!raw) return 0;
  try { const o = JSON.parse(raw); return o && o.S && typeof o.S === 'object' ? Object.keys(o.S.cards || {}).length : -1; } catch { return -1; }
}
/** True when the progress file looks usable: readable, and has the shape the engine expects. */
export const validProgress = (raw: string | null | undefined) => countCards(raw) >= 0;
/** A write that would throw away most of what is stored is suspicious: keep a copy of the old value first. */
export function shrunk(oldRaw: string | null | undefined, newRaw: string): boolean {
  if (!oldRaw || oldRaw.length < 4000) return false;
  return newRaw.length < oldRaw.length * 0.4;
}
/** Which snapshots to keep: the newest few daily ones, the last two update ones, and the last few special ones. */
export function prune<T extends { id: string; t: number; label: string }>(list: T[], dailyKeep = 4): T[] {
  const by = (l: string[]) => list.filter(x => l.includes(x.label)).sort((a, b) => b.t - a.t);
  const keep = [...by(['daily']).slice(0, dailyKeep), ...by(['update']).slice(0, 2), ...by(['shrink', 'restore', 'migrate']).slice(0, 3)];
  const ids = new Set(keep.map(x => x.id));
  return list.filter(x => ids.has(x.id));
}

/** Ordered upgrades for the stored shape. Entry i upgrades version i+1 to i+2. Empty today; the runner and the safety copy before it are what matter. */
export const MIGRATIONS: Array<(d: Record<string, string>) => void> = [];
export function migrate(data: Record<string, string>, from: number, to = SCHEMA, steps = MIGRATIONS) {
  let v = from;
  while (v < to) { const f = steps[v - 1]; if (f) f(data); v++; }
  return v;
}

/* ---------- storage (IndexedDB) ---------- */
const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore(ST, { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function all(): Promise<Snap[]> {
  try {
    const db = await open();
    return await new Promise(res => {
      const out: Snap[] = [], t = db.transaction(ST, 'readonly'), c = t.objectStore(ST).openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value as Snap); cur.continue(); } };
      t.oncomplete = () => { db.close(); res(out); }; t.onerror = t.onabort = () => { db.close(); res(out); };
    });
  } catch { return []; }
}
async function put(s: Snap) {
  try {
    const db = await open();
    await new Promise<void>(res => { const t = db.transaction(ST, 'readwrite'); t.objectStore(ST).put(s); t.oncomplete = () => { db.close(); res(); }; t.onerror = t.onabort = () => { db.close(); res(); }; });
  } catch { /* storage full or unavailable: the live data is untouched */ }
}
async function del(ids: string[]) {
  if (!ids.length) return;
  try {
    const db = await open();
    await new Promise<void>(res => { const t = db.transaction(ST, 'readwrite'), s = t.objectStore(ST); ids.forEach(i => s.delete(i)); t.oncomplete = () => { db.close(); res(); }; t.onerror = t.onabort = () => { db.close(); res(); }; });
  } catch { /* ignore */ }
}

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const grab = (): Record<string, string> => { const d: Record<string, string> = {}; for (const k of SAFE_KEYS) { const v = read(k); if (v) d[k] = v; } return d; };
let chain: Promise<unknown> = Promise.resolve();
const queue = (f: () => Promise<unknown>) => { chain = chain.then(f, f); return chain; };

async function save(label: Snap['label'], data: Record<string, string>, build: string) {
  if (!Object.keys(data).length) return;
  const t = Date.now();
  await put({ id: label + '-' + t, t, label, build, schema: SCHEMA, data });
  const list = await all();
  await del(prune(list).length === list.length ? [] : list.filter(x => !prune(list).some(k => k.id === x.id)).map(x => x.id));
}

export const safe = {
  /** Call once, before anything else reads or writes saved data. The copy is taken from what is on the phone right now. */
  boot(build: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = grab(), seenBuild = read(K_BUILD), v = +(read(K_SCHEMA) || 0) || SCHEMA;
      const jobs: Snap['label'][] = [];
      if (seenBuild && seenBuild !== build) jobs.push('update');
      if (v < SCHEMA) jobs.push('migrate');
      queue(async () => {
        if (!jobs.length) { const l = await all(); if (!l.some(x => x.label === 'daily' && dayKey(x.t) === dayKey(Date.now()))) jobs.push('daily'); }
        for (const j of jobs) await save(j, data, build);
      });
      if (v < SCHEMA) { const d = { ...data }; migrate(d, v); for (const [k, val] of Object.entries(d)) if (data[k] !== val) { try { localStorage.setItem(k, val); } catch { /* ignore */ } } }
      localStorage.setItem(K_SCHEMA, String(SCHEMA)); localStorage.setItem(K_BUILD, build);
    } catch { /* never block the app */ }
  },
  /** Ask before a save: if it would shrink the progress file a lot, keep the old copy first. */
  guard(key: string, oldRaw: string | null | undefined, newRaw: string) {
    if (key !== PROG || !shrunk(oldRaw, newRaw)) return;
    const d = { [PROG]: oldRaw as string };
    queue(() => save('shrink', d, ''));
  },
  async list(): Promise<SnapInfo[]> {
    return (await all()).sort((a, b) => b.t - a.t).map(s => ({ id: s.id, t: s.t, label: s.label, cards: Math.max(0, countCards(s.data[PROG])), bytes: Object.values(s.data).reduce((n, v) => n + v.length, 0) }));
  },
  /** Put a saved copy back. The current data is kept as a copy first, so this can be undone. The caller reloads the page afterwards. */
  async restore(id: string): Promise<boolean> {
    const s = (await all()).find(x => x.id === id); if (!s || !validProgress(s.data[PROG] ?? '{"S":{}}')) return false;
    await save('restore', grab(), s.build);
    try { for (const [k, v] of Object.entries(s.data)) localStorage.setItem(k, v); return true; } catch { return false; }
  },
  /** At start: is the saved progress readable? If not, the damaged text is kept aside so nothing is lost. */
  check(): 'ok' | 'damaged' {
    const raw = read(PROG);
    if (raw && !validProgress(raw)) { try { localStorage.setItem('ud-quarantine-' + Date.now(), raw); } catch { /* ignore */ } return 'damaged'; }
    return 'ok';
  },
};
