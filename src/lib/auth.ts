/* Google sign-in through Supabase Auth (PKCE). Optional: the app works fully without an account.
   Web: redirect to Google and back. Android app: Google blocks sign-in inside a WebView, so we open the system browser
   and come back through the app:// link (app.urdeck.study://auth). */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { isNative, siteOrigin } from './base';
import { loadIdentity, saveIdentity } from './game/identity';
import { engine } from './engine';

export const NATIVE_REDIRECT = 'app.urdeck.study://auth';
const K_SEEN = 'ud-welcome-v1';

export interface Me { id: string; name: string; email: string; pic: string; sync?: string }
let _c: SupabaseClient | null = null, me: Me | null = null, ready = false, err = '';
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

function client(): SupabaseClient | null {
  if (_c) return _c;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || typeof window === 'undefined') return null;
  _c = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ud-auth-v1' } });
  return _c;
}
const toMe = (u: User | null | undefined): Me | null => {
  if (!u) return null;
  const m: any = u.user_metadata || {};
  const name = String(m.full_name || m.name || (u.email || '').split('@')[0] || 'Learner');
  return { id: u.id, name, email: u.email || '', pic: String(m.avatar_url || m.picture || ''), sync: typeof m.ud_sync === 'string' ? m.ud_sync : undefined };
};

export const auth = {
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  me: () => me, ready: () => ready, error: () => err, configured: () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),

  /** Call once at start: restores a saved session and finishes a sign-in when we were sent back with ?code=. */
  async boot() {
    const c = client(); if (!c) { ready = true; emit(); return; }
    try {
      const u = new URL(location.href), code = u.searchParams.get('code'), oerr = u.searchParams.get('error_description');
      if (oerr && u.searchParams.has('ud_auth')) { err = oerr; }
      if (code && u.searchParams.has('ud_auth')) {
        u.searchParams.delete('code'); u.searchParams.delete('ud_auth'); u.searchParams.delete('state');
        history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
        const r = await c.auth.exchangeCodeForSession(code); if (r.error) err = r.error.message;
      }
      const { data } = await c.auth.getSession(); me = toMe(data.session?.user);
      c.auth.onAuthStateChange((_e, s) => { me = toMe(s?.user); emit(); });
      if (isNative()) {
        const { App } = await import('@capacitor/app');
        App.addListener('appUrlOpen', async ({ url }) => { await auth.finish(url); });
      }
    } catch (x: any) { err = x?.message || 'Sign-in failed'; }
    ready = true; emit();
  },

  /** Called with the app:// link Google sends us back to. */
  async finish(url: string) {
    const c = client(); if (!c || !url.startsWith(NATIVE_REDIRECT)) return;
    try {
      const { Browser } = await import('@capacitor/browser'); Browser.close().catch(() => { /* ignore */ });
      const u = new URL(url.replace('app.urdeck.study://', 'https://x/')), code = u.searchParams.get('code'), e = u.searchParams.get('error_description');
      if (e) { err = e; emit(); return; }
      if (!code) return;
      const r = await c.auth.exchangeCodeForSession(code); err = r.error ? r.error.message : '';
      me = toMe(r.data.session?.user); emit();
    } catch (x: any) { err = x?.message || 'Sign-in failed'; emit(); }
  },

  async google(): Promise<void> {
    const c = client(); if (!c) throw new Error('Accounts are not set up for this build yet.');
    err = ''; try { sessionStorage.setItem('ud-claim', '1'); } catch { /* ignore */ }
    if (isNative()) {
      const { data, error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
      if (error || !data?.url) throw new Error(error?.message || 'Could not start Google sign-in.');
      const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: data.url });
      return;
    }
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteOrigin() + '/?ud_auth=1', queryParams: { prompt: 'select_account' } } });
    if (error) throw new Error(error.message);
  },

  /** The current access token (refreshed by supabase-js when needed), or '' when signed out. */
  async token(): Promise<string> { const c = client(); if (!c || !me) return ''; try { return (await c.auth.getSession()).data.session?.access_token || ''; } catch { return ''; } },

  async signOut() { const c = client(); if (c) await c.auth.signOut(); me = null; emit(); },

  /** Remember this account's pairing code so a new device gets the same progress after signing in. */
  async saveSync(code: string) { const c = client(); if (!c || !me) return; const r = await c.auth.updateUser({ data: { ud_sync: code } }); if (!r.error) { me = toMe(r.data.user); emit(); } }
};

/* ---- profile: local first, the server only sees changes (batched) and one read per sign-in ---- */
export interface Stats { games: number; wins: number; best: number; correct: number; streak: number; at: number }
const K_PROF = 'ud-profile-v1', STATS_TTL = 30 * 60 * 1000;
const rd = (): { hash?: string; stats?: Stats } => { try { return JSON.parse(localStorage.getItem(K_PROF) || '{}'); } catch { return {}; } };
const wr = (v: object) => { try { localStorage.setItem(K_PROF, JSON.stringify({ ...rd(), ...v })); } catch { /* ignore */ } };
let pushT: any = 0, pulled = '';
const goal = () => { try { return engine().O.dailyGoal || 20; } catch { return 20; } };

export const profile = {
  /** One read after sign-in: an existing account restores its player on this device, a new one is created from the local player. */
  async pull() {
    const c = client(); if (!c || !me || pulled === me.id) return; pulled = me.id;
    const { data: rows, error } = await c.from('profiles').select('player_id,name,avatar,goal').eq('id', me.id).limit(1);
    if (error) { pulled = ''; return; }
    const row = rows?.[0];
    if (row?.player_id) {
      const i = saveIdentity({ id: row.player_id, name: row.name || me.name, av: row.avatar || (await loadIdentity())?.av || '' });
      if (row.goal) { const e = engine(); e.O.dailyGoal = row.goal; e.save(); e.emit(); }
      wr({ hash: hashOf(i.name, i.av, goal(), i.id) });
    } else {
      let i = await loadIdentity(); if (!i) i = saveIdentity({ name: me.name, av: '' });
      const { error: e2 } = await c.from('profiles').insert({ id: me.id, player_id: i.id, name: i.name, avatar: i.av, goal: goal() });
      if (!e2) wr({ hash: hashOf(i.name, i.av, goal(), i.id) });
    }
  },
  /** Batched: waits a few seconds after the last edit and skips if nothing changed since the last send. */
  schedulePush() { if (!me) return; clearTimeout(pushT); pushT = setTimeout(() => { profile.push(); }, 4000); },
  async push() {
    const c = client(); if (!c || !me) return; const i = await loadIdentity(); if (!i) return;
    const h = hashOf(i.name, i.av, goal(), i.id); if (rd().hash === h) return;
    const { error } = await c.from('profiles').update({ name: i.name, avatar: i.av, goal: goal(), updated_at: new Date().toISOString() }).eq('id', me.id);
    if (!error) wr({ hash: h });
  },
  /** Lifetime game stats, cached for 30 minutes so opening the profile does not hit the server every time. */
  async stats(force = false): Promise<Stats | null> {
    const cached = rd().stats; if (!force && cached && Date.now() - cached.at < STATS_TTL) return cached;
    const c = client(), i = await loadIdentity(); if (!c || !me || !i) return cached || null;
    const { data, error } = await c.rpc('my_game_stats', { pid: i.id }); const r: any = Array.isArray(data) ? data[0] : data;
    if (error || !r) return cached || null;
    const st: Stats = { games: Number(r.games) || 0, wins: Number(r.wins) || 0, best: Number(r.best_score) || 0, correct: Number(r.total_correct) || 0, streak: Number(r.best_streak) || 0, at: Date.now() };
    wr({ stats: st }); return st;
  }
};
const hashOf = (n: string, a: string, g: number, p: string) => [n, a, g, p].join('|');
if (typeof window !== 'undefined') addEventListener('ud-identity', () => profile.schedulePush());

/* first-run flag */
export const seen = () => { try { return localStorage.getItem(K_SEEN) === '1'; } catch { return true; } };
export const markSeen = () => { try { localStorage.setItem(K_SEEN, '1'); dispatchEvent(new Event('ud-seen')); } catch { /* ignore */ } };
export const TOUR_EVENT = 'ud-tour';
export const CLAIM_EVENT = 'ud-claimed';
export const replayTour = () => { try { dispatchEvent(new Event(TOUR_EVENT)); } catch { /* ignore */ } };
