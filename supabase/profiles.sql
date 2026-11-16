-- Accounts (Google sign-in through Supabase Auth). Additive and safe to run more than once. Nothing here deletes or changes existing data.
-- One small row per account. The app is local-first: it only writes when you change your profile (batched, skipped if unchanged).
-- Before using: Supabase dashboard -> Authentication -> Providers -> Google (enable, paste Google client id/secret),
-- and Authentication -> URL Configuration -> add your site (https://YOUR-SITE/**) and app.urdeck.study://auth to Redirect URLs.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_id text unique,          -- the game identity (game_players.player_id) this account owns
  name text,
  avatar text,
  goal int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'own select') then
    create policy "own select" on profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'own insert') then
    create policy "own insert" on profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'own update') then
    create policy "own update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- Lifetime game stats for one player id, computed in one query from results the host already stored. Read-only.
create or replace function my_game_stats(pid text)
returns table (games bigint, wins bigint, best_score int, total_correct bigint, best_streak int)
language sql stable security invoker as $$
  select count(*), count(*) filter (where rank = 1), coalesce(max(score), 0), coalesce(sum(correct), 0), coalesce(max(best_streak), 0)
  from game_players where player_id = pid
$$;
grant execute on function my_game_stats(text) to authenticated;
