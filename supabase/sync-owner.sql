-- Account-owned sync spaces. Additive and safe to run more than once. Nothing here deletes or changes existing data.
-- A signed-in user can claim their sync space. Once claimed, the pairing code alone no longer opens it:
-- sync requests must also carry that account's login. Spaces nobody claimed keep working with the code only.
create table if not exists sync_spaces (
  space text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
create index if not exists sync_spaces_user on sync_spaces(user_id);
alter table sync_spaces enable row level security;   -- no policies: only the server (service role) reads or writes it
