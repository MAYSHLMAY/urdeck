import { NextResponse } from 'next/server';
import { admin } from './supabase';

/* Who owns a sync space, and who is calling. Both are cached in memory so sync does not add a database or auth round trip per request. */
const TOK = new Map<string, { uid: string; exp: number }>(), OWN = new Map<string, { uid: string | null; exp: number }>();

/** The signed-in user behind the x-user-token header (a Supabase access token), or null. Cached 5 minutes. */
export async function userOf(req: Request): Promise<string | null> {
  const t = req.headers.get('x-user-token') || ''; if (!t) return null;
  const c = TOK.get(t); if (c && c.exp > Date.now()) return c.uid;
  try {
    const r = await admin().auth.getUser(t), uid = r.data?.user?.id || null;
    if (uid) { if (TOK.size > 500) TOK.clear(); TOK.set(t, { uid, exp: Date.now() + 5 * 60e3 }); }
    return uid;
  } catch { return null; }
}
/** The account that claimed this space, or null (unclaimed, or the sync_owner table is not installed yet). Cached 60 seconds. */
export async function ownerOf(space: string): Promise<string | null> {
  const c = OWN.get(space); if (c && c.exp > Date.now()) return c.uid;
  let uid: string | null = null;
  try { const r = await admin().from('sync_spaces').select('user_id').eq('space', space).limit(1); if (!r.error) uid = r.data?.[0]?.user_id || null; } catch { /* not installed: treat as unclaimed */ }
  if (OWN.size > 2000) OWN.clear(); OWN.set(space, { uid, exp: Date.now() + 60e3 }); return uid;
}
/** null = allowed. A claimed space needs its owner's login. */
export async function gate(req: Request, space: string): Promise<NextResponse | null> {
  const o = await ownerOf(space); if (!o) return null;
  const u = await userOf(req); if (u === o) return null;
  return NextResponse.json({ error: u ? 'This sync space belongs to another account.' : 'This sync space is protected. Sign in with Google to keep syncing.', locked: true }, { status: 403 });
}
export async function claim(req: Request, space: string, release = false): Promise<NextResponse> {
  const u = await userOf(req); if (!u) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const o = await ownerOf(space);
  if (o && o !== u) return NextResponse.json({ error: 'This sync code already belongs to another account.' }, { status: 409 });
  const db = admin();
  const r = release ? (o ? await db.from('sync_spaces').delete().eq('space', space).eq('user_id', u) : { error: null }) : await db.from('sync_spaces').upsert({ space, user_id: u });
  if (r.error) return NextResponse.json({ error: 'Account protection is not set up on the server yet (run supabase/sync-owner.sql).' }, { status: 501 });
  OWN.set(space, { uid: release ? null : u, exp: Date.now() + 60e3 });
  return NextResponse.json({ ok: true, claimed: !release });
}
