/*
 * Anki package (.apkg) reader. Runs on the device, loaded only when someone picks a .apkg file (so it adds nothing to normal start-up).
 * It reads the zip, opens the collection database, and writes the app's "cards file" text:
 *   normal notes -> flip cards (and reversed ones when the note has a reverse card), cloze notes -> cloze cards, deck names -> sets.
 * The first picture on the front of a note becomes the card's picture (shrunk to stay small).
 * Supports the older collection.anki2 / .anki21 and the newer zstd collection.anki21b.
 */
import { compressImage, withImg } from './cardimg';

export interface ApkgResult { text: string; n: number; skipped: number; imgs: number; imgSkipped: number; decks: number; note: string }

let sqlP: Promise<any> | null = null;
const sql = () => sqlP || (sqlP = (async () => {
  // @ts-ignore: no types shipped for the browser build
  const m: any = await import('sql.js/dist/sql-wasm-browser.js'); const init = m.default || m;
  return init({ locateFile: () => '/sql-wasm.wasm' });
})());

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const dec = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, k: string) => k[0] === '#' ? String.fromCodePoint(k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : ENT[k.toLowerCase()] ?? m);
const imgsOf = (h: string) => [...h.matchAll(/<img[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(m => { const s = dec(m[1] ?? m[2] ?? m[3] ?? ''); try { return decodeURIComponent(s); } catch { return s; } });
export function plain(h: string): string {
  return dec(String(h || '').replace(/<img[^>]*>/gi, ' ').replace(/\[sound:[^\]]*\]/gi, ' ').replace(/<\s*(br|\/div|\/p|\/li|\/tr|\/h\d)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\[\/?\$?(?:latex|\$\$)\]/gi, '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}

/** Newer packages list their pictures as a tiny protobuf: repeated entries whose first field is the file name. */
function mediaNamesPb(b: Uint8Array): string[] {
  const out: string[] = []; let i = 0;
  const vi = () => { let r = 0, s = 0; for (;;) { const c = b[i++]; r += (c & 127) * 2 ** s; if (c < 128) break; s += 7; } return r; };
  while (i < b.length) {
    const tag = vi(), wt = tag & 7;
    if (wt === 2) { const len = vi(), end = i + len; if (tag >> 3 === 1) { let name = ''; let j = i; while (j < end) { const t = b[j++]; const w = t & 7; if (w === 2) { let l = 0, s = 0; for (;;) { const c = b[j++]; l += (c & 127) * 2 ** s; if (c < 128) break; s += 7; } if (t >> 3 === 1) name = new TextDecoder().decode(b.subarray(j, j + l)); j += l; } else if (w === 0) { while (b[j++] >= 128); } else if (w === 5) j += 4; else if (w === 1) j += 8; else break; } out.push(name); } i = end; }
    else if (wt === 0) vi(); else if (wt === 5) i += 4; else if (wt === 1) i += 8; else break;
  }
  return out;
}

export async function apkgToCards(buf: ArrayBuffer, fileName: string, onProg: (t: string) => void = () => {}): Promise<ApkgResult> {
  const fail = (note: string): ApkgResult => ({ text: '', n: 0, skipped: 0, imgs: 0, imgSkipped: 0, decks: 0, note });
  const [{ unzipSync }, { decompress }] = await Promise.all([import('fflate'), import('fzstd')]);
  onProg('Opening the package…');
  let z: Record<string, Uint8Array>;
  try { z = unzipSync(new Uint8Array(buf), { filter: f => /^(collection\.anki2|collection\.anki21|collection\.anki21b|media)$/.test(f.name) }); } catch { return fail('That file is not an Anki package.'); }
  const newer = !!z['collection.anki21b'];
  const dbBytes = newer ? decompress(z['collection.anki21b']) : z['collection.anki21'] || z['collection.anki2'];
  if (!dbBytes) return fail('No collection was found inside this package.');
  let names: Record<string, string> = {};   // file id in the zip -> file name
  try {
    if (z['media']) {
      if (newer) mediaNamesPb(decompress(z['media'])).forEach((n, i) => { if (n) names[String(i)] = n; });
      else names = JSON.parse(new TextDecoder().decode(z['media']));
    }
  } catch { names = {}; }
  const SQL = await sql(), db = new SQL.Database(dbBytes);
  try {
    const q = (s: string) => { const r = db.exec(s); return r.length ? (r[0].values as any[][]) : []; };
    const hasTbl = (t: string) => q("select 1 from sqlite_master where name='" + t + "'").length > 0;
    const deckName = new Map<string, string>(), cloze = new Set<string>(), tmpl = new Map<string, number>();
    if (hasTbl('notetypes')) {
      q('select id,name from decks').forEach(r => deckName.set(String(r[0]), String(r[1])));
      q('select ntid,count(*) from templates group by ntid').forEach(r => tmpl.set(String(r[0]), +r[1]));
    } else {
      const c = q('select models,decks from col')[0]; const M = JSON.parse(String(c[0])), D = JSON.parse(String(c[1]));
      Object.keys(D).forEach(k => deckName.set(k, String(D[k].name)));
      Object.keys(M).forEach(k => { if (M[k].type === 1) cloze.add(k); tmpl.set(k, (M[k].tmpls || []).length); });
    }
    const cards = new Map<string, { did: string; ords: Set<number> }>();
    q('select nid,did,ord from cards').forEach(r => { const k = String(r[0]); const x = cards.get(k) || { did: String(r[1]), ords: new Set<number>() }; x.ords.add(+r[2]); cards.set(k, x); });
    const notes = q('select id,mid,flds from notes');
    onProg('Reading ' + notes.length + ' notes…');

    // pass 1: text, and which pictures are needed
    type N = { set: string; kind: 'F' | 'R' | 'C'; front: string; back: string; img?: string };
    const out: N[] = []; let skipped = 0, imgSkipped = 0; const need = new Set<string>();
    for (const [id, mid, flds] of notes) {
      const f = String(flds).split('\x1f'), c = cards.get(String(id)), deck = deckName.get(c?.did || '') || 'Imported';
      const set = deck.split('\x1f').join(' · ').split('::').join(' · ').replace(/[\r\n#|]/g, ' ').trim() || 'Imported';
      const isC = cloze.has(String(mid)) || /\{\{c\d+::/.test(f[0] || '');
      const fimg = imgsOf(f[0] || '')[0], backImgs = f.slice(1).some(x => imgsOf(x).length);
      if (backImgs && !isC) imgSkipped++;
      const front = plain(f[0] || '');
      if (isC) { if (!/\{\{c\d+::/.test(front)) { skipped++; continue; } out.push({ set, kind: 'C', front, back: '', img: fimg }); if (fimg) need.add(fimg); continue; }
      const back = f.slice(1).map(plain).filter(Boolean).join(' — ');
      if ((!front && !fimg) || !back) { skipped++; continue; }
      const rev = !!c && c.ords.has(1) && (tmpl.get(String(mid)) || 0) >= 2 && !!front;
      out.push({ set, kind: rev ? 'R' : 'F', front, back, img: fimg }); if (fimg) need.add(fimg);
    }

    // pass 2: pictures (shrunk, and capped so they fit on the device)
    const idOf = new Map<string, string>(); Object.entries(names).forEach(([k, v]) => idOf.set(v, k));
    const want = new Set([...need].map(n => idOf.get(n)).filter(Boolean) as string[]);
    const data = new Map<string, string>(); let budget = 2_400_000, imgs = 0;
    if (want.size) {
      onProg('Reading ' + want.size + ' pictures…');
      let zm: Record<string, Uint8Array> = {};
      try { zm = unzipSync(new Uint8Array(buf), { filter: f => want.has(f.name) && f.originalSize < 6_000_000 }); } catch { zm = {}; }
      let k = 0;
      for (const name of need) {
        const id = idOf.get(name), raw = id ? zm[id] : undefined; if (!raw) continue;
        if (++k % 5 === 0) onProg('Shrinking pictures ' + k + ' of ' + need.size + '…');
        try {
          const bytes = newer ? decompress(raw) : raw;
          const url = await compressImage(new Blob([bytes as BlobPart]), 640, 38_000);
          if (url.length > budget) continue; budget -= url.length; data.set(name, url); imgs++;
        } catch { /* not a picture we can read */ }
      }
    }
    const lines = new Map<string, string[]>();
    for (const n of out) {
      const src = n.img ? data.get(n.img) : '';
      if (n.img && !src) imgSkipped++;
      const front = src ? withImg(n.front, { src, pins: [] }) : n.front;
      if (!front) { skipped++; continue; }
      (lines.get(n.set) || lines.set(n.set, []).get(n.set)!).push(n.kind === 'C' ? 'C: ' + front : (n.kind === 'R' ? 'R: ' : 'F: ') + front + ' | ' + n.back);
    }
    const text = [...lines].map(([s, a]) => '#' + s + '\n' + a.join('\n')).join('\n');
    const n = [...lines.values()].reduce((a, b) => a + b.length, 0);
    return { text, n, skipped, imgs, imgSkipped, decks: lines.size, note: n ? '' : 'No cards could be read from ' + fileName + '.' };
  } finally { db.close(); }
}
