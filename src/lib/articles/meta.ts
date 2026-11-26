/* Facts worked out from an article's HTML (used when the owner publishes). */
const strip = (s: string) => s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
export const readingMinutes = (html: string) => Math.max(1, Math.round(plain(strip(html)).split(' ').filter(Boolean).length / 200));
export const outlineOf = (html: string, max = 60): string[] => { const o: string[] = []; for (const m of strip(html).matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) { const t = plain(m[1]); if (t) o.push(t.slice(0, 160)); if (o.length >= max) break; } return o; };
export const slugOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const validSlug = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 60;
