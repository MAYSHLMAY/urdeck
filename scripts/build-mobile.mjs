/* Builds the web app as static files in ./out for the Android app.
   The server routes (src/app/api) cannot be bundled, so they are set aside for the build and the app calls them on your deployed site.
   Usage:  API_BASE=https://your-site.vercel.app node scripts/build-mobile.mjs  */
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
if (!API_BASE) { console.error('Set API_BASE to your deployed site, e.g. API_BASE=https://urdeck.vercel.app'); process.exit(1); }

// the app talks to Supabase straight from the phone, so its address and public key must be baked into the build
const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const has = k => process.env[k] || new RegExp('^' + k + '=.+', 'm').test(envFile);
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) if (!has(k)) { console.error(k + ' is missing. Add it as a GitHub Actions variable (same value as in Vercel).'); process.exit(1); }

const api = 'src/app/api', aside = 'src/app/_api_off';
if (existsSync(aside)) { console.error(aside + ' exists from an interrupted build; move it back to ' + api + ' first.'); process.exit(1); }
let moved = false;
try {
  rmSync('out', { recursive: true, force: true });
  if (existsSync(api)) { renameSync(api, aside); moved = true; }
  const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, NEXT_OUTPUT: 'export', NEXT_PUBLIC_API_BASE: API_BASE, NEXT_PUBLIC_SITE_URL: process.env.SITE_URL || API_BASE } });
  if (r.status !== 0) process.exitCode = r.status || 1;
} finally {
  if (moved) renameSync(aside, api);
}
if (!process.exitCode) console.log('\nStatic app written to ./out (API: ' + API_BASE + ')');
