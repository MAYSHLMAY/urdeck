-- Owner card editing: edit a card, remove a card, add a single card. Run once after schema.sql. Safe to re-run.
-- Edits and removals must reach every device, and devices only download "new" rows (by `ord`), so an edit re-inserts the
-- card with a fresh `ord`, and a removal keeps a tombstone row (del = true) that devices apply and then forget.

alter table public.cards add column if not exists del boolean not null default false;

create or replace function public.edit_card(p_id text, p_s text, p_q text, p_c text, p_w jsonb, p_p boolean, p_del boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_pack bigint;
begin
  select pack_id into v_pack from public.cards where id = p_id;
  delete from public.cards where id = p_id;
  insert into public.cards (id, s, q, c, w, p, del, pack_id) values (p_id, p_s, p_q, p_c, coalesce(p_w, '[]'::jsonb), coalesce(p_p, false), coalesce(p_del, false), v_pack);
end $$;

revoke all on function public.edit_card(text, text, text, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.edit_card(text, text, text, text, jsonb, boolean, boolean) to service_role;
