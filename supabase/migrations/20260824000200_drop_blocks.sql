-- Savour — blocking comes out.
--
-- It was carried over from the shape of a public social app, which this is
-- not. A roll is a small group who already know each other and who joined by
-- passing a six-character code around; there is no feed, no discovery, and no
-- way for a stranger to reach anyone. The one moderation tool that matches
-- how the app actually works is reporting a frame, which stays.
--
-- Reporting also still hides the frame for the person who reported it, so the
-- ability to stop seeing something is not lost with this.

-- `join_roll_by_code` consulted the table to turn away someone the owner had
-- blocked. Everything else about it is unchanged — including the deliberate
-- single error message for every kind of rejection, which is what stops the
-- failure telling an attacker whether a code was real.
create or replace function public.join_roll_by_code(p_code text)
returns public.rolls
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_roll   public.rolls;
  v_uid    uuid := auth.uid();
  v_active int;
  v_recent int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select count(*) into v_recent
    from public.join_attempts
   where user_id = v_uid
     and attempted_at > now() - interval '1 hour'
     and not succeeded;

  if v_recent >= 10 then
    raise exception 'too many attempts' using errcode = 'P0001';
  end if;

  select * into v_roll
    from public.rolls
   where share_code = upper(trim(p_code));

  -- Every rejection below returns the SAME message. A distinct error for
  -- "already finished" tells an attacker the code was real.
  if v_roll.id is null or v_roll.status <> 'active' then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, false);
    raise exception 'invalid code' using errcode = 'P0002';
  end if;

  -- Already a member: succeed idempotently rather than erroring.
  if exists (select 1 from public.roll_members
              where roll_id = v_roll.id and user_id = v_uid) then
    insert into public.join_attempts (user_id, succeeded) values (v_uid, true);
    return v_roll;
  end if;

  select count(*) into v_active
    from public.roll_members m
    join public.rolls r on r.id = m.roll_id
   where m.user_id = v_uid and r.status = 'active';

  if v_active >= public.max_active_rolls() then
    raise exception 'too many active rolls' using errcode = 'P0001';
  end if;

  insert into public.roll_members (roll_id, user_id, role)
  values (v_roll.id, v_uid, 'member');

  insert into public.join_attempts (user_id, succeeded) values (v_uid, true);

  return v_roll;
end;
$$;

-- Policies and grants go with the table; naming them anyway so that a partial
-- run leaves nothing addressing an object that no longer exists.
drop policy if exists "blocks are private to the blocker" on public.blocks;
drop policy if exists "users create their own blocks"     on public.blocks;
drop policy if exists "users remove their own blocks"     on public.blocks;

revoke all on public.blocks from authenticated;

drop table if exists public.blocks;
