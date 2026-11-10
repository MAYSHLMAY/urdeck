-- Live quiz game results. Additive and safe to run more than once. Nothing here deletes or changes existing data.
-- While a game is running nothing is written to the database (it runs over Supabase Realtime broadcast).
-- Only when the host finishes does the server store the result, so the leaderboard survives.
create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  pin text not null,
  title text,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  question_count int not null default 0,
  player_count int not null default 0,
  mode text,
  settings jsonb
);
create table if not exists game_players (
  session_id uuid not null references game_sessions(id),
  player_id text not null,
  nickname text not null,
  avatar text,
  team int,
  score int not null default 0,
  correct int not null default 0,
  answered int not null default 0,
  best_streak int not null default 0,
  avg_ms int,
  rank int,
  primary key (session_id, player_id)
);
create index if not exists game_players_player on game_players(player_id);
create index if not exists game_sessions_ended on game_sessions(ended_at desc);

alter table game_sessions enable row level security;
alter table game_players enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'game_sessions' and policyname = 'public read') then
    create policy "public read" on game_sessions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'game_players' and policyname = 'public read') then
    create policy "public read" on game_players for select using (true);
  end if;
end $$;
-- No insert/update/delete policies: only the server (service role key) can write.

-- Realtime broadcast needs no table and no setup. If your project restricts Realtime channels,
-- allow public broadcast + presence on topics that start with "fr-".
