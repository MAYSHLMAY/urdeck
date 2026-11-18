-- Scaling helpers for account sync. Additive and safe to run more than once; nothing existing is changed or deleted.
-- The API is stateless (every request carries the account token and a space id), so you can run as many copies
-- of the site as you like (Vercel does this for you). The database is the only shared part: these keep it fast as it grows.
create index if not exists sync_ops_updated on sync_ops (space, updated desc);

-- How much one space stores (for a usage page, or to spot a runaway device).
create or replace function sync_usage(p_space text) returns table (records bigint, bytes bigint, newest timestamptz)
language sql stable as $$
  select count(*), coalesce(sum(length(d)), 0), max(updated) from sync_ops where space = p_space
$$;
revoke all on function sync_usage(text) from public, anon, authenticated;

-- A small summary per account (streak, cards, 3D models opened) so a leaderboard or admin view needs no sync data.
alter table profiles add column if not exists summary jsonb;
