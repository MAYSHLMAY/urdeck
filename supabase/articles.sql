-- Articles the owner publishes (an .html page that every visitor can open and interact with). Safe to re-run.
-- Row security is ON and there are NO public policies: reading and writing go through the Node API only.
create table if not exists public.articles (
  slug             text primary key,
  title            text not null,
  summary          text not null default '',
  html             text not null,
  version          int  not null default 1,
  reading_minutes  int  not null default 1,
  published_at     date not null default current_date,
  updated_at       timestamptz not null default timezone('utc'::text, now())
);
alter table public.articles enable row level security;
