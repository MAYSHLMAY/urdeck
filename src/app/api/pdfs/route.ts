import { NextResponse } from 'next/server';
import { requireOwner, guardDelete } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const publicUploads = () => process.env.NEXT_PUBLIC_ALLOW_PUBLIC_PDF_UPLOADS === 'true';
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/**
 * POST {action:'sign', filename}                          -> {path, token}   (browser then uploads straight to Storage)
 * POST {action:'register', path, title, size, categoryIds} -> {pdf, links}
 * POST {action:'delete', id}                              -> owner only
 * Uploading straight to Storage keeps big PDFs out of the serverless request body limit.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const owner = requireOwner(req);
    if (b.action === 'delete') {
      { const g = guardDelete(req, b.password); if (g) return fail(g, owner ? 403 : 401); }
      if (!UUID.test(b.id)) return fail('Bad id.');
      const db = admin();
      const r = await db.from('pdfs').select('file_path').eq('id', b.id).maybeSingle();
      if (r.error) throw r.error;
      if (r.data) await db.storage.from('pdfs').remove([(r.data as any).file_path]);
      const d = await db.from('pdfs').delete().eq('id', b.id);
      if (d.error) throw d.error;
      return NextResponse.json({ ok: true });
    }
    if (!owner && !publicUploads()) return fail('Only the owner can upload PDFs. Unlock first.', 401);

    if (b.action === 'sign') {
      const base = String(b.filename || 'document.pdf').replace(/\.pdf$/i, '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';
      const path = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${base}.pdf`;
      const r = await admin().storage.from('pdfs').createSignedUploadUrl(path);
      if (r.error || !r.data) throw new Error(r.error?.message || 'Could not create an upload link. Did you run pdf-reference.sql?');
      return NextResponse.json({ path, token: r.data.token });
    }

    if (b.action === 'register') {
      const path = String(b.path || ''), title = String(b.title || '').trim().slice(0, 200);
      if (!/^[\w.-]{1,200}\.pdf$/.test(path)) return fail('Bad file path.');
      if (!title) return fail('Give the PDF a title.');
      const size = Number.isFinite(b.size) ? Math.min(Math.max(0, Math.floor(b.size)), MAX_BYTES) : null;
      const ids: string[] = (Array.isArray(b.categoryIds) ? b.categoryIds : []).filter((x: any) => UUID.test(x)).slice(0, 50);
      const db = admin();
      const ex = await db.storage.from('pdfs').list('', { search: path, limit: 5 });
      if (ex.error || !(ex.data || []).some(f => f.name === path)) return fail('The file was not uploaded.');
      const ins = await db.from('pdfs').insert({ title, file_path: path, file_size: size }).select('*').single();
      if (ins.error) throw ins.error;
      const pdf = ins.data as any;
      let links: any[] = [];
      if (ids.length) {
        const l = await db.from('category_pdfs').insert(ids.map(c => ({ category_id: c, pdf_id: pdf.id }))).select('*');
        if (l.error) throw l.error;
        links = l.data || [];
      }
      return NextResponse.json({ pdf, links });
    }
    return fail('Unknown action.');
  } catch (e: any) {
    return fail(e.message || 'Server error', 500);
  }
}
