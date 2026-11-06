import { NextResponse } from 'next/server';
import { requireOwner, guardDelete } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARK = /^\s*\/\*\s*flight-recall-model\s*\*\//;
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const text = (x: any, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/**
 * Owner-only 3D model management (model code runs in every visitor's browser, so nobody else may write it).
 *  {action:'upload', name, sub, info, code, categoryId?}   -> {model}
 *  {action:'setCategory', id, categoryId|null}              -> works for built-in and uploaded models
 *  {action:'delete', id, password}                          -> needs the password again
 */
export async function POST(req: Request) {
  if (!requireOwner(req)) return fail('Only the owner can change 3D models. Unlock first.', 401);
  try {
    const b = await req.json(), db = admin();
    const ok = (r: { error: any }) => { if (r.error) throw r.error; };
    const cat = b.categoryId == null || b.categoryId === '' ? null : String(b.categoryId);
    if (cat && !UUID.test(cat)) return fail('Bad category.');
    switch (b.action) {
      case 'upload': {
        const name = text(b.name, 120), code = typeof b.code === 'string' ? b.code : '';
        if (!name) return fail('The model needs a name.');
        if (!MARK.test(code)) return fail('The first line must be /* flight-recall-model */');
        if (code.length > 3_000_000) return fail('That model file is too large (3 MB max).');
        const ex = await db.from('models').select('id').eq('name', name).maybeSingle();
        if (ex.error) throw ex.error;
        const id = (ex.data as any)?.id || 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const r = await db.from('models').upsert({ id, name, sub: text(b.sub, 120), info: text(b.info, 2000), code }).select('id,name,sub,info,created_at').single();
        if (r.error) throw r.error;
        if (cat) ok(await db.from('model_categories').upsert({ model_id: id, category_id: cat }));
        else ok(await db.from('model_categories').delete().eq('model_id', id));
        return NextResponse.json({ model: r.data, categoryId: cat });
      }
      case 'setCategory': {
        const id = text(b.id, 80); if (!id) return fail('Bad id.');
        if (cat) ok(await db.from('model_categories').upsert({ model_id: id, category_id: cat }));
        else ok(await db.from('model_categories').delete().eq('model_id', id));
        return NextResponse.json({ ok: true });
      }
      case 'delete': {
        const g = guardDelete(req, b.password); if (g) return fail(g, 403);
        const id = text(b.id, 80); if (!id) return fail('Bad id.');
        ok(await db.from('model_categories').delete().eq('model_id', id));
        ok(await db.from('models').delete().eq('id', id));
        return NextResponse.json({ ok: true });
      }
    }
    return fail('Unknown action.');
  } catch (e: any) {
    return fail(e.message || 'Server error', 500);
  }
}
