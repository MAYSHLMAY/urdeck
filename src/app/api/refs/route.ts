import { NextResponse } from 'next/server';
import { requireOwner, guardDelete } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const str = (x: any, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const frac = (n: any) => typeof n === 'number' && n >= 0 && n <= 1;

/**
 * Owner-only management of categories, links and question mappings.
 * actions: addCategory, deleteCategory, link, unlink, linkSection, unlinkSection, setMapping, deleteMapping
 */
export async function POST(req: Request) {
  if (!requireOwner(req)) return fail('Locked. Unlock with the owner password.', 401);
  try {
    const b = await req.json(), db = admin();
    const ok = (r: { error: any }) => { if (r.error) throw r.error; };
    switch (b.action) {
      case 'addCategory': {
        if (!str(b.name, 60)) return fail('Give the category a name (max 60 characters).');
        const color = COLOR.test(b.color) ? b.color : '#3b82f6';
        const r = await db.from('categories').insert({ name: b.name.trim(), color_theme: color }).select('*').single();
        if (r.error) return fail(r.error.code === '23505' ? 'A category with that name already exists.' : r.error.message, r.error.code === '23505' ? 409 : 500);
        return NextResponse.json({ category: r.data });
      }
      case 'deleteCategory': {
        const g = guardDelete(req, b.password); if (g) return fail(g, 403);
        if (!UUID.test(b.id)) return fail('Bad id.');
        ok(await db.from('categories').delete().eq('id', b.id)); return NextResponse.json({ ok: true });
      }
      case 'link':
      case 'unlink': {
        if (!UUID.test(b.categoryId) || !UUID.test(b.pdfId)) return fail('Bad id.');
        if (b.action === 'link') ok(await db.from('category_pdfs').upsert({ category_id: b.categoryId, pdf_id: b.pdfId }, { onConflict: 'category_id,pdf_id', ignoreDuplicates: true }));
        else ok(await db.from('category_pdfs').delete().eq('category_id', b.categoryId).eq('pdf_id', b.pdfId));
        return NextResponse.json({ ok: true });
      }
      case 'linkSection':
      case 'unlinkSection': {
        if (!UUID.test(b.categoryId) || !str(b.section, 400)) return fail('Bad request.');
        if (b.action === 'linkSection') ok(await db.from('category_sections').upsert({ category_id: b.categoryId, section: b.section }, { onConflict: 'category_id,section', ignoreDuplicates: true }));
        else ok(await db.from('category_sections').delete().eq('category_id', b.categoryId).eq('section', b.section));
        return NextResponse.json({ ok: true });
      }
      case 'setMapping': {
        if (!str(b.questionId, 80) || !UUID.test(b.pdfId)) return fail('Bad request.');
        const page = Math.floor(b.page); if (!(page >= 1 && page <= 100000)) return fail('Bad page number.');
        let hi: any = null;
        if (b.highlight) {
          const h = b.highlight;
          if (![h.x, h.y, h.width, h.height].every(frac)) return fail('Bad highlight box.');
          hi = { x: h.x, y: h.y, width: h.width, height: h.height };
        }
        ok(await db.from('quiz_pdf_mappings').delete().eq('question_id', b.questionId).eq('pdf_id', b.pdfId));
        const r = await db.from('quiz_pdf_mappings').insert({ question_id: b.questionId, pdf_id: b.pdfId, page_number: page, highlight_data: hi }).select('*').single();
        if (r.error) throw r.error;
        return NextResponse.json({ mapping: r.data });
      }
      case 'deleteMapping':
        if (!UUID.test(b.id)) return fail('Bad id.');
        ok(await db.from('quiz_pdf_mappings').delete().eq('id', b.id)); return NextResponse.json({ ok: true });
    }
    return fail('Unknown action.');
  } catch (e: any) {
    return fail(e.message || 'Server error', 500);
  }
}
