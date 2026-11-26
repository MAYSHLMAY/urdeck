import { NextResponse } from 'next/server';
import { requireOwner, guardDelete } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';
import { readJson, slow, statusOf, tooMany } from '@/lib/server/limit';
import { readingMinutes, validSlug } from '@/lib/articles/meta';

export const dynamic = 'force-dynamic';
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const txt = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const MAX_HTML = 6_000_000;
const COLS = 'slug,title,summary,version,reading_minutes,published_at,updated_at';

/**
 * Anyone can read:
 *   GET /api/articles             -> {articles:[{slug,title,summary,version,reading_minutes,published_at,updated_at}]}
 *   GET /api/articles?slug=x      -> {meta, html}
 */
export async function GET(req: Request) {
  try {
    if (tooMany(req, 'articles', 120)) return slow();
    const slug = new URL(req.url).searchParams.get('slug'), db = admin();
    const cache = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' };
    if (!slug) {
      const r = await db.from('articles').select(COLS).order('updated_at', { ascending: false });
      if (r.error) return NextResponse.json({ articles: [], setup: true }, { headers: cache });   // table not installed yet
      return NextResponse.json({ articles: r.data }, { headers: cache });
    }
    if (!validSlug(slug)) return fail('Bad article.');
    const r = await db.from('articles').select(COLS + ',html').eq('slug', slug).maybeSingle();
    if (r.error || !r.data) return fail('Not found.', 404);
    const { html, ...meta } = r.data as any;
    return NextResponse.json({ meta, html }, { headers: cache });
  } catch (e: any) { return fail(e.message || 'Server error', statusOf(e)); }
}

/**
 * Owner only (the page runs in every reader's browser, inside a sandbox):
 *  {action:'publish', slug, title, summary?, html}   -> {slug, version}   New address: published. Existing address: replaced in place (version goes up).
 *  {action:'delete', slug, password}                 -> {ok}              Needs the password again.
 */
export async function POST(req: Request) {
  if (!requireOwner(req)) return fail('Only the owner can publish. Unlock first.', 401);
  try {
    if (tooMany(req, 'articles-w', 30)) return slow();
    const b = await readJson(req, MAX_HTML + 50_000), db = admin(), slug = b.slug;
    if (!validSlug(slug)) return fail('The address must be 3 to 60 characters: lowercase letters, numbers and dashes.');
    if (b.action === 'delete') {
      const g = guardDelete(req, b.password); if (g) return fail(g, 403);
      const r = await db.from('articles').delete().eq('slug', slug); if (r.error) throw r.error;
      return NextResponse.json({ ok: true });
    }
    if (b.action !== 'publish') return fail('Unknown action.');
    const html = typeof b.html === 'string' ? b.html : '';
    if (html.length < 20) return fail('The article file is empty.');
    if (html.length > MAX_HTML) return fail('That file is too large (6 MB max).');
    const ex = await db.from('articles').select('title,summary,version').eq('slug', slug).maybeSingle();
    if (ex.error) throw ex.error;
    const cur = ex.data as any, title = txt(b.title, 160) || cur?.title;
    if (!title) return fail('The article needs a title.');
    const version = (cur?.version || 0) + 1;
    const r = await db.from('articles').upsert({ slug, title, summary: txt(b.summary, 600) || cur?.summary || '', html, version, reading_minutes: readingMinutes(html), updated_at: new Date().toISOString() });
    if (r.error) throw r.error;
    return NextResponse.json({ slug, version });
  } catch (e: any) { return fail(e.message || 'Server error', statusOf(e)); }
}
