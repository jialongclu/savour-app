-- Savour — push roll changes to every member, not just the one who shot.
--
-- `tg_photos_after_insert` writes both facts a member needs to `public.rolls`:
-- it bumps `photo_count`, and it flips `status` to 'finished' when the count
-- reaches `max_frames`. So one subscription to this table carries both — a
-- frame someone else took, and the moment the roll develops.
--
-- Without it the client only learns either fact by refetching, and the only
-- refetches are the ones that follow your *own* shutter. A member could sit on
-- "9 / 12" while everyone else was already looking at the album.
--
-- Realtime respects RLS, so this leaks nothing: the `rolls` select policy
-- already limits rows to `is_roll_member()`, and the subscription inherits it.

do $$
begin
  -- Supabase creates `supabase_realtime` on new projects, but not on every
  -- one, and a bare ALTER against a missing publication aborts the migration.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Adding a table twice is an error, so this has to be conditional for the
  -- migration to survive being re-run against a database that already has it.
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'rolls'
  ) then
    alter publication supabase_realtime add table public.rolls;
  end if;
end
$$;

-- UPDATE payloads carry only the changed columns unless the table says
-- otherwise. `photo_count` and `status` are what change, and DEFAULT replica
-- identity also sends the primary key — which is all the client needs to know
-- which roll to refresh.
alter table public.rolls replica identity default;
