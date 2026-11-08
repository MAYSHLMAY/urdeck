/*
 * Local-first PDF notes.
 *  - Every change is applied in memory and written to IndexedDB (localStorage if IndexedDB is unavailable), so the UI never waits.
 *  - If cloud backup is on, unsynced notes are sent to /api/notes in the background (batched, retried with back-off, and
 *    re-tried when the browser comes back online or the tab is hidden). A failed sync never loses a note.
 */
import { api } from './api';

export interface Rect { x: number; y: number; width: number; height: number }
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];
export const NOTE_TAGS = ['Important', 'Memorise', 'Mistake', 'Question'] as const;
export interface LocalNote {
  id: string; pdf_id: string; selected_text: string; note_content: string; page_number: number | null; rects: Rect[];
  created_at: string; updated_at: string; synced: 0 | 1; deleted?: 1;
  /* v2 extras (optional, so notes saved by the older version still load) */
  color?: NoteColor; tags?: string[]; pin?: 1; qid?: string;
  /** how the passage is marked: highlight (default), underline or strike-through */
  style?: 'ul' | 'st';
}

const DB = 'fr-notes-v2', ST = 'notes', LS = 'fr-notes-fallback-v2', K_DEV = 'fr-device-id', K_SYNC = 'fr-notes-sync';

export const uuid = (): string => {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
};

class NotesStore {
  ver = 0;
  private subs = new Set<() => void>();
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVer = () => this.ver;
  private emit() { this.ver++; this.subs.forEach(f => f()); }

  private all = new Map<string, LocalNote>();
  private db: IDBDatabase | null = null;
  private started = false; private loadedP: Promise<void> | null = null;
  private timer: any = 0; private fails = 0; private busy = false;
  status: 'idle' | 'syncing' | 'offline' | 'error' = 'idle'; lastError = '';

  /* ----- setup ----- */
  async start() {
    if (typeof window === 'undefined') return;
    if (this.started) { await this.loadedP; return; }
    this.started = true; let done!: () => void; this.loadedP = new Promise<void>(r => (done = r));
    await this.load(); done();
    this.emit();
    addEventListener('online', () => this.schedule(300));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.syncNow(); });
    setInterval(() => this.schedule(0), 60000);
    this.schedule(1500);
  }
  private open(): Promise<IDBDatabase | null> {
    return new Promise(res => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch { res(null); }
    });
  }
  private async load() {
    this.db = await this.open();
    if (this.db) {
      const rows: LocalNote[] = await new Promise(res => {
        try { const q = this.db!.transaction(ST).objectStore(ST).getAll(); q.onsuccess = () => res(q.result as LocalNote[]); q.onerror = () => res([]); } catch { res([]); }
      });
      rows.forEach(n => this.all.set(n.id, n));
    } else {
      try { (JSON.parse(localStorage.getItem(LS) || '[]') as LocalNote[]).forEach(n => this.all.set(n.id, n)); } catch { /* ignore */ }
    }
  }
  private persist(n: LocalNote) {
    if (this.db) {
      try {
        const t = this.db.transaction(ST, 'readwrite');
        if (n.deleted && n.synced) t.objectStore(ST).delete(n.id); else t.objectStore(ST).put(n);
      } catch { /* the in-memory copy is still right */ }
    } else {
      try { localStorage.setItem(LS, JSON.stringify([...this.all.values()])); } catch { /* ignore */ }
    }
  }

  /* ----- settings ----- */
  get deviceId() {
    try { let d = localStorage.getItem(K_DEV); if (!d) { d = uuid(); localStorage.setItem(K_DEV, d); } return d; } catch { return '00000000-0000-4000-8000-000000000000'; }
  }
  get syncOn() { try { return localStorage.getItem(K_SYNC) !== '0'; } catch { return true; } }
  setSync(on: boolean) { try { localStorage.setItem(K_SYNC, on ? '1' : '0'); } catch { /* ignore */ } this.emit(); if (on) this.schedule(200); }

  /* ----- reads ----- */
  list(pdfId?: string | null): LocalNote[] {
    return [...this.all.values()].filter(n => !n.deleted && (!pdfId || n.pdf_id === pdfId))
      .sort((a, b) => (a.page_number || 0) - (b.page_number || 0) || a.created_at.localeCompare(b.created_at));
  }
  get pending() { return [...this.all.values()].filter(n => !n.synced && !n.pdf_id.startsWith('L-')).length; }

  /* ----- writes (instant) ----- */
  add(p: { pdf_id: string; selected_text: string; page_number: number | null; rects: Rect[]; note_content?: string; color?: NoteColor; tags?: string[]; pin?: boolean; qid?: string; style?: 'ul' | 'st' }): LocalNote {
    const text = p.selected_text.replace(/\s+/g, ' ').trim().slice(0, 4000);
    if (!text) throw new Error('Nothing is selected.');
    const now = new Date().toISOString();
    const n: LocalNote = { id: uuid(), pdf_id: p.pdf_id, selected_text: text, note_content: (p.note_content || '').slice(0, 4000), page_number: p.page_number, rects: p.rects.slice(0, 80), created_at: now, updated_at: now, synced: 0 };
    if (p.color) n.color = p.color; if (p.tags && p.tags.length) n.tags = p.tags.slice(0, 8); if (p.pin) n.pin = 1; if (p.qid) n.qid = String(p.qid).slice(0, 80); if (p.style) n.style = p.style;
    this.all.set(n.id, n); this.persist(n); this.emit(); this.schedule(1500);
    return n;
  }

  /* ----- device sync hooks (see lib/sync.ts) ----- */
  syncCollect(m: Map<string, { v: any; ts?: number }>) {
    this.all.forEach(n => { if (n.deleted || n.pdf_id.startsWith('L-')) return; const { synced, deleted, ...rest } = n; void synced; void deleted; m.set('no:' + n.id, { v: rest, ts: Date.parse(n.updated_at) || 0 }); });
  }
  syncApply(ch: [string, any][]) {
    for (const [k, v] of ch) {
      const id = k.slice(3), old = this.all.get(id);
      if (v == null) { if (old) { old.deleted = 1; old.synced = 1; this.all.delete(id); this.persist(old); } }
      else { const n: LocalNote = { ...v, synced: 0 }; this.all.set(id, n); this.persist(n); }
    }
    this.emit(); this.schedule(2000);
  }
  get(id: string) { const n = this.all.get(id); return n && !n.deleted ? n : null; }
  update(id: string, patch: { note_content?: string; color?: NoteColor; tags?: string[]; pin?: boolean }) {
    const n = this.all.get(id); if (!n || n.deleted) return;
    n.note_content = (patch.note_content ?? n.note_content).slice(0, 4000);
    if (patch.color) n.color = patch.color;
    if (patch.tags) n.tags = patch.tags.slice(0, 8);
    if (patch.pin !== undefined) { if (patch.pin) n.pin = 1; else delete n.pin; }
    n.updated_at = new Date().toISOString(); n.synced = 0;
    this.persist(n); this.emit(); this.schedule(1500);
  }
  remove(id: string) {
    const n = this.all.get(id); if (!n) return;
    if (!this.syncOn || n.pdf_id.startsWith('L-')) { this.all.delete(id); n.deleted = 1; n.synced = 1; this.persist(n); }  // cloud backup is off: just forget it
    else { n.deleted = 1; n.synced = 0; this.persist(n); }                                    // tombstone until the server confirms
    this.emit(); this.schedule(1500);
  }

  /* ----- background sync ----- */
  schedule(ms: number) {
    if (!this.syncOn || typeof window === 'undefined') return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.syncNow(), ms);
  }
  async syncNow(): Promise<boolean> {
    if (this.busy || !this.syncOn) return false;
    // notes on device-only PDFs (ids start with L-) never leave the device
    const todo = [...this.all.values()].filter(n => !n.synced && !n.pdf_id.startsWith('L-'));
    if (!todo.length) { if (this.status !== 'idle') { this.status = 'idle'; this.emit(); } return true; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.status = 'offline'; this.emit(); return false; }
    this.busy = true; this.status = 'syncing'; this.emit();
    try {
      const batch = todo.slice(0, 100);
      const ups = batch.filter(n => !n.deleted), dels = batch.filter(n => n.deleted).map(n => n.id);
      const r = await api<{ saved: string[]; deleted: string[] }>('/api/notes', { deviceId: this.deviceId, upserts: ups.map(({ synced, deleted, ...rest }) => rest), deletes: dels });
      // the server answered: mark the batch done (notes it skipped as invalid or foreign would only fail again)
      batch.forEach(n => {
        if (n.updated_at !== (this.all.get(n.id)?.updated_at)) return; // edited while syncing: stays pending
        n.synced = 1;
        if (n.deleted) this.all.delete(n.id);
        this.persist(n);
      });
      this.fails = 0; this.status = 'idle'; this.lastError = '';
      this.busy = false; this.emit();
      if ([...this.all.values()].some(n => !n.synced && !n.pdf_id.startsWith('L-'))) this.schedule(500);
      return true;
    } catch (e: any) {
      this.fails++; this.status = 'error'; this.lastError = e.message || 'Could not reach the server.';
      this.busy = false; this.emit();
      this.schedule(Math.min(300000, 5000 * 2 ** Math.min(this.fails, 6)));
      return false;
    }
  }
}

let _n: NotesStore | null = null;
export const notes = () => _n || (_n = new NotesStore());
