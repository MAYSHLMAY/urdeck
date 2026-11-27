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

/** For opening an article as a normal full page (not in a frame): adds a small way back to the app. Everything else in the page is left as the author wrote it. */
const BACK = "<style>#ud-back{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:2147483647;font:700 12px/1 system-ui,sans-serif;color:#fff;background:rgba(20,24,40,.78);border:0;border-radius:99px;padding:10px 14px;cursor:pointer;opacity:.7}#ud-back:hover,#ud-back:focus{opacity:1}</style>"
  + "<button id=\"ud-back\" type=\"button\" aria-label=\"Back to UrDeck\" onclick=\"location.href='/articles'\">Back</button>"
  + "<script>addEventListener('popstate',function(){if(location.pathname.indexOf('/articles/open')!==0)location.reload()})</script>";

/** Fonts kept inside the app (see public/fonts/articles). A page that asks Google Fonts for only these families gets the local copy, so it looks the same with no connection. Any other font is left alone. */
const HOSTED = new Set(['inter', 'jetbrains mono', 'space grotesk']);
export function localFonts(html: string): string {
  const refs = html.match(/(?:<link[^>]+fonts\.googleapis\.com[^>]*>|@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?)/gi);
  if (!refs) return html;
  const fams = [...refs.join(' ').matchAll(/family=([^:&"')\s;]+)/gi)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' ')).toLowerCase());
  if (!fams.length || !fams.every(f => HOSTED.has(f))) return html;
  return '<link rel="stylesheet" href="/fonts/articles/fonts.css">' + html.replace(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, '').replace(/@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?/gi, '');
}
/** Each article gets its own private corner of localStorage (keys are prefixed), so two articles that both save "theme" never overwrite each other, and an article cannot read or change the app's own saved data. Runs before the article's own code. */
const own = (id: string) => "<script>(function(){try{var P='ud-art:" + id.replace(/[^a-z0-9:_-]/gi, '') + ":',S=window.localStorage,keys=function(){var o=[];for(var i=0;i<S.length;i++){var k=S.key(i);if(k&&k.indexOf(P)===0)o.push(k.slice(P.length))}return o};"
  + "var m={getItem:function(k){return S.getItem(P+k)},setItem:function(k,v){S.setItem(P+k,String(v))},removeItem:function(k){S.removeItem(P+k)},clear:function(){keys().forEach(function(k){S.removeItem(P+k)})},key:function(i){return keys()[i]===undefined?null:keys()[i]}};"
  + "Object.defineProperty(m,'length',{get:function(){return keys().length}});Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return m}})}catch(e){}})();</script>";
export function standalone(html: string, id = 'page'): string {
  html = own(id) + localFonts(html);
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i < 0 ? html + BACK : html.slice(0, i) + BACK + html.slice(i);
}
