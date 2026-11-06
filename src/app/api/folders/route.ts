import { NextResponse } from 'next/server';
import { requireOwner, guardDelete } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';
import type { Mut } from '@/lib/types';

export const dynamic = 'force-dynamic';

const s = (x: any, max = 300) => typeof x === 'string' && x.length > 0 && x.length <= max;

function valid(m: any): m is Mut {
  if (!m || typeof m !== 'object') return false;
  switch (m.t) {
    case 'addFolder': return s(m.id, 60) && s(m.name, 200) && s(m.parent, 60);
    case 'renameFolder': return s(m.id, 60) && s(m.name, 200);
    case 'moveFolder': return s(m.id, 60) && s(m.parent, 60);
    case 'delFolder': return s(m.id, 60) && s(m.up, 60);
    case 'setPlace': return s(m.key, 400) && s(m.value, 400);
    case 'delPlace': return s(m.key, 400);
  }
  return false;
}

/** POST {muts: Mut[]} -> applies the folder-tree changes in order. */
export async function POST(req: Request) {
  if (!requireOwner(req)) return NextResponse.json({ error: 'Locked. Unlock with the owner password.' }, { status: 401 });
  try {
    const { muts, password } = await req.json();
    if (!Array.isArray(muts) || !muts.length || muts.length > 500 || !muts.every(valid))
      return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
    if ((muts as Mut[]).some(m => m.t === 'delFolder')) {
      const g = guardDelete(req, password);
      if (g) return NextResponse.json({ error: g, needPassword: true }, { status: 403 });
    }
    const db = admin();
    const fail = (r: { error: any }) => { if (r.error) throw r.error; };
    for (const m of muts as Mut[]) {
      switch (m.t) {
        case 'addFolder': fail(await db.from('folders').upsert({ id: m.id, name: m.name, parent: m.parent })); break;
        case 'renameFolder': fail(await db.from('folders').update({ name: m.name }).eq('id', m.id)); break;
        case 'moveFolder': fail(await db.from('folders').update({ parent: m.parent }).eq('id', m.id)); break;
        case 'delFolder':
          fail(await db.from('folders').delete().eq('id', m.id));
          fail(await db.from('folders').update({ parent: m.up }).eq('parent', m.id));
          fail(await db.from('placements').update({ value: m.up }).eq('value', m.id).not('key', 'like', 'tags:%').not('key', 'like', 'name:%'));
          break;
        case 'setPlace': fail(await db.from('placements').upsert({ key: m.key, value: m.value })); break;
        case 'delPlace': fail(await db.from('placements').delete().eq('key', m.key)); break;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
