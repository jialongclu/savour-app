-- Savour — leaving a roll, including the owner leaving.
--
-- The client cannot do this itself. Handing ownership on means writing a row
-- the leaver is about to lose all rights to, and deleting the last-member roll
-- means deleting a row they no longer belong to — neither survives RLS, and
-- doing them as separate statements would leave an orphaned roll behind if the
-- second one failed. It is one function so it is one transaction.
--
-- Frames stay (PRD §14 Q2). Pulling a leaver's photos would renumber the
-- sequence and break `unique (roll_id, frame_number)`, and would punch holes in
-- albums that other people have already looked at.

create or replace function public.leave_roll(p_roll_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_roll public.rolls;
  v_next uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select * into v_roll from public.rolls where id = p_roll_id;

  -- Same message whether the roll is missing or simply not yours: a distinct
  -- error would confirm the id exists to someone guessing.
  if v_roll.id is null
     or not exists (
          select 1 from public.roll_members
           where roll_id = p_roll_id and user_id = v_uid
        )
  then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  delete from public.roll_members
   where roll_id = p_roll_id and user_id = v_uid;

  -- The earliest remaining member, which is who ownership passes to (§14 Q3).
  select user_id into v_next
    from public.roll_members
   where roll_id = p_roll_id
   order by joined_at asc, user_id asc
   limit 1;

  if v_next is null then
    -- Nobody left to own it. Photos and memberships cascade from here; the
    -- objects in storage are a separate sweep, see the note below.
    delete from public.rolls where id = p_roll_id;
    return;
  end if;

  if v_roll.owner_id = v_uid then
    update public.rolls set owner_id = v_next where id = p_roll_id;
    update public.roll_members
       set role = 'owner'
     where roll_id = p_roll_id and user_id = v_next;
  end if;
end;
$$;

revoke all on function public.leave_roll(uuid) from public;
grant execute on function public.leave_roll(uuid) to authenticated;

-- KNOWN GAP: deleting the roll cascades the `photos` rows but not the files in
-- the `roll-photos` bucket. Postgres cannot reach storage from a transaction,
-- so those objects are orphaned until something sweeps them. Worth a scheduled
-- job before launch — it is a storage bill, not a correctness problem, and the
-- files are unreachable either way once their rows are gone.
