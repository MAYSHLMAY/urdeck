import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
/** Tiny reachability check for the splash screen. Touches nothing. */
export async function GET() { return NextResponse.json({ ok: true, t: Date.now() }, { headers: { 'Cache-Control': 'no-store' } }); }
export async function HEAD() { return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } }); }
