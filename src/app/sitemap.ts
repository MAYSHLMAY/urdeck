import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://urdeck.vercel.app').replace(/\/$/, '');
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [['', 1], ['/about', 0.9], ['/lab', 0.7], ['/read', 0.7], ['/articles', 0.8], ['/privacy', 0.3]].map(([p, pr]) => ({ url: SITE + p, lastModified: now, changeFrequency: 'weekly' as const, priority: pr as number }));
}
