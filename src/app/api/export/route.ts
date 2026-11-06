import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

/** GET (owner only) -> the whole library as JSON, for backups. */
export async function GET(req: Request) {
  if (!requireOwner(req)) return NextResponse.json({ error: 'Locked.' }, { status: 401 });
  try {
    const db = admin();
    const all = async (table: string, order: string) => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        const r = await db.from(table).select('*').order(order).range(from, from + 999);
        if (r.error) throw r.error;
        out.push(...(r.data || []));
        if ((r.data || []).length < 1000) break;
      }
      return out;
    };
    const [cards, titles, folders, placements, packs] = await Promise.all([
      all('cards', 'ord'), all('titles', 'key'), all('folders', 'id'), all('placements', 'key'), all('packs', 'id')
    ]);
    return new NextResponse(JSON.stringify({ app: 'flight-recall-library', v: 1, at: new Date().toISOString(), cards, titles, folders, placements, packs }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
