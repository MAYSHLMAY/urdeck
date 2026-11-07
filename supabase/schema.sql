-- Flight Recall database schema. Run once in the Supabase SQL editor.
-- Safe to re-run.

create table if not exists public.packs (
  id          bigint generated always as identity primary key,
  name        text not null,
  card_count  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- One row per question. `ord` keeps the original deck order (the "in order" new-card setting uses it).
create table if not exists public.cards (
  ord         bigint generated always as identity,
  id          text primary key,            -- stable hash of the question text (or the legacy id of a base card)
  s           text not null,               -- section title, e.g. "2.4 Steady State Flights & Performance"
  q           text not null,
  c           text not null,               -- correct answer
  w           jsonb not null default '[]', -- wrong answers
  p           boolean not null default false, -- past exam question
  pack_id     bigint references public.packs(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists cards_ord_idx on public.cards (ord);
create index if not exists cards_s_idx on public.cards (s);
create index if not exists cards_pack_idx on public.cards (pack_id);

-- Chapter / category names and section title overrides.
create table if not exists public.titles (
  kind   text not null check (kind in ('cat','chapter','title')),
  key    text not null,
  title  text not null,
  primary key (kind, key)
);

-- Folder tree.
create table if not exists public.folders (
  id          text primary key,
  name        text not null,
  parent      text not null default 'root',
  created_at  timestamptz not null default now()
);

-- Where each card set (section) lives, plus tags and renamed built-in folders:
--   key = <section title>        value = folder id
--   key = tags:<section title>   value = "tag1, tag2"
--   key = name:g:<chapter>       value = display name of a built-in chapter folder
--   key = dir:g:<chapter>        value = folder id that chapter folder is moved into
create table if not exists public.placements (
  key    text primary key,
  value  text not null
);

-- Row level security: everyone can READ. Nobody can write with the public (anon) key.
-- All writes go through the Node API routes, which use the service role key after an owner login.
alter table public.packs      enable row level security;
alter table public.cards      enable row level security;
alter table public.titles     enable row level security;
alter table public.folders    enable row level security;
alter table public.placements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['packs','cards','titles','folders','placements'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public read') then
      execute format('create policy "public read" on public.%I for select using (true)', t);
    end if;
  end loop;
end $$;
