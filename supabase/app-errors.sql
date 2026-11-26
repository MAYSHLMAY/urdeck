-- Crash reports from the app. Additive and safe to run more than once.
-- No policies on purpose: only the server (service role) can read or write it.
create table if not exists public.app_errors (
  id bigserial primary key,
  t timestamptz not null default now(),
  build text, path text, msg text, stack text, ua text, kind text
);
alter table public.app_errors enable row level security;
create index if not exists app_errors_t on public.app_errors (t desc);
-- See the most common recent problems:
--   select msg, count(*) n, max(t) last, max(build) build from app_errors where t > now() - interval '7 days' group by msg order by n desc limit 30;
-- Clear old ones (do this now and then):
--   delete from app_errors where t < now() - interval '30 days';
