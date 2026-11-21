import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://urdeck.vercel.app').replace(/\/$/, '');
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/study', '/leeches', '/exam', '/host', '/play', '/duel'] }], sitemap: SITE + '/sitemap.xml', host: SITE };
}
