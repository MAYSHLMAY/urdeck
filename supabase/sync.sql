-- Device sync (no accounts). Safe to run more than once; nothing existing is touched.
-- The server only ever sees encrypted blobs under an unguessable space id. It keeps ONE row per record (the newest),
-- so the table cannot grow without bound, and nothing is ever deleted by an update from a stale device.
create sequence if not exists sync_seq;
create table if not exists sync_ops (
  space   text   not null,
  rk      text   not null,
  t       text   not null,
  d       text   not null,
  seq     bigint not null default nextval('sync_seq'),
  updated timestamptz not null default now(),
  primary key (space, rk)
);
create index if not exists sync_ops_seq on sync_ops (space, seq);
alter table sync_ops enable row level security;   -- no policies: only the service role (our API) can read or write

create or replace function sync_put(p_space text, p_ops jsonb) returns int
language plpgsql as $$
declare o jsonb; n int := 0;
begin
  for o in select * from jsonb_array_elements(p_ops) loop
    insert into sync_ops (space, rk, t, d) values (p_space, o->>'rk', o->>'t', o->>'d')
    on conflict (space, rk) do update set t = excluded.t, d = excluded.d, seq = nextval('sync_seq'), updated = now()
    where excluded.t > sync_ops.t;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function sync_put(text, jsonb) from public, anon, authenticated;
