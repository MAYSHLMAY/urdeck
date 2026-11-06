import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';
import { cook } from '@/lib/parse';
import type { RawCard } from '@/lib/types';

export const dynamic = 'force-dynamic';
const MAX = 20000;

/** POST {name, cards: RawCard[]} -> {added, dup}. Cards already in the library (same question text) are skipped. */
export async function POST(req: Request) {
  if (!requireOwner(req)) return NextResponse.json({ error: 'Locked. Unlock with the owner password.' }, { status: 401 });
  try {
    const body = await req.json();
    const name = String(body.name || 'upload.txt').slice(0, 200);
    const raw: RawCard[] = Array.isArray(body.cards) ? body.cards : [];
    if (!raw.length) return NextResponse.json({ error: 'No cards sent.' }, { status: 400 });
    if (raw.length > MAX) return NextResponse.json({ error: `Too many cards in one upload (max ${MAX}).` }, { status: 413 });
    const str = (x: any) => typeof x === 'string' && x.trim().length > 0 && x.length < 4000;
    const seen = new Set<string>();
    const cards = [];
    for (const r of raw) {
      if (!r || !str(r.s) || !str(r.q) || !str(r.c) || !Array.isArray(r.w) || !r.w.length || !r.w.every(str)) continue;
      const c = cook({ s: r.s.trim(), q: r.q, c: r.c, w: r.w, p: r.p ? 1 : undefined });
      if (seen.has(c.id)) continue;
      seen.add(c.id); cards.push(c);
    }
    if (!cards.length) return NextResponse.json({ error: 'No valid cards in the upload.' }, { status: 400 });

    const db = admin();
    const pk = await db.from('packs').insert({ name, card_count: 0 }).select('id').single();
    if (pk.error) throw pk.error;
    const packId = (pk.data as any).id;
    let added = 0;
    for (let i = 0; i < cards.length; i += 500) {
      const rows = cards.slice(i, i + 500).map(c => ({ id: c.id, s: c.s, q: c.q, c: c.c, w: c.w, p: !!c.p, pack_id: packId }));
      const r = await db.from('cards').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id');
      if (r.error) throw r.error;
      added += (r.data || []).length;
    }
    if (added) await db.from('packs').update({ card_count: added }).eq('id', packId);
    else await db.from('packs').delete().eq('id', packId);
    return NextResponse.json({ added, dup: cards.length - added });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
