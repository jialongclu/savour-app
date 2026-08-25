-- Savour — make the storage policies self-contained.
--
-- The originals asked `exists (select 1 from public.rolls ...)` from inside a
-- storage.objects policy. That subquery is evaluated as the calling role, so it
-- is itself subject to rolls' RLS *and* to rolls' table grants — RLS nested
-- inside RLS. When the inner check silently returns no rows, the outer policy
-- reads as a plain violation with nothing to say why.
--
-- These helpers answer the same two questions in one SECURITY DEFINER hop, so
-- the storage policy depends on a boolean rather than on another table's
-- access rules. The semantics are unchanged: you may write to an active roll
-- you belong to, and read one that has developed.

create or replace function public.can_shoot_into(p_roll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.rolls r
      join public.roll_members m on m.roll_id = r.id
     where r.id = p_roll_id
       and r.status = 'active'
       and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_read_roll(p_roll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.rolls r
      join public.roll_members m on m.roll_id = r.id
     where r.id = p_roll_id
       and r.status = 'finished'   -- the hidden-until-developed rule (§9.2)
       and m.user_id = auth.uid()
  );
$$;

grant execute on function public.can_shoot_into(uuid) to authenticated;
grant execute on function public.can_read_roll(uuid) to authenticated;

-- Reads the first path segment as a roll id, or null when the name is not
-- shaped like one — so a malformed key fails the policy instead of raising a
-- cast error mid-check.
create or replace function public.roll_id_from_object(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  head text := split_part(p_name, '/', 1);
begin
  if head !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return head::uuid;
end;
$$;

grant execute on function public.roll_id_from_object(text) to authenticated;

drop policy if exists "members upload frames to an active roll" on storage.objects;
drop policy if exists "members read frames of a developed roll" on storage.objects;

create policy "members upload frames to an active roll"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'roll-photos'
    and public.can_shoot_into(public.roll_id_from_object(name))
  );

create policy "members read frames of a developed roll"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'roll-photos'
    and public.can_read_roll(public.roll_id_from_object(name))
  );

-- Removing an orphaned upload after a rejected shoot_frame() needs delete on
-- the object you just wrote, and only while the roll is still open.
create policy "members clean up their own failed upload"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'roll-photos'
    and owner = auth.uid()
    and public.can_shoot_into(public.roll_id_from_object(name))
  );
