-- Savour — let storage admit the frames `shoot_frame` already admits.
--
-- `20260824000100` changed the rule for taking a frame from "is the roll still
-- open?" to "has this shooter spent their own roll?", so that a phone which
-- spent the weekend out of signal could hand over what it took. What it did not
-- change was the storage policy, and the upload happens first: bytes go to the
-- bucket, and only then is `shoot_frame` called to record them.
--
-- So `can_shoot_into` still asking for `status = 'active'` meant a late frame
-- was turned away at the door with a 42501 before the function that would have
-- accepted it was ever reached. Filling a roll without signal and reconnecting
-- left those frames unable to upload at all — permanently, since nothing about
-- a developed roll ever becomes active again.
--
-- The two rules are now the same rule, written twice because they are enforced
-- in two places: you may write a frame to a roll you belong to until you have
-- contributed a whole roll's worth yourself.

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
       and m.user_id = auth.uid()
       -- Deliberately no status check. A roll that developed while this frame
       -- was queued still owes it a place; `shoot_frame` will slot it in by
       -- capture time.
       and (
         select count(*)
           from public.photos p
          where p.roll_id = r.id
            and p.user_id = auth.uid()
       ) < r.max_frames
  );
$$;

-- `can_read_roll` is untouched: frames stay unreadable until the roll develops
-- (§9.2), and that rule has nothing to do with this one.
