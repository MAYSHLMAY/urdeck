import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
/** Tiny reachability check for the splash screen, and the build id so open apps can notice a newer release. Touches nothing. */
export async function GET() { return NextResponse.json({ ok: true, t: Date.now(), build: process.env.NEXT_PUBLIC_BUILD || '' }, { headers: { 'Cache-Control': 'no-store' } }); }
export async function HEAD() { return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } }); }
