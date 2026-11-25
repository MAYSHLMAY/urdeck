/* Prepares an article's HTML before it goes into the sandboxed frame:
   - a Content-Security-Policy that lets the page run its own code and styles but blocks every network request and form post,
     so an article can never send anything out (the frame also has no access to the app's cookies, storage or page);
   - a tiny reporter so the app knows when the article is ready and how tall it is. */
const CSP = "default-src 'none'; img-src data: blob: https:; media-src data: blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const REPORT = "<script>(function(){function p(t){try{parent.postMessage({ud:'article',t:t,h:document.documentElement.scrollHeight},'*')}catch(e){}}"
  + "addEventListener('load',function(){p('ready')});try{new ResizeObserver(function(){p('h')}).observe(document.documentElement)}catch(e){}})();</script>";

export function prepare(html: string): string {
  const head = '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '">';
  const i = html.toLowerCase().lastIndexOf('</body>');
  return head + (i < 0 ? html + REPORT : html.slice(0, i) + REPORT + html.slice(i));
}
/** Title for a pasted or uploaded page: its <title>, else its first heading, else the file name. */
export function titleOf(html: string, fallback: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '';
  const clean = t.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
  return (clean || fallback.replace(/\.[a-z0-9]+$/i, '')).slice(0, 120);
}
