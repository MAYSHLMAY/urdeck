/*
 * Reference PDFs: categories ("pools"), PDFs, the many-to-many links between them, question mappings,
 * and the drawer's UI state. One store, same pattern as the study engine.
 */
import { sb } from './library';
import { api, isOwner } from './api';
import type { QCard } from './types';
import { uuid } from './notes';
import { getIndex, matchCard, type Passage } from './pdfindex';
import { lpDel, lpGet, lpPut, lpSpace } from './localpdfs';

export interface Hi { x: number; y: number; width: number; height: number }
export interface Category { id: string; name: string; color_theme: string }
export interface PdfDoc { id: string; title: string; file_path: string; file_size: number | null; created_at: string; local?: boolean }
export interface Mapping { id: string; question_id: string; pdf_id: string; page_number: number; highlight_data: Hi | null }
export interface Target { page: number; hi: Hi | null; rects?: Hi[]; nonce: number }
/** Result of the background search for the card on screen. `mapped` = the owner saved an exact page for it. */
export interface Auto { qid: string; state: 'none' | 'mapped' | 'working' | 'ready' | 'nomatch'; matches: (Passage & { pdfId: string })[]; idx: number }
export interface Chooser { pdfs: PdfDoc[]; catId: string | null; maps: Mapping[]; title: string }
export interface ModelRow { id: string; name: string; sub: string | null; info: string | null; built?: boolean }
export type View = 'viewer' | 'pools' | 'notes';

const K_LOCAL = 'fr-local-pdfs-v1', K_PICK = 'fr-ref-pick-v1', K_CACHE = 'fr-ref-cache-v1', K_OPEN = 'fr-ref-last-v1';
const lsGet = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const MAX_PDF_MB = 50;
export const publicUploads = () => process.env.NEXT_PUBLIC_ALLOW_PUBLIC_PDF_UPLOADS === 'true';
export const canUpload = () => isOwner() || publicUploads();
/** Everyone can add PDFs that stay on their own device. */
export const canAddLocal = () => typeof indexedDB !== 'undefined';

export class RefStore {
  ver = 0;
  private subs = new Set<() => void>();
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVer = () => this.ver;
  emit() { this.ver++; this.subs.forEach(f => f()); }

  /* data */
  categories: Category[] = []; pdfs: PdfDoc[] = [];
  catPdfs: { category_id: string; pdf_id: string }[] = [];
  catSecs: { category_id: string; section: string }[] = [];
  models: ModelRow[] = []; modelCat: Record<string, string> = {};
  loaded = false; loading = false; error = '';
  private maps = new Map<string, Mapping[]>();
  /* PDFs kept only on this device (bytes in IndexedDB, description here). Never sent anywhere. */
  localPdfs: PdfDoc[] = []; localCats: { category_id: string; pdf_id: string }[] = []; localSecs: { pdf_id: string; section: string }[] = [];
  private blobUrls = new Map<string, string>(); private prepping = new Set<string>();

  /* drawer state: lives here, outside React, so the quiz and the viewer never reset each other */
  open = false; view: View = 'pools'; pdfId: string | null = null; catId: string | null = null;
  target: Target | null = null; chooser: Chooser | null = null; busy = '';
  auto: Auto | null = null;
  private nonce = 0; private resolveSeq = 0; private prepSeq = 0; private wantAuto = '';

  /* ---------- loading ---------- */
  async load(force = false) {
    if (!this.localPdfs.length) this.loadLocal();
    if (this.loading || (this.loaded && !force)) return;
    this.loading = true; this.error = ''; this.emit();
    try {
      const db = sb();
      const [c, p, cp, cs, md, mc] = await Promise.all([
        db.from('categories').select('*').order('name'),
        db.from('pdfs').select('*').order('title'),
        db.from('category_pdfs').select('*'),
        db.from('category_sections').select('*'),
        db.from('models').select('id,name,sub,info').order('name'),
        db.from('model_categories').select('*')
      ]);
      const bad = [c, p, cp, cs].find(r => r.error);
      if (bad) throw new Error(bad.error!.message + (/relation|does not exist/i.test(bad.error!.message) ? ' (run supabase/pdf-reference.sql first)' : ''));
      this.categories = (c.data || []) as Category[]; this.pdfs = (p.data || []) as PdfDoc[];
      this.catPdfs = (cp.data || []) as any[]; this.catSecs = (cs.data || []) as any[];
      // models tables are optional until models.sql has been run
      this.models = md.error ? [] : (md.data || []) as ModelRow[];
      this.modelCat = {}; if (!mc.error) (mc.data || []).forEach((r: any) => { this.modelCat[r.model_id] = r.category_id; });
      this.loaded = true;
      this.save();
    } catch (e: any) {
      const k = lsGet(K_CACHE);
      if (k && !this.loaded) { this.categories = k.c || []; this.pdfs = k.p || []; this.catPdfs = k.cp || []; this.catSecs = k.cs || []; this.models = k.m || []; this.modelCat = k.mc || {}; this.loaded = true; this.error = 'Offline: showing the last saved list.'; }
      else this.error = e.message || 'Could not load the reference library.';
    } finally { this.loading = false; this.emit(); }
  }
  private save() { lsSet(K_CACHE, { c: this.categories, p: this.pdfs, cp: this.catPdfs, cs: this.catSecs, m: this.models, mc: this.modelCat }); }

  /* ---------- device-only PDFs ---------- */
  loadLocal() {
    const k = lsGet(K_LOCAL); if (!k) return;
    this.localPdfs = k.p || []; this.localCats = k.c || []; this.localSecs = k.s || [];
  }
  private saveLocal() { lsSet(K_LOCAL, { p: this.localPdfs, c: this.localCats, s: this.localSecs }); }
  /** Make the blob URL for a device PDF (async); the viewer re-renders when it is ready. */
  async prepLocal(id: string): Promise<string | null> {
    const hit = this.blobUrls.get(id); if (hit) return hit;
    if (this.prepping.has(id)) return null;
    this.prepping.add(id);
    try {
      const b = await lpGet(id); if (!b) return null;
      const u = URL.createObjectURL(b); this.blobUrls.set(id, u); this.emit(); return u;
    } catch { return null; } finally { this.prepping.delete(id); }
  }
  async addLocalPdf(file: File, title: string, categoryIds: string[]) {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('That is not a PDF file.');
    const sp = await lpSpace();
    if (sp.free != null && file.size > sp.free - 5 * 1048576) throw new Error('Not enough free space on this device for that file.');
    const id = 'L-' + uuid();
    try { await lpPut(id, file); } catch (e: any) { throw new Error(e.message || 'Could not save the file on this device.'); }
    const d: PdfDoc = { id, title: title.trim() || file.name.replace(/\.pdf$/i, ''), file_path: 'local:' + id, file_size: file.size, created_at: new Date().toISOString(), local: true };
    this.localPdfs = [...this.localPdfs, d].sort((a, b) => a.title.localeCompare(b.title));
    this.localCats = [...this.localCats, ...categoryIds.map(c => ({ category_id: c, pdf_id: id }))];
    this.saveLocal(); this.emit(); return d;
  }
  async deleteLocalPdf(id: string) {
    try { await lpDel(id); } catch { /* the description is removed anyway */ }
    const u = this.blobUrls.get(id); if (u) { URL.revokeObjectURL(u); this.blobUrls.delete(id); }
    this.localPdfs = this.localPdfs.filter(p => p.id !== id);
    this.localCats = this.localCats.filter(l => l.pdf_id !== id); this.localSecs = this.localSecs.filter(l => l.pdf_id !== id);
    if (this.pdfId === id) { this.pdfId = null; this.target = null; this.view = 'pools'; }
    this.saveLocal(); this.emit();
  }
  setLocalLink(catId: string, pdfId: string, on: boolean) {
    const had = this.localCats.some(l => l.category_id === catId && l.pdf_id === pdfId); if (on === had) return;
    this.localCats = on ? [...this.localCats, { category_id: catId, pdf_id: pdfId }] : this.localCats.filter(l => !(l.category_id === catId && l.pdf_id === pdfId));
    this.saveLocal(); this.auto = null; this.emit(); if (this.lastQ) this.prepare(this.lastQ);
  }
  setLocalSection(pdfId: string, section: string, on: boolean) {
    const had = this.localSecs.some(l => l.pdf_id === pdfId && l.section === section); if (on === had) return;
    this.localSecs = on ? [...this.localSecs, { pdf_id: pdfId, section }] : this.localSecs.filter(l => !(l.pdf_id === pdfId && l.section === section));
    this.saveLocal(); this.auto = null; this.emit(); if (this.lastQ) this.prepare(this.lastQ);
  }
  /** Every document that should open for a card set: the owner's pool PDFs plus the ones you linked yourself. */
  docsForSection(s: string): PdfDoc[] {
    const cat = this.catForSection(s), out: PdfDoc[] = cat ? this.pdfsOf(cat) : [];
    this.localSecs.filter(l => l.section === s).forEach(l => { const p = this.pdf(l.pdf_id); if (p && !out.some(o => o.id === p.id)) out.push(p); });
    return out;
  }

  /* ---------- lookups ---------- */
  pdf = (id: string | null) => (id ? this.pdfs.find(p => p.id === id) || this.localPdfs.find(p => p.id === id) || null : null);
  category = (id: string | null) => (id ? this.categories.find(c => c.id === id) || null : null);
  pdfsOf = (catId: string) => [...this.catPdfs, ...this.localCats].filter(l => l.category_id === catId).map(l => this.pdf(l.pdf_id)).filter(Boolean) as PdfDoc[];
  catsOf = (pdfId: string) => [...this.catPdfs, ...this.localCats].filter(l => l.pdf_id === pdfId).map(l => l.category_id);
  sectionsOf = (catId: string) => this.catSecs.filter(l => l.category_id === catId).map(l => l.section);
  catForSection = (s: string) => { const l = this.catSecs.find(x => x.section === s); return l ? l.category_id : null; };
  url(p: PdfDoc | null) {
    if (p && p.local) { const u = this.blobUrls.get(p.id); if (!u) this.prepLocal(p.id); return u || null; }
    return p ? sb().storage.from('pdfs').getPublicUrl(p.file_path).data.publicUrl : null; }
  private picks(): Record<string, string> { return lsGet(K_PICK) || {}; }

  async mappingsFor(qid: string): Promise<Mapping[]> {
    const hit = this.maps.get(qid); if (hit) return hit;
    try {
      const r = await sb().from('quiz_pdf_mappings').select('*').eq('question_id', String(qid));
      if (r.error) throw r.error;
      const m = (r.data || []) as Mapping[]; this.maps.set(qid, m); return m;
    } catch { return []; }
  }

  /* ---------- drawer actions ---------- */
  async toggle(q: QCard | null) {
    this.open = !this.open; this.emit();
    if (this.open) { await this.load(); await this.resolve(q); }
  }
  close() { if (!this.open) return; this.open = false; this.emit(); }
  setView(v: View) { this.view = v; this.emit(); }

  openPdf(pdfId: string, page = 1, hi: Hi | null = null, catId: string | null = this.catId, rects?: Hi[]) {
    this.pdfId = pdfId; this.catId = catId; this.view = 'viewer'; this.chooser = null;
    this.target = { page, hi, rects, nonce: ++this.nonce };
    lsSet(K_OPEN, pdfId); this.emit();
  }
  /** The user picked one document out of several. */
  choose(pdfId: string, remember: boolean) {
    const c = this.chooser; if (!c) return;
    const m = c.maps.find(x => x.pdf_id === pdfId);
    if (remember && c.catId) lsSet(K_PICK, { ...this.picks(), [c.catId]: pdfId });
    this.openPdf(pdfId, m ? m.page_number : 1, m ? m.highlight_data : null, c.catId);
  }
  dismissChooser() { this.chooser = null; if (!this.pdfId) this.view = 'pools'; this.emit(); }
  /** Browsing the pools: pick a category. One PDF opens at once; several open the chooser. */
  selectCategory(catId: string, openIt = true) {
    this.catId = catId; this.emit();
    if (!openIt) return;
    const docs = this.pdfsOf(catId);
    if (docs.length === 1) this.openPdf(docs[0].id, 1, null, catId);
    else if (docs.length > 1) {
      const pick = this.picks()[catId];
      if (pick && docs.some(d => d.id === pick)) this.openPdf(pick, 1, null, catId);
      else { this.chooser = { pdfs: docs, catId, maps: [], title: this.category(catId)?.name || 'Choose a document' }; this.emit(); }
    }
  }
  /**
   * Runs in the background whenever the card changes (drawer open or not): if the card is connected to PDFs, build/reuse their
   * text index and find where the card's idea is explained. Cards with no connected PDF are skipped.
   */
  private lastQ: QCard | null = null;
  async prepare(q: QCard | null) {
    const seq = ++this.prepSeq; this.lastQ = q;
    if (!q) { this.auto = null; this.emit(); return; }
    const qid = String(q.id);
    if (this.auto && this.auto.qid === qid && (this.auto.state === 'ready' || this.auto.state === 'working')) return;
    this.auto = { qid, state: 'none', matches: [], idx: 0 }; this.emit();
    await this.load();
    if (seq !== this.prepSeq) return;
    const maps = (await this.mappingsFor(qid)).filter(m => this.pdf(m.pdf_id));
    if (seq !== this.prepSeq) return;
    if (maps.length) { this.auto = { qid, state: 'mapped', matches: [], idx: 0 }; this.emit(); return; }
    const docs = this.docsForSection(q.s);
    if (!docs.length) { this.auto = { qid, state: 'none', matches: [], idx: 0 }; this.emit(); return; }
    this.auto = { qid, state: 'working', matches: [], idx: 0 }; this.emit();
    const ct = { title: q.t, question: q.q, correct: q.c, wrong: q.w || [] };
    const all: (Passage & { pdfId: string })[] = [];
    for (const d of docs) {
      try {
        const ix = await getIndex(d.file_path, (d.local ? await this.prepLocal(d.id) : this.url(d)) as string);
        if (seq !== this.prepSeq) return;
        matchCard(ix, ct).forEach(m => all.push({ ...m, pdfId: d.id }));
      } catch { /* an unreadable PDF just has no matches */ }
    }
    if (seq !== this.prepSeq) return;
    all.sort((a, b) => b.score - a.score);
    this.auto = { qid, state: all.length ? 'ready' : 'nomatch', matches: all.slice(0, 6), idx: 0 };
    if (all.length && this.open && this.wantAuto === qid) { this.wantAuto = ''; this.showMatch(0); return; }
    this.emit();
  }
  /** Jump to one of the automatic matches (also used by the previous/next buttons). */
  showMatch(i: number) {
    const a = this.auto; if (!a || !a.matches.length) return;
    const k = (i + a.matches.length) % a.matches.length, m = a.matches[k]; a.idx = k;
    this.openPdf(m.pdfId, m.page, m.box, this.catForSection(this.curSection) || this.catId, m.rects);
  }
  curSection = '';

  /** The card on screen changed (or the drawer just opened): find the best document and page. */
  async resolve(q: QCard | null) {
    if (!this.open) return;
    const seq = ++this.resolveSeq; this.curSection = q ? q.s : '';
    if (!q) { this.view = this.pdfId ? 'viewer' : 'pools'; this.emit(); return; }
    const maps = (await this.mappingsFor(String(q.id))).filter(m => this.pdf(m.pdf_id));
    if (seq !== this.resolveSeq) return;
    const catId = this.catForSection(q.s) || this.catId;
    if (!maps.length) {
      const a = this.auto;
      if (a && a.qid === String(q.id) && a.state === 'ready' && a.matches.length) { this.showMatch(a.idx); return; }
      if (!a || a.qid !== String(q.id) || a.state === 'working') this.wantAuto = String(q.id); // open the best match as soon as it is ready
    }
    if (maps.length) {
      const ids = [...new Set(maps.map(m => m.pdf_id))];
      if (ids.length === 1 || (this.pdfId && ids.includes(this.pdfId))) {
        const m = maps.find(x => x.pdf_id === this.pdfId) || maps[0];
        this.openPdf(m.pdf_id, m.page_number, m.highlight_data, catId); return;
      }
      const pick = catId ? this.picks()[catId] : null, m0 = maps.find(x => x.pdf_id === pick);
      if (m0) { this.openPdf(m0.pdf_id, m0.page_number, m0.highlight_data, catId); return; }
      this.catId = catId; this.chooser = { pdfs: ids.map(i => this.pdf(i)!), catId, maps, title: 'This question appears in several documents' }; this.view = 'viewer'; this.emit(); return;
    }
    const sd = this.docsForSection(q.s);
    if (!catId && sd.length && !(this.pdfId && sd.some(p => p.id === this.pdfId))) { this.openPdf(sd[0].id, 1, null, null); return; }
    if (catId && this.pdfsOf(catId).length) {
      if (this.pdfId && this.pdfsOf(catId).some(p => p.id === this.pdfId)) { this.catId = catId; this.view = 'viewer'; this.emit(); return; }
      this.selectCategory(catId); if (!this.chooser && this.pdfId) return;
      if (this.chooser) { this.view = 'viewer'; this.emit(); }
      return;
    }
    if (catId) this.catId = catId;
    this.view = this.pdfId ? 'viewer' : 'pools'; this.emit();
  }

  /* ---------- management (owner, or anyone for uploads when public uploads are on) ---------- */
  private async run<T>(label: string, f: () => Promise<T>): Promise<T> {
    this.busy = label; this.emit();
    try { return await f(); } finally { this.busy = ''; this.emit(); }
  }
  addCategory(name: string, color: string) {
    return this.run('Creating category…', async () => {
      const r = await api<{ category: Category }>('/api/refs', { action: 'addCategory', name, color });
      this.categories = [...this.categories, r.category].sort((a, b) => a.name.localeCompare(b.name)); this.save(); return r.category;
    });
  }
  deleteCategory(id: string, password: string) {
    return this.run('Deleting…', async () => {
      await api('/api/refs', { action: 'deleteCategory', id, password });
      this.localCats = this.localCats.filter(l => l.category_id !== id); this.saveLocal();
      Object.keys(this.modelCat).forEach(k => { if (this.modelCat[k] === id) delete this.modelCat[k]; });
      this.categories = this.categories.filter(c => c.id !== id);
      this.catPdfs = this.catPdfs.filter(l => l.category_id !== id); this.catSecs = this.catSecs.filter(l => l.category_id !== id);
      if (this.catId === id) this.catId = null; this.save();
    });
  }
  async setLink(catId: string, pdfId: string, on: boolean) {
    const had = this.catPdfs.some(l => l.category_id === catId && l.pdf_id === pdfId);
    if (on === had) return;
    const before = this.catPdfs;   // optimistic, rolled back if the server refuses
    this.catPdfs = on ? [...before, { category_id: catId, pdf_id: pdfId }] : before.filter(l => !(l.category_id === catId && l.pdf_id === pdfId));
    this.emit();
    this.auto = null;
    try { await api('/api/refs', { action: on ? 'link' : 'unlink', categoryId: catId, pdfId }); this.save(); this.auto = null; if (this.lastQ) this.prepare(this.lastQ); }
    catch (e) { this.catPdfs = before; this.emit(); throw e; }
  }
  async setSectionLink(catId: string, section: string, on: boolean) {
    const before = this.catSecs;
    const had = before.some(l => l.category_id === catId && l.section === section);
    if (on === had) return;
    this.catSecs = on ? [...before, { category_id: catId, section }] : before.filter(l => !(l.category_id === catId && l.section === section));
    this.emit();
    this.auto = null;
    try { await api('/api/refs', { action: on ? 'linkSection' : 'unlinkSection', categoryId: catId, section }); this.save(); this.auto = null; if (this.lastQ) this.prepare(this.lastQ); }
    catch (e) { this.catSecs = before; this.emit(); throw e; }
  }
  uploadPdf(file: File, title: string, categoryIds: string[]) {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return Promise.reject(new Error('That is not a PDF file.'));
    if (file.size > MAX_PDF_MB * 1024 * 1024) return Promise.reject(new Error(`PDFs can be up to ${MAX_PDF_MB} MB.`));
    return this.run('Uploading…', async () => {
      const s = await api<{ path: string; token: string }>('/api/pdfs', { action: 'sign', filename: file.name });
      const up = await sb().storage.from('pdfs').uploadToSignedUrl(s.path, s.token, file, { contentType: 'application/pdf' });
      if (up.error) throw new Error('Upload failed: ' + up.error.message);
      const r = await api<{ pdf: PdfDoc; links: any[] }>('/api/pdfs', { action: 'register', path: s.path, title: title.trim() || file.name.replace(/\.pdf$/i, ''), size: file.size, categoryIds });
      this.pdfs = [...this.pdfs, r.pdf].sort((a, b) => a.title.localeCompare(b.title));
      this.catPdfs = [...this.catPdfs, ...r.links.map((l: any) => ({ category_id: l.category_id, pdf_id: l.pdf_id }))]; this.save();
      return r.pdf;
    });
  }
  deletePdf(id: string, password: string) {
    return this.run('Deleting…', async () => {
      await api('/api/pdfs', { action: 'delete', id, password });
      this.pdfs = this.pdfs.filter(p => p.id !== id); this.catPdfs = this.catPdfs.filter(l => l.pdf_id !== id);
      this.maps.clear(); if (this.pdfId === id) { this.pdfId = null; this.target = null; this.view = 'pools'; } this.save();
    });
  }
  /** "This question is explained here": remember page and (optionally) the highlighted box for the question. */
  setMapping(qid: string, pdfId: string, page: number, hi: Hi | null) {
    return this.run('Saving…', async () => {
      const r = await api<{ mapping: Mapping }>('/api/refs', { action: 'setMapping', questionId: String(qid), pdfId, page, highlight: hi });
      const list = (this.maps.get(qid) || []).filter(m => m.pdf_id !== pdfId); list.push(r.mapping); this.maps.set(qid, list);
      this.target = { page, hi, nonce: ++this.nonce };
      return r.mapping;
    });
  }
  async deleteMapping(qid: string, id: string) {
    await api('/api/refs', { action: 'deleteMapping', id });
    this.maps.set(qid, (this.maps.get(qid) || []).filter(m => m.id !== id)); this.emit();
  }
  /* ---------- 3D models (owner-only writes) ---------- */
  modelsOf = (catId: string) => this.models.filter(m => this.modelCat[m.id] === catId);
  uploadModel(name: string, sub: string, info: string, code: string, categoryId: string | null) {
    return this.run('Uploading model…', async () => {
      const r = await api<{ model: ModelRow }>('/api/models', { action: 'upload', name, sub, info, code, categoryId });
      this.models = [...this.models.filter(m => m.id !== r.model.id), r.model].sort((a, b) => a.name.localeCompare(b.name));
      if (categoryId) this.modelCat[r.model.id] = categoryId; else delete this.modelCat[r.model.id];
      this.save(); return r.model;
    });
  }
  async setModelCategory(id: string, categoryId: string | null) {
    await api('/api/models', { action: 'setCategory', id, categoryId });
    if (categoryId) this.modelCat[id] = categoryId; else delete this.modelCat[id];
    this.save(); this.emit();
  }
  deleteModel(id: string, password: string) {
    return this.run('Deleting…', async () => {
      await api('/api/models', { action: 'delete', id, password });
      this.models = this.models.filter(m => m.id !== id); delete this.modelCat[id]; this.save();
    });
  }
  mapsCached = (qid: string) => this.maps.get(qid) || [];
}

let _r: RefStore | null = null;
export const refs = () => _r || (_r = new RefStore());
export { uuid };
