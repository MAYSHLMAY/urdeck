/* Where article files live. Today: plain files under public/articles-data/<slug>/v<N>/index.html, listed in index.json.
   Everything else goes through this file, so moving to object storage later means changing only these two functions. */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ArticleMeta } from './types';

const ROOT = join(process.cwd(), 'public', 'articles-data');
/** Public URL of one version of an article's file (served as a static file, or from storage later). */
export const articleUrl = (slug: string, version: number) => `/articles-data/${slug}/v${version}/index.html`;

export function listArticles(): ArticleMeta[] {
  try {
    const all = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')) as ArticleMeta[];
    return all.filter(a => a.status === 'published').sort((a, b) => b.published_at.localeCompare(a.published_at));
  } catch { return []; }
}
export const getArticle = (slug: string) => listArticles().find(a => a.slug === slug) || null;
