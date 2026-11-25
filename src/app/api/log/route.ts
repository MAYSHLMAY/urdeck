import { NextResponse } from 'next/server';
import { admin } from '@/lib/server/supabase';
import { requireOwner } from '@/lib/server/auth';
import { readJson, tooMany } from '@/lib/server/limit';

export const dynamic = 'force-dynamic';
const clip = (x: unknown, n: number) => String(x ?? '').slice(0, n);
const quiet = () => new NextResponse(null, { status: 204 });

/** Crash reports. Takes only technical text (message, stack, page path, build id, browser name): never cards, notes, names or sync codes.
 *  Always answers 204 so a failing log can never break or slow the app. Stored in `app_errors` when that table exists, otherwise written to the server log. */
export async function POST(req: Request) {
  try {
    if (tooMany(req, 'log', 30)) return quiet();
    const b = await readJson(req, 8_000);
    const row = { build: clip(b.b, 40), path: clip(b.p, 120).replace(/[?#].*$/, ''), msg: clip(b.m, 300), stack: clip(b.s, 1800), ua: clip(req.headers.get('user-agent'), 160), kind: clip(b.k, 20) };
    if (!row.msg) return quiet();
    const r = await admin().from('app_errors').insert(row);
    if (r.error) console.error('[app-error]', JSON.stringify(row));
  } catch { /* never fail */ }
  return quiet();
}

/** Owner only: the latest reports, newest first. */
export async function GET(req: Request) {
  if (!requireOwner(req)) return NextResponse.json({ error: 'Owner only.' }, { status: 401 });
  const r = await admin().from('app_errors').select('*').order('t', { ascending: false }).limit(100);
  if (r.error) return NextResponse.json({ error: 'Run supabase/app-errors.sql first.' }, { status: 501 });
  return NextResponse.json({ errors: r.data });
}
