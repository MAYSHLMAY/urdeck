import { NextResponse } from 'next/server';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const SPACE = /^[0-9a-f]{32}$/;

/** GET ?space=…&after=N → records changed since N (encrypted; the server cannot read them). */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url), space = u.searchParams.get('space') || '', after = Math.max(0, Number(u.searchParams.get('after')) || 0);
    if (!SPACE.test(space)) return fail('Bad sync code.');
    const r = await admin().from('sync_ops').select('rk,t,d,seq').eq('space', space).gt('seq', after).order('seq', { ascending: true }).limit(300);
    if (r.error) throw r.error;
    return NextResponse.json({ rows: r.data || [] });
  } catch (e: any) { return fail(e.message || 'Could not reach sync.', 500); }
}

/** POST {space, ops:[{rk,t,d}]} → stores each record unless the server already holds a newer version of it. */
export async function POST(req: Request) {
  try {
    const raw = await req.text(); if (raw.length > 2_000_000) return fail('Too much at once.', 413);
    const b = JSON.parse(raw), space = String(b.space || '');
    if (!SPACE.test(space)) return fail('Bad sync code.');
    const ops = (Array.isArray(b.ops) ? b.ops : []).slice(0, 300).filter((o: any) => o && typeof o.rk === 'string' && o.rk.length <= 64 && typeof o.t === 'string' && o.t.length <= 48 && typeof o.d === 'string' && o.d.length <= 300_000)
      .map((o: any) => ({ rk: o.rk, t: o.t, d: o.d }));
    if (!ops.length) return NextResponse.json({ ok: true, n: 0 });
    const r = await admin().rpc('sync_put', { p_space: space, p_ops: ops });
    if (r.error) throw r.error;
    return NextResponse.json({ ok: true, n: ops.length });
  } catch (e: any) { return fail(e.message || 'Could not save to sync.', 500); }
}
