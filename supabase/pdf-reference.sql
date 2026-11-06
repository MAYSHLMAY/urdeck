-- PDF reference system. Run once in the Supabase SQL editor, after schema.sql. Safe to re-run.
--
-- Differences from the draft you sent (on purpose):
--  * Fixed the typo "not line" -> "not null" in user_notes.created_at.
--  * This app has no Supabase Auth logins (owner password + anonymous readers), so notes are keyed by a
--    random per-browser `device_id` instead of auth.users, and all writes go through the Node API routes
--    (service role key). Public (anon) access is READ-ONLY, and user_notes is not readable by anyone but the server.
--  * Added category_sections so a category ("pool") can be linked to card sets and auto-open for them.

create table if not exists public.categories (
  id           uuid default gen_random_uuid() primary key,
  name         text not null unique,
  color_theme  text not null default '#3b82f6',
  created_at   timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.pdfs (
  id           uuid default gen_random_uuid() primary key,
  title        text not null,
  file_path    text not null unique,          -- path inside the "pdfs" storage bucket
  file_size    integer,
  uploaded_by  uuid references auth.users(id), -- stays null unless you add Supabase Auth later
  created_at   timestamptz not null default timezone('utc'::text, now())
);

-- Many-to-many: categories <-> pdfs
create table if not exists public.category_pdfs (
  category_id  uuid references public.categories(id) on delete cascade,
  pdf_id       uuid references public.pdfs(id) on delete cascade,
  primary key (category_id, pdf_id)
);

-- Which card sets (the "#2.4 Title" groups) a category covers, so opening the reference from a card finds its pool.
create table if not exists public.category_sections (
  category_id  uuid references public.categories(id) on delete cascade,
  section      text not null,
  primary key (category_id, section)
);

-- Quiz question -> page + highlight box. highlight_data = {x, y, width, height} as FRACTIONS (0..1) of the page.
create table if not exists public.quiz_pdf_mappings (
  id              uuid default gen_random_uuid() primary key,
  question_id     text not null,
  pdf_id          uuid references public.pdfs(id) on delete cascade,
  page_number     integer not null check (page_number >= 1),
  highlight_data  jsonb,
  created_at      timestamptz not null default timezone('utc'::text, now())
);
create index if not exists quiz_pdf_mappings_q_idx on public.quiz_pdf_mappings (question_id);

-- Notes are written locally first (IndexedDB) and backed up here in the background.
create table if not exists public.user_notes (
  id             uuid primary key,             -- generated in the browser, so retries are idempotent
  device_id      uuid not null,
  pdf_id         uuid references public.pdfs(id) on delete set null,
  selected_text  text not null,
  note_content   text,
  page_number    integer,
  rects          jsonb,                        -- [{x,y,width,height}] fractions, to re-draw the highlight
  created_at     timestamptz not null default timezone('utc'::text, now()),
  updated_at     timestamptz not null default timezone('utc'::text, now())
);
create index if not exists user_notes_device_idx on public.user_notes (device_id);

alter table public.categories        enable row level security;
alter table public.pdfs              enable row level security;
alter table public.category_pdfs     enable row level security;
alter table public.category_sections enable row level security;
alter table public.quiz_pdf_mappings enable row level security;
alter table public.user_notes        enable row level security;  -- no policies = only the service role can touch it

do $$
declare t text;
begin
  foreach t in array array['categories','pdfs','category_pdfs','category_sections','quiz_pdf_mappings'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public read') then
      execute format('create policy "public read" on public.%I for select using (true)', t);
    end if;
  end loop;
end $$;

-- Storage bucket for the PDF files (public read, 50 MB per file, PDFs only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', true, 52428800, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];
