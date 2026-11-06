import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient<any, 'public', any> | null = null;

/** Service-role client. Server only: it bypasses row level security. */
export function admin() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
  client = createClient<any, 'public', any>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
