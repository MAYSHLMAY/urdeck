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
import { askPassword, AskHost, Ic } from './ui';

const esc = (t: any) => String(t);

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
  const [tab, setTab] = useState<'a' | 'p' | 'i'>('a');
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
    setVals(v); explode(0); applyValues(v);
  };

  async function openModel(id: string, code?: string) {
    say('');
    const r = R.current; let def: ModelDef;
    let src = code;
    try { src = code || await modelCode(id); } catch (e: any) { say('Could not load: ' + e.message, true); return; }
    if (isSim(src)) {
      const nm = all.find(m => m.id === id)?.name || simTitle(src); setSim({ code: src, name: nm, kind: is3d(src) ? '3D' : '2D' }); document.title = nm + ' · Lab'; return;
    }
    setSim(null);
    try { def = await validateModel(src); } catch (e: any) { say('Could not load: ' + e.message, true); return; }
    if (r.G) { r.scene.remove(r.G); r.G.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
    r.def = def; r.G = def.build(THREE); r.scene.add(r.G); r.base = new Map(); r.sel = null; r.sweep = false; setSweep(false); setSelPart(null);
    r.G.traverse((o: any) => { if (o.userData.ex) r.base.set(o, [o.position.x, o.position.y, o.position.z]); });
    const bb = new THREE.Box3().setFromObject(r.G), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    r.tg.copy(c); r.rad = Math.max(s.x, s.y, s.z) * 1.8 + .5; r.grid.position.y = bb.min.y - .1; r.place();
    eachMat(m => { m.wireframe = r.wire; });
    const v: Record<string, number> = {}; (def.adjusters || []).forEach(a => { v[a.id] = a.value; });
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
      if (h) select(h);
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
      const id0 = decodeURIComponent(location.hash.slice(1)) || 'elevon';
      const found = ids.includes(id0);
      if (!found) say('Model "' + id0 + '" was not found. Showing the default.', true);
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

  const onSlide = (id: string, v: number) => { const nv = { ...vals, [id]: v }; R.current.V = nv; setVals(nv); applyValues(nv); };
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
  return (
    <div className="lab">
      <div className="wrap">
        <div className="top">
          <Link href="/" className="backln"><Ic n="arrowL" /> Back</Link>
          <select value={selId} aria-label="Model" onChange={ev => { setSelId(ev.target.value); location.hash = ev.target.value; openModel(ev.target.value); }}>
            {groups.map(g => <optgroup key={g} label={g}>{all.filter(m => catName(Rf.modelCat[m.id]) === g).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}
          </select>
          {own && <button onClick={() => fileRef.current?.click()}>Upload model / sim</button>}
          {own && <button onClick={() => { setPaste(true); setPend({ name: '', sub: '', info: '', code: '', cat: '' }); }}>Paste code</button>}
          <input ref={fileRef} type="file" accept=".js,.html,.htm,text/javascript,text/html" hidden onChange={async ev => { const t = ev.target; await onUpload(t.files?.[0]); t.value = ''; }} />
        </div>
        {pend && (
          <div className="note" style={{ marginBottom: 10 }}>
            {paste && <>
              <b>Paste a three.js script or a full HTML page (2D or 3D)</b>
              <input value={pend.name} placeholder="Name" style={{ width: '100%', margin: '8px 0 6px' }} onChange={ev => setPend({ ...pend, name: ev.target.value })} />
              <textarea value={pend.code} rows={8} spellCheck={false} placeholder={'<!doctype html> … or  /* flight-recall-sim */ + three.js code'} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
                onChange={ev => { const c = ev.target.value; setPend({ ...pend, code: c, name: pend.name || (isSim(c) ? simTitle(c, '') : ''), sub: is3d(c) ? '3D simulation' : '2D simulation' }); }} />
              {pend.code && !isSim(pend.code) && <div className="err">Start with a full HTML page or /* flight-recall-sim */</div>}
              <div style={{ height: 8 }} />
            </>}
            <b>Where does “{pend.name || 'this'}” belong?</b>
            <select value={pend.cat} aria-label="Category" style={{ width: '100%', marginTop: 8 }} onChange={ev => setPend({ ...pend, cat: ev.target.value })}>
              <option value="">Uncategorized</option>
              {Rf.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setPend(null); setPaste(false); }}>Cancel</button>
              <button className="on" disabled={!!Rf.busy || (paste && (!pend.name.trim() || !isSim(pend.code)))} onClick={confirmUpload}>{Rf.busy || 'Add model'}</button>
            </div>
          </div>
        )}
        <div id="msg" className={msg.err ? 'err' : ''}>{msg.t}</div>
        {sim && <>
          <SimFrame code={sim.code} name={sim.name} kind={sim.kind} />
          {own && (() => { const row = all.find(m => m.id === selId); return row ? <p className="simadm">
            <label>Category{' '}<select value={Rf.modelCat[row.id] || ''} onChange={ev => Rf.setModelCategory(row.id, ev.target.value || null).catch((x: any) => say(x.message, true))}>
              <option value="">Uncategorized</option>{Rf.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {!('built' in row) && <>{' '}<button onClick={removeModel}>Delete</button></>}</p> : null; })()}
        </>}
        <div className="labg" style={sim ? { display: 'none' } : undefined}>
        <div className="labL">
        <div id="cv" ref={cv} className={st.cls}><div id="hud">Drag = orbit · pinch / wheel = zoom · tap a part</div><StageBar st={st} /></div>
        <div className="bar">
          <button className={sweep ? 'on' : ''} onClick={toggleSweep}>{sweep ? <><Ic n="stop" /> Stop sweep</> : <><Ic n="play" /> Auto sweep</>}</button>
          <button className={wire ? 'on' : ''} onClick={toggleWire}>Wireframe</button>
          <button onClick={() => { if (R.current.sweep) { R.current.sweep = false; setSweep(false); } resetAll(); }}>Reset</button>
        </div>
        </div>
        <div className="labR">
        <div className="tabs">
          {([['a', 'Adjust'], ['p', 'Parts'], ['i', 'Info']] as const).map(([t, l]) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
        </div>
        {tab === 'a' && <div>
          <div className="f"><label>Exploded view <b>{Math.round(ex * 100)}%</b></label>
            <input type="range" min={0} max={1} step={.01} value={ex} onChange={ev => explode(+ev.target.value)} /></div>
          <div>
            {(def?.adjusters || []).map(a => (
              <div className="f" key={a.id}>
                <label>{a.label} <b>{vals[a.id] ?? a.value}{a.unit || ''}</b></label>
                {a.hint ? <small>{a.hint}</small> : null}
                <input type="range" min={a.min} max={a.max} step={a.step || 1} value={vals[a.id] ?? a.value} onChange={ev => onSlide(a.id, +ev.target.value)} />
              </div>
            ))}
          </div>
          <table><tbody>{readout.map((r, i) => <tr key={i}><td>{esc(r[0])}</td><td>{esc(r[1])}</td></tr>)}</tbody></table>
        </div>}
        {tab === 'p' && <div>
          {parts.length ? parts.map(p => (
            <button key={p.id} className={'part' + (selPart === p.id ? ' on' : '')} onClick={() => select(p.id)}><b>{p.label}</b><small>{p.info || ''}</small></button>
          )) : <p className="note">This model has no part list.</p>}
        </div>}
        {tab === 'i' && def && <div className="note">
          <b>{def.name}</b><br />{def.category || ''}{def.sub ? ' › ' + def.sub : ''}
          <p>{def.info || 'No description.'}</p>
          {own && (() => {
            const row = all.find(m => m.id === selId);
            return row ? <p>
              <label>Category{' '}
                <select value={Rf.modelCat[row.id] || ''} onChange={ev => Rf.setModelCategory(row.id, ev.target.value || null).catch((x: any) => say(x.message, true))}>
                  <option value="">Uncategorized</option>
                  {Rf.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              {!('built' in row) && <>{' '}<button onClick={removeModel}>Delete model</button></>}
            </p> : null;
          })()}
          <p>Units: 1 = 1 m. Nose toward −Z, right is +X. Positive deflection = trailing edge down.</p>
        </div>}
        </div>
        </div>
      </div>
      <AskHost />
    </div>
  );
}
