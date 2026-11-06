import { NextResponse } from 'next/server';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/**
 * Background backup of local notes. Anonymous: each browser has a random device_id.
 * POST {deviceId, upserts: Note[], deletes: string[]} -> {saved: string[], deleted: string[]}
 * A note can only be changed by the device that created it.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!UUID.test(b.deviceId)) return fail('Bad device id.');
    const up: any[] = Array.isArray(b.upserts) ? b.upserts.slice(0, 100) : [];
    const del: string[] = (Array.isArray(b.deletes) ? b.deletes : []).filter((x: any) => UUID.test(x)).slice(0, 200);
    const rows: any[] = [];
    for (const n of up) {
      if (!n || !UUID.test(n.id) || typeof n.selected_text !== 'string' || !n.selected_text.trim() || n.selected_text.length > 4000) continue;
      const rects = Array.isArray(n.rects) ? n.rects.slice(0, 80).filter((r: any) => r && [r.x, r.y, r.width, r.height].every((v: any) => typeof v === 'number' && isFinite(v))) : null;
      rows.push({
        id: n.id, device_id: b.deviceId, pdf_id: UUID.test(n.pdf_id) ? n.pdf_id : null,
        selected_text: n.selected_text, note_content: typeof n.note_content === 'string' ? n.note_content.slice(0, 4000) : null,
        page_number: Number.isInteger(n.page_number) && n.page_number > 0 ? n.page_number : null, rects,
        created_at: typeof n.created_at === 'string' && !isNaN(Date.parse(n.created_at)) ? n.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    const db = admin();
    const ids = rows.map(r => r.id).concat(del);
    const owned = new Set<string>(), foreign = new Set<string>();
    if (ids.length) {
      const r = await db.from('user_notes').select('id,device_id').in('id', ids);
      if (r.error) throw r.error;
      (r.data || []).forEach((x: any) => (x.device_id === b.deviceId ? owned : foreign).add(x.id));
    }
    const mine = rows.filter(r => !foreign.has(r.id));
    let saved: string[] = [];
    if (mine.length) {
      let r = await db.from('user_notes').upsert(mine, { onConflict: 'id' }).select('id');
      if (r.error && r.error.code === '23503') { // the PDF was deleted meanwhile: keep the note without it
        r = await db.from('user_notes').upsert(mine.map(m => ({ ...m, pdf_id: null })), { onConflict: 'id' }).select('id');
      }
      if (r.error) throw r.error;
      saved = (r.data || []).map((x: any) => x.id);
    }
    const toDel = del.filter(id => !foreign.has(id));
    if (toDel.length) {
      const r = await db.from('user_notes').delete().eq('device_id', b.deviceId).in('id', toDel);
      if (r.error) throw r.error;
    }
    return NextResponse.json({ saved, deleted: toDel });
  } catch (e: any) {
    return fail(e.message || 'Server error', 500);
  }
}
