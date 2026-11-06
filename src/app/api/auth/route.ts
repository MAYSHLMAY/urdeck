import { NextResponse } from 'next/server';
import { clearThrottle, issueToken, passwordOk, requireOwner, throttle } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** POST {password} -> {token, exp}. GET with a Bearer token -> {ok}. */
export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (throttle(ip)) return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
    const { password } = await req.json();
    if (!passwordOk(String(password || ''))) return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
    clearThrottle(ip);
    return NextResponse.json(issueToken());
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return NextResponse.json({ ok: requireOwner(req) });
}
