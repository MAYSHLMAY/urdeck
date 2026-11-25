/* Checks, with the public (anon) key only, what a stranger could read or change in your database.
   Run:  NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/rls-check.mjs
   Reading public content (cards, folders, pdfs, models, games) is expected. Any WRITE that says "OPEN" is a problem.
   Tables that must be private (sync_ops, sync_spaces, user_notes, profiles) must show "closed" for reading. */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.'); process.exit(2); }
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
const PUBLIC_READ = ['packs', 'cards', 'titles', 'folders', 'placements', 'categories', 'pdfs', 'category_pdfs', 'category_sections', 'quiz_pdf_mappings', 'models', 'model_categories', 'game_sessions', 'game_players'];
const PRIVATE = ['sync_ops', 'sync_spaces', 'user_notes', 'profiles'];
let bad = 0;
const nil = '00000000-0000-0000-0000-000000000000';
for (const t of [...PUBLIC_READ, ...PRIVATE]) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: H }); const rows = r.ok ? await r.json().catch(() => []) : [];
  const canRead = r.ok && Array.isArray(rows) && rows.length > 0, mustClose = PRIVATE.includes(t);
  // writes: insert an empty object, update and delete nothing-matching rows; success (2xx) on any of them means the table is writable by strangers
  const w = [
    await fetch(`${url}/rest/v1/${t}`, { method: 'POST', headers: H, body: '{}' }),
    await fetch(`${url}/rest/v1/${t}?id=eq.${nil}`, { method: 'PATCH', headers: H, body: '{}' }),
    await fetch(`${url}/rest/v1/${t}?id=eq.${nil}`, { method: 'DELETE', headers: H }),
  ];
  const writeOpen = w.some(x => x.status >= 200 && x.status < 300);
  const flag = writeOpen || (mustClose && canRead) ? '  <-- PROBLEM' : '';
  if (flag) bad++;
  console.log(t.padEnd(20), 'read:', mustClose ? (canRead ? 'OPEN' : 'closed') : (r.ok ? 'public (expected)' : 'closed'), '| write:', writeOpen ? 'OPEN' : 'closed', flag);
}
console.log(bad ? `\n${bad} table(s) need attention.` : '\nAll good: strangers can only read the public content.');
process.exit(bad ? 1 : 0);
