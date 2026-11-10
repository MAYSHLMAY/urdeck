import { NextResponse } from 'next/server';
import { requireOwner, guardDelete } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';
import { cook } from '@/lib/parse';
import { replaceCard } from '@/lib/batch';
const TXT = (x: any, max = 4000) => typeof x === 'string' && x.trim().length > 0 && x.length < max;
import type { RawCard } from '@/lib/types';

export const dynamic = 'force-dynamic';
const MAX = 20000;

/** POST {name, cards: RawCard[]} -> {added, dup}. Cards already in the library (same question text) are skipped. */
export async function POST(req: Request) {
  if (!requireOwner(req)) return NextResponse.json({ error: 'Locked. Unlock with the owner password.' }, { status: 401 });
  try {
    const body = await req.json();
    if (body.action) return await single(req, body);
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

const NEEDS_SQL = 'Card editing is not set up yet. Run supabase/cards-edit.sql in the Supabase SQL editor.';
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/** Owner-only single-card actions: {action:'edit'|'delete'|'add', ...}. Uses the edit_card() function so every device gets the change. */
async function single(req: Request, b: any) {
  const db = admin();
  const rpc = async (row: { id: string; s: string; q: string; c: string; w: string[]; p: boolean }, del: boolean) => {
    const r = await db.rpc('edit_card', { p_id: row.id, p_s: row.s, p_q: row.q, p_c: row.c, p_w: row.w, p_p: row.p, p_del: del });
    if (r.error) { if (/edit_card|function|schema cache/i.test(r.error.message)) throw new Error(NEEDS_SQL); throw r.error; }
  };
  const fetchOne = async (id: string) => {
    const r = await db.from('cards').select('id,s,q,c,w,p').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return r.data as any;
  };
  if (b.action === 'delete') {
    const g = guardDelete(req, b.password); if (g) return bad(g, 403);
    if (!TXT(b.id, 300)) return bad('Bad card id.');
    const cur = await fetchOne(b.id); if (!cur) return bad('That card no longer exists.', 404);
    await rpc({ id: cur.id, s: cur.s, q: cur.q, c: cur.c, w: cur.w || [], p: !!cur.p }, true);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'batch') {
    const ids: string[] = Array.isArray(b.ids) ? b.ids.filter((x: any) => TXT(x, 300)).slice(0, 400) : [];
    if (!ids.length) return bad('Select some cards first.');
    if (b.op === 'delete') { const g = guardDelete(req, b.password); if (g) return bad(g, 403); }
    if (b.op === 'move' && !TXT(b.s, 300)) return bad('Choose the card set to move them to.');
    if (b.op === 'replace' && !(typeof b.find === 'string' && b.find.length && typeof b.repl === 'string')) return bad('Type the text to find.');
    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const r = await db.from('cards').select('id,s,q,c,w,p').in('id', ids.slice(i, i + 150));
      if (r.error) throw r.error; rows.push(...(r.data || []));
    }
    const cards: any[] = [], deleted: string[] = []; let skipped = 0;
    for (const cur of rows) {
      const row = { id: cur.id, s: cur.s, q: cur.q, c: cur.c, w: cur.w || [], p: !!cur.p };
      if (b.op === 'delete') { await rpc(row, true); deleted.push(cur.id); continue; }
      if (b.op === 'move') row.s = String(b.s).trim();
      else if (b.op === 'past') row.p = !!b.past;
      else if (b.op === 'replace') {
        const n = replaceCard(row, { find: b.find, repl: b.repl, scope: b.scope || 'all', cs: !!b.cs });
        if (!n) continue;
        if (!TXT(n.q) || !TXT(n.c) || !n.w.length || !n.w.every((x: string) => TXT(x))) { skipped++; continue; }
        const c = cook({ s: row.s, q: n.q, c: n.c, w: n.w, p: row.p ? 1 : undefined }); Object.assign(row, { q: c.q, c: c.c, w: c.w });
      } else return bad('Unknown batch action.');
      await rpc(row, false); cards.push({ id: row.id, s: row.s, q: row.q, c: row.c, w: row.w, p: row.p ? 1 : 0 });
    }
    return NextResponse.json({ cards, deleted, skipped });
  }
  if (b.action === 'edit' || b.action === 'add') {
    const w = Array.isArray(b.w) ? b.w.map((x: any) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : [];
    if (!TXT(b.q) || !TXT(b.c)) return bad('The question and the correct answer cannot be empty.');
    if (w.length < 1 || w.length > 5 || !w.every((x: string) => TXT(x))) return bad('Give between 1 and 5 wrong answers.');
    if (b.action === 'edit') {
      if (!TXT(b.id, 300)) return bad('Bad card id.');
      const cur = await fetchOne(b.id); if (!cur) return bad('That card no longer exists.', 404);
      const c = cook({ s: cur.s, q: b.q.trim(), c: b.c.trim(), w, p: (b.p === undefined ? !!cur.p : !!b.p) ? 1 : undefined });
      await rpc({ id: cur.id, s: cur.s, q: c.q, c: c.c, w: c.w, p: !!c.p }, false);   // keeps the id, so progress and PDF links stay
      return NextResponse.json({ card: { id: cur.id, s: cur.s, q: c.q, c: c.c, w: c.w, p: c.p ? 1 : 0 } });
    }
    if (!TXT(b.s, 300)) return bad('Choose the card set to add it to.');
    const c = cook({ s: b.s.trim(), q: b.q.trim(), c: b.c.trim(), w, p: b.p ? 1 : undefined });
    const ex = await fetchOne(c.id); if (ex) return bad('A card with this exact question already exists.', 409);
    await rpc({ id: c.id, s: c.s, q: c.q, c: c.c, w: c.w, p: !!c.p }, false);
    return NextResponse.json({ card: { id: c.id, s: c.s, q: c.q, c: c.c, w: c.w, p: c.p ? 1 : 0 } });
  }
  return bad('Unknown action.');
}
