import type { FoldDB, Folder, Mut, QCard } from './types';

export interface Tree {
  kids: Map<string, string[]>;
  name: Map<string, string>;
  parent: Map<string, string>;
  secs: Map<string, Set<string>>;
  secOf: Map<string, string>;
  virt: Set<string>;
  direct: Map<string, string[]>;
  secInfo: Map<string, { t: string; n: string }>;
  tags: Map<string, string[]>;
}

export const emptyTree = (): Tree => ({
  kids: new Map(), name: new Map([['root', 'Library']]), parent: new Map(), secs: new Map(), secOf: new Map(),
  virt: new Set(), direct: new Map(), secInfo: new Map(), tags: new Map()
});

function isDesc2(par: Map<string, string>, id: string, start: string) {
  let c: string | undefined = start, n = 0;
  while (c && n++ < 30) { if (c === id) return true; c = par.get(c); }
  return false;
}

/** Folders hold card sets (the "#Title" groups); sets hold cards. Chapters become virtual "g:" folders. */
export function buildTree(Q: QCard[], shared: FoldDB, local: FoldDB, gname: (k: string) => string): Tree {
  const name = new Map<string, string>([['root', 'Library']]), parent = new Map<string, string>(), virt = new Set<string>();
  const secG = new Map<string, string>(), secInfo = new Map<string, { t: string; n: string }>();
  for (const q of Q) if (!secG.has(q.s)) { secG.set(q.s, q.g); secInfo.set(q.s, { t: q.t, n: q.n }); }
  const place: Record<string, string> = Object.assign({}, shared.place, local.place);
  const gset = new Set(secG.values());
  gset.forEach(g => {
    const id = 'g:' + g;
    virt.add(id);
    name.set(id, place['name:' + id] || gname(g) || (g === 'other' ? 'Other' : g === 'hard' ? 'Hard questions' : 'Untitled'));
    parent.set(id, place['dir:' + id] || 'root');
  });
  const folders: Folder[] = shared.folders.concat(local.folders);
  const fset = new Set(folders.map(f => f.id));
  folders.forEach(f => {
    name.set(f.id, f.name);
    parent.set(f.id, f.parent && (f.parent === 'root' || name.has(f.parent) || fset.has(f.parent)) ? f.parent : 'root');
  });
  virt.forEach(id => {
    const pp = parent.get(id)!;
    if ((pp !== 'root' && !name.has(pp)) || isDesc2(parent, id, pp)) parent.set(id, 'root');
  });
  const secOf = new Map<string, string>();
  secG.forEach((g, s) => { let at = place[s]; if (!at || !name.has(at)) at = 'g:' + g; secOf.set(s, at); });
  const kids = new Map<string, string[]>();
  parent.forEach((p, id) => { if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(id); });
  const direct = new Map<string, string[]>();
  secOf.forEach((f, s) => { if (!direct.has(f)) direct.set(f, []); direct.get(f)!.push(s); });
  const secs = new Map<string, Set<string>>();
  const all = (id: string): Set<string> => {
    const hit = secs.get(id); if (hit) return hit;
    const st = new Set<string>(direct.get(id) || []);
    secs.set(id, st);
    (kids.get(id) || []).forEach(k => all(k).forEach(x => st.add(x)));
    return st;
  };
  name.forEach((_, id) => all(id));
  const tags = new Map<string, string[]>();
  Object.keys(place).forEach(k => {
    if (k.startsWith('tags:')) {
      const a = String(place[k]).split(',').map(x => x.trim().replace(/^#/, '')).filter(Boolean);
      if (a.length) tags.set(k.slice(5), a);
    }
  });
  virt.forEach(id => {
    if (!all(id).size && !(kids.get(id) || []).length) {
      const p = kids.get('root');
      if (p) { const i = p.indexOf(id); if (i >= 0) p.splice(i, 1); }
    }
  });
  return { kids, name, parent, secs, secOf, virt, direct, secInfo, tags };
}

export const fpath = (FT: Tree, id: string) => {
  const o: string[] = []; let c: string | undefined = id, n = 0;
  while (c && c !== 'root' && n++ < 30) { o.unshift(FT.name.get(c) || '?'); c = FT.parent.get(c); }
  return o;
};
export const isDesc = (FT: Tree, id: string, anc: string) => {
  let c: string | undefined = id, n = 0;
  while (c && n++ < 30) { if (c === anc) return true; c = FT.parent.get(c); }
  return false;
};
export const gOrder2 = (FT: Tree) => (a: string, b: string) => {
  const A = FT.name.get(a) || '', B = FT.name.get(b) || '';
  const va = FT.virt.has(a), vb = FT.virt.has(b);
  if (va !== vb) return va ? -1 : 1;
  return A.localeCompare(B, undefined, { numeric: true });
};
export function foldList(FT: Tree, skip?: string) {
  const o = [{ id: 'root', label: 'Library (top level)' }];
  const cmp = gOrder2(FT);
  const walk = (id: string, d: number) => {
    (FT.kids.get(id) || []).slice().sort(cmp).forEach(k => {
      if (skip && isDesc(FT, k, skip)) return;
      o.push({ id: k, label: '  '.repeat(d) + '📁 ' + (FT.name.get(k) || '?') });
      walk(k, d + 1);
    });
  };
  walk('root', 0);
  return o;
}

/** Apply one folder-tree change to an in-memory database. The server does the same thing in SQL. */
export function applyMut(db: FoldDB, m: Mut): boolean {
  switch (m.t) {
    case 'addFolder':
      if (db.folders.some(f => f.id === m.id)) return false;
      db.folders.push({ id: m.id, name: m.name, parent: m.parent }); return true;
    case 'renameFolder': {
      const f = db.folders.find(z => z.id === m.id); if (!f) return false; f.name = m.name; return true;
    }
    case 'moveFolder': {
      const f = db.folders.find(z => z.id === m.id); if (!f) return false; f.parent = m.parent; return true;
    }
    case 'delFolder': {
      const i = db.folders.findIndex(z => z.id === m.id); if (i < 0) return false;
      db.folders.splice(i, 1);
      db.folders.forEach(f => { if (f.parent === m.id) f.parent = m.up; });
      Object.keys(db.place).forEach(k => { if (!/^(tags|name):/.test(k) && db.place[k] === m.id) db.place[k] = m.up; });
      return true;
    }
    case 'setPlace': db.place[m.key] = m.value; return true;
    case 'delPlace': if (!(m.key in db.place)) return false; delete db.place[m.key]; return true;
  }
}
