import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { admin } from '@/lib/server/supabase';

export const dynamic = 'force-dynamic';
const BUCKET = 'card-images';
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/** POST {data:"data:image/webp;base64,..."} -> {url}. Owner only. Creates the public bucket on first use. */
export async function POST(req: Request) {
  try {
    if (!requireOwner(req)) return fail('Only the owner can upload card pictures. Unlock first.', 401);
    const b = await req.json();
    const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!m) return fail('That is not a valid picture.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 1_200_000) return fail('The picture is too large (max 1.2 MB after shrinking).');
    const db = admin();
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1], path = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    let up = await db.storage.from(BUCKET).upload(path, buf, { contentType: 'image/' + m[1], cacheControl: '31536000' });
    if (up.error && /not found|bucket/i.test(up.error.message)) {
      await db.storage.createBucket(BUCKET, { public: true });
      up = await db.storage.from(BUCKET).upload(path, buf, { contentType: 'image/' + m[1], cacheControl: '31536000' });
    }
    if (up.error) throw up.error;
    return NextResponse.json({ url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
  } catch (e: any) { return fail(e?.message || 'Upload failed.', 500); }
}
