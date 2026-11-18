'use client';
import { useStage, StageBar } from './useStage';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { BUILTIN, modelCode, validateModel, forgetModel, type ModelDef } from '@/lib/models';
import { isSim, is3d, simTitle } from '@/lib/sim';
import SimFrame from './SimFrame';
import { refs } from '@/lib/refs';
import { isOwner } from '@/lib/api';
import { useRefs } from './refHooks';
import { askPassword, AskHost, Ic, Sheet, SheetFrame, useEngine } from './ui';
import { labs } from '@/lib/prefs';
import { withKind } from '@/lib/kind';

const esc = (t: any) => String(t);
const TABS = [['a', 'Adjust'], ['p', 'Parts'], ['q', 'Quiz'], ['i', 'Info']] as const;
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** The 3D lab: orbit camera, adjustable controls, exploded view, part picking. */
export default function Lab() {
  const cv = useRef<HTMLDivElement>(null), st = useStage(cv);
  const R = useRef<any>({ V: {}, dirty: true, sweep: false, t0: 0, wire: false, sel: null, def: null, G: null, base: new Map() });
  const Rf = useRefs();
  const [own, setOwn] = useState(false);
  const [pend, setPend] = useState<{ name: string; sub: string; info: string; code: string; cat: string } | null>(null);
  const [selId, setSelId] = useState('');
  const [sim, setSim] = useState<{ code: string; name: string; kind: '2D' | '3D' } | null>(null);
  const [paste, setPaste] = useState(false);
  const [def, setDef] = useState<ModelDef | null>(null);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [readout, setReadout] = useState<[string, string][]>([]);
  const e = useEngine(), [, lbump] = useState(0), [browse, setBrowse] = useState(false), [q, setQ] = useState('');
  const [tab, setTab] = useState<'a' | 'p' | 'q' | 'i'>('a');
  const [quiz, setQuiz] = useState<{ ids: string[]; i: number; score: number; fb: '' | 'ok' | 'bad'; done: boolean } | null>(null);
  useEffect(() => { e.init(); return labs.subscribe(() => lbump(x => x + 1)); }, []); // eslint-disable-line
  const [wire, setWire] = useState(false), [sweep, setSweep] = useState(false), [ex, setEx] = useState(0), [selPart, setSelPart] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean }>({ t: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const say = (t: string, err = false) => setMsg({ t, err });

  const catName = (id: string | undefined) => (id && Rf.category(id)?.name) || 'Uncategorized';
  const all = [...BUILTIN, ...Rf.models.filter(m => !BUILTIN.some(b => b.id === m.id))];
  const groups = [...new Set(all.map(m => catName(Rf.modelCat[m.id])))].sort((a, b) => (a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)));

  const partOf = (o: any) => { while (o && !(o.userData && o.userData.part)) o = o.parent; return o ? o.userData.part : null; };
  const eachMat = (f: (m: any, p: any) => void) => { const G = R.current.G; if (!G) return; G.traverse((o: any) => { if (o.isMesh) f(o.material, partOf(o)); }); };

  function applyValues(v: Record<string, number>) {
    const r = R.current; r.V = v; r.dirty = true;
    if (r.def && r.G && r.def.update) r.def.update(r.G, v, THREE);
    setReadout(r.def && r.def.readout ? r.def.readout(v) : []);
  }
  function explode(a: number) {
    const r = R.current; r.dirty = true; setEx(a);
    r.base.forEach((b: number[], o: any) => o.position.set(b[0] + o.userData.ex[0] * a, b[1] + o.userData.ex[1] * a, b[2] + o.userData.ex[2] * a));
  }
  function select(id: string) {
    const r = R.current; r.dirty = true; r.sel = r.sel === id ? null : id; setSelPart(r.sel);
    eachMat((m, p) => m.emissive && m.emissive.setHex(p && p === r.sel ? 0x7a3a10 : 0));
    if (r.sel) setTab('p');
  }
  const resetAll = () => {
    const r = R.current, v: Record<string, number> = {};
    (r.def?.adjusters || []).forEach((a: any) => { v[a.id] = a.value; });
    setVals(v); explode(0); applyValues(v); if (selId) labs.patch(selId, { vals: {} });
  };

  async function openModel(id: string, code?: string) {
    say('');
    const r = R.current; let def: ModelDef;
    let src = code;
    try { src = code || await modelCode(id); } catch (e: any) { say('Could not load: ' + e.message, true); return; }
    if (isSim(src)) {
      const nm = all.find(m => m.id === id)?.name || simTitle(src); setSim({ code: src, name: nm, kind: is3d(src) ? '3D' : '2D' }); document.title = nm + ' · Lab'; labs.visit(id); return;
    }
    setSim(null);
    try { def = await validateModel(src); } catch (e: any) { say('Could not load: ' + e.message, true); return; }
    if (r.G) { r.scene.remove(r.G); r.G.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
    r.def = def; r.G = def.build(THREE); r.scene.add(r.G); r.base = new Map(); r.sel = null; r.sweep = false; setSweep(false); setSelPart(null);
    r.G.traverse((o: any) => { if (o.userData.ex) r.base.set(o, [o.position.x, o.position.y, o.position.z]); });
    const bb = new THREE.Box3().setFromObject(r.G), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    r.tg.copy(c); r.rad = Math.max(s.x, s.y, s.z) * 1.8 + .5; r.grid.position.y = bb.min.y - .1; r.place();
    eachMat(m => { m.wireframe = r.wire; });
    const sv = labs.rec(id).vals || {}, v: Record<string, number> = {}; (def.adjusters || []).forEach(a => { v[a.id] = typeof sv[a.id] === 'number' ? Math.min(a.max, Math.max(a.min, sv[a.id])) : a.value; });
    labs.visit(id); setQuiz(null); r.quiz = null;
    setDef(def); setVals(v); setEx(0); applyValues(v); r.dirty = true;
    document.title = def.name + ' · 3D Lab';
  }

  /* one-time scene setup */
  useEffect(() => {
    const r = R.current, host = cv.current!;
    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    ren.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(ren.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, .05, 100);
    scene.add(new THREE.AmbientLight(0xffffff, .65));
    const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(2, 4, 3); scene.add(dl);
    const grid: any = new THREE.GridHelper(6, 24, 0x999999, 0xbbbbbb); grid.position.y = -.4; grid.material.opacity = .35; grid.material.transparent = true; scene.add(grid);
    r.scene = scene; r.grid = grid; r.tg = new THREE.Vector3(0, 0, .5); r.rad = 3.6;
    let th = .7, ph = 1.15;
    r.place = () => { r.dirty = true; cam.position.set(r.tg.x + r.rad * Math.sin(ph) * Math.sin(th), r.tg.y + r.rad * Math.cos(ph), r.tg.z + r.rad * Math.sin(ph) * Math.cos(th)); cam.lookAt(r.tg); };
    const fit = () => { r.dirty = true; const w = host.clientWidth, h = host.clientHeight; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(fit); ro.observe(host);

    const Pt = new Map<number, number[]>(); let moved = 0, pd = 0;
    const dist = () => { const a = [...Pt.values()]; return Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1; };
    const el = ren.domElement;
    const tap = (e: PointerEvent) => {
      if (!r.G) return; const b = el.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), cam);
      const h = ray.intersectObject(r.G, true).map((x: any) => partOf(x.object)).find(Boolean);
      if (h) { if (r.quiz) r.quiz(h); else select(h); }
    };
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); Pt.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (Pt.size === 2) pd = dist(); };
    const move = (e: PointerEvent) => {
      const o = Pt.get(e.pointerId); if (!o) return;
      const dx = e.clientX - o[0], dy = e.clientY - o[1]; Pt.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
      if (Pt.size === 1) { th -= dx * .01; ph = Math.min(3, Math.max(.2, ph - dy * .01)); }
      else if (Pt.size === 2) { const d = dist(); r.rad = Math.min(12, Math.max(.8, r.rad * pd / d)); pd = d; }
      r.place();
    };
    const up = (e: PointerEvent) => { if (Pt.size === 1 && moved < 6) tap(e); Pt.delete(e.pointerId); };
    const cancel = (e: PointerEvent) => { Pt.delete(e.pointerId); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); r.rad = Math.min(12, Math.max(.8, r.rad * (1 + e.deltaY * .001))); r.place(); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel); el.addEventListener('wheel', wheel, { passive: false });

    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (r.sweep && r.G && r.def) {
        const s = (t - r.t0) / 1000, v = { ...r.V };
        (r.def.adjusters || []).forEach((a: any, i: number) => { if (a.sweep) v[a.id] = Math.round(Math.sin(s * (1.1 + i * .55)) * a.max * .9); });
        setVals(v); applyValues(v);
      }
      if (r.sweep || r.dirty) { r.dirty = false; ren.render(scene, cam); }
    };
    fit(); r.place(); raf = requestAnimationFrame(loop);

    let dead = false;
    setOwn(isOwner());
    (async () => {
      await refs().load();
      if (dead) return;
      const ids = [...BUILTIN, ...refs().models].map(x => x.id);
      const h0 = decodeURIComponent(location.hash.slice(1)), id0 = h0 || labs.recent(1)[0] || 'elevon';
      const found = ids.includes(id0);
      if (!found && h0) say('Model "' + id0 + '" was not found. Showing the default.', true);
      const start = found ? id0 : 'elevon'; setSelId(start); openModel(start);
    })();

    return () => {
      dead = true; cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel); el.removeEventListener('wheel', wheel);
      ren.dispose(); if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line
  }, []);

  const saveT = useRef<any>(0);
  const onSlide = (id: string, v: number) => { const nv = { ...vals, [id]: v }; R.current.V = nv; setVals(nv); applyValues(nv); clearTimeout(saveT.current); saveT.current = setTimeout(() => { if (selId) labs.patch(selId, { vals: nv }); }, 600); };
  const toggleSweep = () => {
    const r = R.current; r.sweep = !r.sweep; r.t0 = performance.now(); setSweep(r.sweep); if (!r.sweep) resetAll();
  };
  const toggleWire = () => { const r = R.current; r.dirty = true; r.wire = !r.wire; setWire(r.wire); eachMat(m => { m.wireframe = r.wire; }); };

  /* Only the owner can upload. The file is checked first, then the owner picks the category it belongs to. */
  async function onUpload(f: File | undefined) {
    if (!f) return;
    if (!isOwner()) { say('Only the owner can upload 3D models. Unlock the owner password in Settings first.', true); return; }
    try {
      const code = await f.text();
      if (isSim(code)) { setPend({ name: simTitle(code, f.name.replace(/\.\w+$/, '')), sub: is3d(code) ? '3D simulation' : '2D simulation', info: '', code, cat: '' }); return; }
      const m = await validateModel(code);
      const guess = Rf.categories.find(c => c.name.toLowerCase() === String(m.category || '').toLowerCase());
      setPend({ name: m.name, sub: m.sub || '', info: m.info || '', code, cat: guess ? guess.id : '' });
    } catch (x: any) { say(f.name + ': ' + x.message, true); }
  }
  async function confirmUpload() {
    if (!pend) return;
    try {
      const row = await Rf.uploadModel(pend.name, pend.sub, pend.info, pend.code, pend.cat || null);
      forgetModel(row.id); setPend(null); setPaste(false); setSelId(row.id); location.hash = row.id; await openModel(row.id, pend.code);
      say('Added “' + row.name + '” to ' + catName(pend.cat || undefined) + '.');
    } catch (x: any) { say(x.message, true); }
  }
  async function removeModel() {
    const row = Rf.models.find(m => m.id === selId); if (!row) return;
    const pw = await askPassword('Delete “' + row.name + '”?', 'Enter the owner password to delete this model.'); if (!pw) return;
    try { await Rf.deleteModel(row.id, pw); forgetModel(row.id); setSelId('elevon'); location.hash = 'elevon'; await openModel('elevon'); say('Model deleted.'); }
    catch (x: any) { say(x.message, true); }
  }

  const parts = def?.parts || [];
  const cur = all.find(m => m.id === selId), isFav = labs.fav(selId), rec = labs.rec(selId);
  const pick = (id: string) => { setSelId(id); location.hash = id; openModel(id); setBrowse(false); setTab('a'); };
  const qq = q.trim().toLowerCase(), match = (m: { name: string; sub?: string | null }) => !qq || (m.name + ' ' + (m.sub || '')).toLowerCase().includes(qq);
  const favIds = labs.favs(), recIds = labs.recent(5).filter(id => !favIds.includes(id) && id !== selId).slice(0, 4);
  const byId = (id: string) => all.find(m => m.id === id);
  const Row = ({ m }: { m: { id: string; name: string; sub?: string | null } }) => {
    const r = labs.rec(m.id);
    return (
      <div className={'lb-row' + (m.id === selId ? ' on' : '')}>
        <button type="button" className="lb-pick" onClick={() => pick(m.id)}>
          <span className="lb-ic"><Ic n="cube" /></span>
          <span className="lb-tx"><b>{m.name}</b><small>{m.sub || catName(Rf.modelCat[m.id])}{r.best ? ' · best ' + r.best : ''}</small></span>
          {r.n ? <i className="lb-seen" title="Opened before" /> : null}
        </button>
        <button type="button" className={'lb-star' + (r.fav ? ' on' : '')} aria-label={r.fav ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={!!r.fav} onClick={() => labs.toggleFav(m.id)}><Ic n="star" /></button>
      </div>
    );
  };

  /* part quiz: tap the named part in the 3D view */
  const startQuiz = () => {
    const r = R.current, have = new Set<string>(); if (r.G) r.G.traverse((o: any) => { if (o.userData?.part) have.add(o.userData.part); });
    const ids = shuffle(parts.filter(p => have.has(p.id)).map(p => p.id)).slice(0, 8);
    if (ids.length < 2) { say('This model needs at least two named parts for a quiz.', true); return; }
    if (r.sel) select(r.sel);
    explode(0); r.quizState = { ids, i: 0, score: 0, busy: false };
    setQuiz({ ids, i: 0, score: 0, fb: '', done: false });
    r.quiz = (hit: string) => {
      const st = r.quizState; if (!st || st.busy) return;
      const want = st.ids[st.i], ok = hit === want; st.busy = true; if (ok) st.score++;
      eachMat((m, p) => m.emissive && m.emissive.setHex(p === want ? 0x1f7a3a : p === hit ? 0x9b2c2c : 0)); r.dirty = true;
      setQuiz(x => x && { ...x, fb: ok ? 'ok' : 'bad', score: st.score });
      setTimeout(() => {
        eachMat(m => m.emissive && m.emissive.setHex(0)); r.dirty = true; st.i++;
        if (st.i >= st.ids.length) {
          r.quiz = null; labs.patch(selId, { best: Math.max(labs.rec(selId).best || 0, st.score), runs: (labs.rec(selId).runs || 0) + 1 });
          setQuiz({ ids: st.ids, i: st.i, score: st.score, fb: '', done: true });
        } else { st.busy = false; setQuiz({ ids: st.ids, i: st.i, score: st.score, fb: '', done: false }); }
      }, 950);
    };
  };
  const stopQuiz = () => { const r = R.current; r.quiz = null; r.quizState = null; eachMat(m => m.emissive && m.emissive.setHex(0)); r.dirty = true; setQuiz(null); };
  const partName = (id: string) => parts.find(p => p.id === id)?.label || id;
  const makeCards = () => {
    if (!def) return;
    const ps = parts.filter(p => p.info && p.info.trim()); let n = 0;
    ps.forEach(p => { if (!e.myAddCard({ s: 'Lab: ' + def.name, q: withKind(def.name + ': ' + p.info!.trim(), 'f'), c: p.label, w: [], p: false })) n++; });
    if (n) { labs.patch(selId, { made: true }); say(n + ' flashcard' + (n === 1 ? '' : 's') + ' added to your set "Lab: ' + def.name + '". They join your daily review.'); }
    else say('Could not add the cards.', true);
  };
  const nInfo = parts.filter(p => p.info && p.info.trim()).length;

  return (
    <div className="ll lb lab">
      <header className="ll-top">
        <Link href="/" className="ll-back" aria-label="Back to home"><Ic n="arrowL" /></Link>
        <h1>3D lab</h1><span className="lb-sp" />
        {!sim && selId && <button type="button" className={'lb-ico' + (isFav ? ' on' : '')} aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={isFav} onClick={() => labs.toggleFav(selId)}><Ic n="star" /></button>}
      </header>

      <button type="button" className="lb-now" onClick={() => setBrowse(true)} aria-label="Choose a model">
        <span className="lb-ic lg"><Ic n="cube" /></span>
        <span className="lb-tx"><b>{cur?.name || def?.name || 'Loading…'}</b><small>{catName(Rf.modelCat[selId])}{sim ? ' · ' + sim.kind + ' simulation' : ''} · {labs.seen()} of {all.length} opened</small></span>
        <span className="lb-chg">Models</span>
      </button>

      {pend && (
        <section className="lb-card">
          {paste && <>
            <b>Paste a three.js script or a full HTML page (2D or 3D)</b>
            <input value={pend.name} placeholder="Name" onChange={ev => setPend({ ...pend, name: ev.target.value })} />
            <textarea value={pend.code} rows={8} spellCheck={false} placeholder={'<!doctype html> … or  /* flight-recall-sim */ + three.js code'}
              onChange={ev => { const c = ev.target.value; setPend({ ...pend, code: c, name: pend.name || (isSim(c) ? simTitle(c, '') : ''), sub: is3d(c) ? '3D simulation' : '2D simulation' }); }} />
            {pend.code && !isSim(pend.code) && <div className="err">Start with a full HTML page or /* flight-recall-sim */</div>}
          </>}
          <b>Where does “{pend.name || 'this'}” belong?</b>
          <select value={pend.cat} aria-label="Category" onChange={ev => setPend({ ...pend, cat: ev.target.value })}>
            <option value="">Uncategorized</option>
            {Rf.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="lb-two">
            <button type="button" className="ghost" onClick={() => { setPend(null); setPaste(false); }}>Cancel</button>
            <button type="button" className="solid" disabled={!!Rf.busy || (paste && (!pend.name.trim() || !isSim(pend.code)))} onClick={confirmUpload}>{Rf.busy || 'Add model'}</button>
          </div>
        </section>
      )}
      {msg.t && <div id="msg" className={'lb-msg' + (msg.err ? ' err' : '')} role="status">{msg.t}</div>}

      {sim && <>
        <SimFrame code={sim.code} name={sim.name} kind={sim.kind} />
        {own && cur && <p className="simadm">
          <label>Category{' '}<select value={Rf.modelCat[cur.id] || ''} onChange={ev => Rf.setModelCategory(cur.id, ev.target.value || null).catch((x: any) => say(x.message, true))}>
            <option value="">Uncategorized</option>{Rf.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {!('built' in cur) && <>{' '}<button type="button" className="ghost" onClick={removeModel}>Delete</button></>}</p>}
      </>}

      <div className="labg" style={sim ? { display: 'none' } : undefined}>
        <div className="labL">
          <div id="cv" ref={cv} className={st.cls}>
            <div id="hud">{quiz && !quiz.done ? <b>Tap: {partName(quiz.ids[quiz.i])}</b> : 'Drag to orbit · pinch to zoom'}</div>
            <StageBar st={st} />
          </div>
          <div className="lb-chips">
            <button type="button" className={sweep ? 'on' : ''} onClick={toggleSweep}>{sweep ? <><Ic n="stop" /> Stop sweep</> : <><Ic n="play" /> Auto sweep</>}</button>
            <button type="button" className={wire ? 'on' : ''} onClick={toggleWire}>Wireframe</button>
            <button type="button" onClick={() => { if (R.current.sweep) { R.current.sweep = false; setSweep(false); } resetAll(); }}>Reset</button>
          </div>
        </div>
        <div className="labR lb-card">
          <div className="segx lb-tabs" role="tablist">
            {TABS.map(([t, l]) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
          </div>
          {tab === 'a' && <div>
            <div className="f"><label>Exploded view <b>{Math.round(ex * 100)}%</b></label>
              <input type="range" min={0} max={1} step={.01} value={ex} onChange={ev => explode(+ev.target.value)} /></div>
            {(def?.adjusters || []).map(a => (
              <div className="f" key={a.id}>
                <label>{a.label} <b>{vals[a.id] ?? a.value}{a.unit || ''}</b></label>
                {a.hint ? <small>{a.hint}</small> : null}
                <input type="range" min={a.min} max={a.max} step={a.step || 1} value={vals[a.id] ?? a.value} onChange={ev => onSlide(a.id, +ev.target.value)} />
              </div>
            ))}
            {readout.length > 0 && <table><tbody>{readout.map((r, i) => <tr key={i}><td>{esc(r[0])}</td><td>{esc(r[1])}</td></tr>)}</tbody></table>}
            <p className="lb-n">Your slider positions are remembered for this model on every device you sign in on.</p>
          </div>}
          {tab === 'p' && <div>
            {parts.length ? parts.map(p => (
              <button type="button" key={p.id} className={'part' + (selPart === p.id ? ' on' : '')} onClick={() => select(p.id)}><b>{p.label}</b><small>{p.info || ''}</small></button>
            )) : <p className="lb-n">This model has no part list.</p>}
          </div>}
          {tab === 'q' && <div className="lb-quiz">
            {!quiz && <>
              <p className="lb-n">Find each part in the 3D view. The model rotates freely, so look around first. {rec.best ? 'Your best: ' + rec.best + ' (' + (rec.runs || 1) + ' run' + ((rec.runs || 1) === 1 ? '' : 's') + ').' : ''}</p>
              <button type="button" className="solid lb-wide" disabled={parts.length < 2} onClick={startQuiz}>Start part quiz</button>
              <h5>Keep it in your memory</h5>
              <p className="lb-n">Turn the named parts into flashcards. They join your normal review schedule, so the spaced repetition works for this model too.</p>
              <button type="button" className="ghost lb-wide" disabled={!nInfo || !!rec.made} onClick={makeCards}>{rec.made ? 'Flashcards already added' : nInfo ? 'Make ' + nInfo + ' flashcards from the parts' : 'Parts have no descriptions to use'}</button>
            </>}
            {quiz && !quiz.done && <>
              <div className="lb-prog" role="progressbar" aria-valuemin={0} aria-valuemax={quiz.ids.length} aria-valuenow={quiz.i}>{quiz.ids.map((_, i) => <i key={i} className={i < quiz.i ? 'on' : i === quiz.i ? 'now' : ''} />)}</div>
              <p className={'lb-ask ' + quiz.fb}>{quiz.fb === 'ok' ? 'Correct' : quiz.fb === 'bad' ? 'Not that one. The green part is ' + partName(quiz.ids[quiz.i]) : 'Where is the ' + partName(quiz.ids[quiz.i]) + '?'}</p>
              <button type="button" className="ghost lb-wide" onClick={stopQuiz}>Stop</button>
            </>}
            {quiz?.done && <>
              <div className="lb-res"><b>{quiz.score}</b><span>of {quiz.ids.length} found</span></div>
              <p className="lb-n">{quiz.score === quiz.ids.length ? 'Perfect run.' : 'Missed parts are worth a look in the Parts tab.'}</p>
              <div className="lb-two"><button type="button" className="ghost" onClick={stopQuiz}>Done</button><button type="button" className="solid" onClick={startQuiz}>Again</button></div>
            </>}
          </div>}
          {tab === 'i' && def && <div className="lb-info">
            <b>{def.name}</b><small>{def.category || ''}{def.sub ? ' › ' + def.sub : ''}</small>
            <p>{def.info || 'No description.'}</p>
            {own && cur && <p>
              <label>Category{' '}
                <select value={Rf.modelCat[cur.id] || ''} onChange={ev => Rf.setModelCategory(cur.id, ev.target.value || null).catch((x: any) => say(x.message, true))}>
                  <option value="">Uncategorized</option>
                  {Rf.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              {!('built' in cur) && <>{' '}<button type="button" className="ghost" onClick={removeModel}>Delete model</button></>}
            </p>}
            <p className="lb-n">Units: 1 = 1 m. Nose toward −Z, right is +X. Positive deflection = trailing edge down.</p>
          </div>}
        </div>
      </div>

      <Sheet open={browse} onClose={() => setBrowse(false)} className="sheet set">
        <SheetFrame title="Models" onClose={() => setBrowse(false)}>
          <div className="sc lb-sheet">
            <input type="search" className="lb-search" placeholder="Search models" value={q} onChange={ev => setQ(ev.target.value)} aria-label="Search models" />
            {!qq && favIds.length > 0 && <><h5>Favourites</h5>{favIds.map(id => byId(id)).filter(Boolean).map(m => <Row key={m!.id} m={m!} />)}</>}
            {!qq && recIds.length > 0 && <><h5>Recent</h5>{recIds.map(id => byId(id)).filter(Boolean).map(m => <Row key={m!.id} m={m!} />)}</>}
            {groups.map(g => { const ms = all.filter(m => catName(Rf.modelCat[m.id]) === g && match(m)); return ms.length ? <div key={g}><h5>{g}</h5>{ms.map(m => <Row key={m.id} m={m} />)}</div> : null; })}
            {qq && !all.some(match) && <p className="lb-n">No model matches “{q}”.</p>}
            {own && <div className="lb-own"><h5>Owner</h5><div className="lb-two">
              <button type="button" className="ghost" onClick={() => { setBrowse(false); fileRef.current?.click(); }}>Upload model or sim</button>
              <button type="button" className="ghost" onClick={() => { setBrowse(false); setPaste(true); setPend({ name: '', sub: '', info: '', code: '', cat: '' }); }}>Paste code</button></div></div>}
          </div>
        </SheetFrame>
      </Sheet>
      <input ref={fileRef} type="file" accept=".js,.html,.htm,text/javascript,text/html" hidden onChange={async ev => { const t = ev.target; await onUpload(t.files?.[0]); t.value = ''; }} />
      <AskHost />
    </div>
  );
}
