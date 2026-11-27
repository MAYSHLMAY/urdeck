/* Offline check: finds the things a page loads from the internet, because those are what stop working with no connection.
   Plain links to other websites are ignored (they do not affect how the page itself works). Fonts that the app hosts itself are not counted. */
import { localFonts } from './frame';

export type Kind = 'script' | 'style' | 'request' | 'frame' | 'font' | 'image' | 'media';
export type Ext = { kind: Kind; url: string; host: string };
const EXT = '((?:https?:)?\\/\\/[^"\'\\s>)]+)';
const host = (u: string) => { try { return new URL(u.startsWith('//') ? 'https:' + u : u).hostname; } catch { return u.slice(0, 40); } };
const isFont = (u: string) => /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(u) || /fonts\.(googleapis|gstatic)\.com/i.test(u);

export function externalRefs(html: string): Ext[] {
  const h = localFonts(html).replace(/<!--[\s\S]*?-->/g, ' '), out = new Map<string, Ext>();
  const add = (kind: Kind, url: string) => { const u = url.replace(/&amp;/g, '&'); if (/^https?:\/\/www\.w3\.org\//i.test(u)) return; out.set(kind + u, { kind, url: u, host: host(u) }); };
  for (const m of h.matchAll(new RegExp('<script\\b[^>]*\\bsrc\\s*=\\s*["\']?' + EXT, 'gi'))) add('script', m[1]);
  for (const m of h.matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0], rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(t)?.[1].toLowerCase() || '', href = new RegExp('\\bhref\\s*=\\s*["\']?' + EXT, 'i').exec(t)?.[1];
    if (!href) continue;
    if (/stylesheet/.test(rel)) add(isFont(href) ? 'font' : 'style', href);
    else if (/preload|modulepreload/.test(rel)) { const as = /\bas\s*=\s*["']?(\w+)/i.exec(t)?.[1]; add(as === 'font' ? 'font' : as === 'script' || rel.includes('module') ? 'script' : as === 'style' ? 'style' : 'image', href); }
  }
  for (const m of h.matchAll(new RegExp('<(img|source|video|audio|track|embed|object)\\b[^>]*?\\b(?:src|poster|data)\\s*=\\s*["\']?' + EXT, 'gi'))) add(/^(img|embed|object)$/i.test(m[1]) ? 'image' : 'media', m[2]);
  for (const m of h.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (/^(https?:)?\/\//i.test(u)) add('image', u); }
  for (const m of h.matchAll(new RegExp('<iframe\\b[^>]*\\bsrc\\s*=\\s*["\']?' + EXT, 'gi'))) add('frame', m[1]);
  for (const m of h.matchAll(new RegExp('@import\\s+(?:url\\(\\s*)?["\']?' + EXT, 'gi'))) add('style', m[1]);
  for (const m of h.replace(/@import[^;<]*;?/gi, ' ').matchAll(new RegExp('url\\(\\s*["\']?' + EXT, 'gi'))) add(isFont(m[1]) ? 'font' : 'image', m[1]);
  for (const m of h.matchAll(new RegExp('\\b(?:fetch|import)\\s*\\(\\s*["\'`]' + EXT, 'gi'))) add('request', m[1]);
  for (const m of h.matchAll(new RegExp('\\.open\\(\\s*["\'][A-Z]+["\']\\s*,\\s*["\'`]' + EXT, 'g'))) add('request', m[1]);
  for (const m of h.matchAll(new RegExp('\\bfrom\\s+["\']' + EXT, 'g'))) add('script', m[1]);
  for (const m of h.matchAll(/new\s+(?:WebSocket|EventSource)\(\s*["'`](wss?:\/\/[^"'`\s)]+)/gi)) add('request', m[1]);
  return [...out.values()];
}
/** Things that stop the page working offline (code, styles, data) versus things that only look different (fonts, pictures, media). */
export const BREAKS = new Set<Kind>(['script', 'style', 'request', 'frame']);
export function summary(list: Ext[]) { const breaks = list.filter(e => BREAKS.has(e.kind)).length; return { ok: !list.length, breaks, missing: list.length - breaks, total: list.length }; }
export const LABEL: Record<Kind, string> = { script: 'Code from the internet', style: 'Styles from the internet', request: 'Data requested from the internet', frame: 'Page embedded from the internet', font: 'Font from the internet', image: 'Picture from the internet', media: 'Audio or video from the internet' };
