-- Optional upgrade for the new note features (colours, tags, pin, linked question). Safe to re-run.
-- Notes still back up without it; the extras are then only kept on the device.
alter table public.user_notes add column if not exists meta jsonb;
