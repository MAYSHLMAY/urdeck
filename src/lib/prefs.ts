/*
 * Small per-account settings that follow you to every device through sync (see sync.ts), plus the 3D lab's progress.
 * Local first: everything is read and written on the device; the sync layer only compares and ships changes.
 * Never in here: AI keys, the owner password, reminders, vibration/sound and screen size (those belong to one device).
 */
import { engine } from './engine';
import { DEF } from './srs';
import { applyLook } from './look';
import { readerStore } from './reader';

const jget = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const jset = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const sget = (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const sset = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Study options that are about the person, not the device. */
const DEVICE_OPTS = ['remind', 'vib', 'sound', 'size'];
const K_LAB = 'ud-lab-v1';

export interface LabRec { fav?: boolean; made?: boolean; n?: number; t?: number; best?: number; runs?: number; vals?: Record<string, number> }
const subs = new Set<() => void>();
let labCache: Record<string, LabRec> | null = null;
const labAll = (): Record<string, LabRec> => labCache || (labCache = (typeof window !== 'undefined' && jget(K_LAB)?.m) || {});
const emit = () => { subs.forEach(f => f()); try { dispatchEvent(new Event('ud-lab')); } catch { /* ignore */ } };
const labSave = () => { jset(K_LAB, { v: 1, m: labAll() }); };

/** The 3D lab's personal data: favourites, what you opened, part-quiz scores and the settings you left each model on. */
export const labs = {
  rec: (id: string): LabRec => labAll()[id] || {},
  patch(id: string, p: Partial<LabRec>) { const m = labAll(); m[id] = { ...m[id], ...p, t: Date.now() }; labSave(); emit(); },
  visit(id: string) { const r = labs.rec(id); labs.patch(id, { n: (r.n || 0) + 1 }); },
  fav: (id: string) => !!labAll()[id]?.fav,
  toggleFav(id: string) { labs.patch(id, { fav: !labs.fav(id) }); },
  /** Most recently used model ids, newest first. */
  recent(n = 4): string[] { const m = labAll(); return Object.keys(m).filter(k => m[k].n).sort((a, b) => (m[b].t || 0) - (m[a].t || 0)).slice(0, n); },
  favs(): string[] { const m = labAll(); return Object.keys(m).filter(k => m[k].fav); },
  /** Models you opened at least once, for the home tile and the lab's progress line. */
  seen(): number { const m = labAll(); return Object.keys(m).filter(k => m[k].n).length; },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; }
};

if (typeof window !== 'undefined') addEventListener('storage', e => { if (e.key === K_LAB) { labCache = null; emit(); } });

export const prefs = {
  subscribe: labs.subscribe,
  syncCollect(m: Map<string, { v: any; ts?: number }>) {
    try {
      const o: any = { ...engine().S.opt }; DEVICE_OPTS.forEach(k => delete o[k]); m.set('kv:opts', { v: o });
      const look = sget('fr-look-v1'); if (look) m.set('kv:look', { v: look });
      const home = sget('ud-home-v1'); if (home) m.set('kv:home', { v: home });
      const bd = jget('fr-badges-v1'); if (Array.isArray(bd) && bd.length) m.set('kv:badges', { v: [...bd].sort() });
      m.set('kv:ref', { v: { night: sget('fr-pdf-night', '0'), color: sget('fr-note-color', 'yellow'), marker: sget('fr-marker', '0') } });
      readerStore().syncCollect(m);
      const L = labAll(); for (const id in L) m.set('kv:lab:' + id, { v: L[id], ts: L[id].t });
    } catch { /* a bad local value must never stop sync */ }
  },
  syncApply(ch: [string, any][]) {
    const e = engine(); let opts = false, look = false, home = false, lab = false;
    for (const [k, v] of ch) {
      const n = k.slice(3);
      if (n === 'opts' && v && typeof v === 'object') {
        const keep: any = {}; DEVICE_OPTS.forEach(d => { keep[d] = e.S.opt[d]; });
        e.S.opt = Object.assign({}, DEF, v, keep); opts = true;
      } else if (n === 'look' && typeof v === 'string') { sset('fr-look-v1', v); look = true; }
      else if (n === 'home' && typeof v === 'string') { sset('ud-home-v1', v); home = true; }
      else if (n === 'badges' && Array.isArray(v)) { const have = new Set<string>(jget('fr-badges-v1') || []); v.forEach((x: string) => have.add(x)); jset('fr-badges-v1', [...have]); }
      else if (n === 'ref' && v && typeof v === 'object') { sset('fr-pdf-night', String(v.night ?? '0')); sset('fr-note-color', String(v.color ?? 'yellow')); sset('fr-marker', String(v.marker ?? '0')); }
      else if (n.startsWith('rd:')) { readerStore().syncApply(n.slice(3), v); }
      else if (n.startsWith('lab:')) { const id = n.slice(4), m = labAll(); if (v == null) delete m[id]; else m[id] = v; lab = true; }
    }
    if (opts) { e.save(); e.emit(); }
    if (look) applyLook();
    if (home) { try { dispatchEvent(new Event('ud-home')); } catch { /* ignore */ } }
    if (lab) { labSave(); emit(); }
  }
};
