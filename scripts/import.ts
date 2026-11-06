/**
 * Moves your old JSON "database" into Supabase.
 *
 *   npm run import -- ./data            (reads ./data, writes to Supabase)
 *   npm run import:dry -- ./data        (only counts, writes nothing)
 *
 * Reads, if present:  cards.json, index.json, packs/*.json, added.json, folders.json
 * Safe to run again: cards that already exist (same id) are skipped.
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { cook, parsePack } from '../src/lib/parse';
import type { Card } from '../src/lib/types';

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(resolve('.env.local')); loadEnv(resolve('.env'));

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dir = resolve(args.find(a => !a.startsWith('--')) || './data');
const read = (f: string): any => {
  const p = join(dir, f);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e: any) { console.warn(`! ${f}: ${e.message}`); return null; }
};

const cards: (Card & { pack?: string })[] = [];
const seen = new Set<string>();
let skippedDup = 0;
const push = (c: Card, pack?: string) => {
  const id = String(c.id);
  if (seen.has(id)) { skippedDup++; return; }
  seen.add(id); cards.push({ ...c, id, pack });
};
const cookAny = (r: any) => cook({ s: r.s, q: r.q, c: r.c, w: r.w, p: r.p });

const main = read('cards.json');
if (!main) { console.error(`Could not find ${join(dir, 'cards.json')}. Pass the folder that contains your cards.json.`); process.exit(1); }

(main.base || []).forEach((c: any) => push({ id: c.id, s: c.s, q: c.q, c: c.c, w: c.w, p: c.p ? 1 : undefined }));
(main.packs || []).forEach((pk: any) => {
  const list: Card[] = pk.cards ? pk.cards.map(cookAny) : parsePack(pk.name || 'pack', pk.text || '').cards;
  list.forEach(c => push(c, pk.name));
});
const index = read('index.json') || { packs: [] };
for (const f of index.packs || []) {
  const pk = read('data/' + f) || read(f);
  if (pk && Array.isArray(pk.cards)) pk.cards.forEach((r: any) => push(cookAny(r), pk.name || f));
  else console.warn(`! pack file not found or empty: ${f}`);
}
const added = read('added.json');
if (added && Array.isArray(added.cards)) added.cards.forEach((r: any) => push(cookAny(r), 'Community cards'));

const titles: { kind: string; key: string; title: string }[] = [];
Object.entries(main.cats || {}).forEach(([k, v]) => v && titles.push({ kind: 'cat', key: k, title: String(v) }));
Object.entries(main.chapters || {}).forEach(([k, v]) => v && titles.push({ kind: 'chapter', key: k, title: String(v) }));
const tmap: Record<string, string> = Object.assign({}, main.titles || {}, index.titles || {});
Object.entries(tmap).forEach(([k, v]) => v && titles.push({ kind: 'title', key: k, title: String(v) }));

const fold = read('folders.json') || { folders: [], place: {} };
const folders = (fold.folders || []).map((f: any) => ({ id: String(f.id), name: String(f.name), parent: String(f.parent || 'root') }));
const placements = Object.entries(fold.place || {}).map(([key, value]) => ({ key, value: String(value) }));

console.log(`Read from ${dir}:`);
console.log(`  cards       ${cards.length}  (${skippedDup} duplicates skipped)`);
console.log(`  titles      ${titles.length}`);
console.log(`  folders     ${folders.length}`);
console.log(`  placements  ${placements.length}`);
if (dry) { console.log('Dry run: nothing written.'); process.exit(0); }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const check = (what: string, r: { error: any }) => { if (r.error) { console.error(`\n${what} failed: ${r.error.message}`); process.exit(1); } };

(async () => {
  // packs, so cards can point at them
  const packNames = [...new Set(cards.map(c => c.pack).filter(Boolean))] as string[];
  const packId = new Map<string, number>();
  for (const name of packNames) {
    const count = cards.filter(c => c.pack === name).length;
    const r = await db.from('packs').insert({ name, card_count: count }).select('id').single();
    check('packs', r as any);
    packId.set(name, (r.data as any).id);
  }
  // cards, in deck order (ord is assigned in insert order)
  const B = 500;
  for (let i = 0; i < cards.length; i += B) {
    const rows = cards.slice(i, i + B).map(c => ({
      id: c.id, s: c.s, q: c.q, c: c.c, w: c.w, p: !!c.p, pack_id: c.pack ? packId.get(c.pack) : null
    }));
    check('cards', await db.from('cards').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
    process.stdout.write(`\r  cards ${Math.min(i + B, cards.length)}/${cards.length}`);
  }
  process.stdout.write('\n');
  for (let i = 0; i < titles.length; i += 500) check('titles', await db.from('titles').upsert(titles.slice(i, i + 500), { onConflict: 'kind,key' }));
  for (let i = 0; i < folders.length; i += 500) check('folders', await db.from('folders').upsert(folders.slice(i, i + 500), { onConflict: 'id' }));
  for (let i = 0; i < placements.length; i += 500) check('placements', await db.from('placements').upsert(placements.slice(i, i + 500), { onConflict: 'key' }));
  console.log('Done. Open the app and your library is there.');
})();
