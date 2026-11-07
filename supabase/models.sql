-- 3D models shared by everyone, and their link to categories ("pools"). Run after pdf-reference.sql. Safe to re-run.
-- Uploaded model code runs in every visitor's browser, so ONLY the owner can write these tables (via the Node API).

create table if not exists public.models (
  id          text primary key,
  name        text not null unique,
  sub         text,
  info        text,
  code        text not null,
  created_at  timestamptz not null default timezone('utc'::text, now())
);

-- Which category a model belongs to. Works for built-in models (files in public/models) and uploaded ones.
create table if not exists public.model_categories (
  model_id     text primary key,
  category_id  uuid not null references public.categories(id) on delete cascade
);

alter table public.models           enable row level security;
alter table public.model_categories enable row level security;

do $$
declare t text;
begin
  foreach t in array array['models','model_categories'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public read') then
      execute format('create policy "public read" on public.%I for select using (true)', t);
    end if;
  end loop;
end $$;
