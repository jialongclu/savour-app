-- Savour — two rolls, then a subscription.
--
-- The free allowance has to be rolls *ever opened*, not rolls open now.
-- Counting what exists would hand the allowance back every time someone
-- finished or deleted one, which is not a trial so much as an unlimited
-- supply with extra steps.
--
-- So the count lives on the profile, only ever goes up, and is written by
-- `create_roll` rather than by the client. Joining someone else's roll costs
-- nothing: you did not open it, and the person who did already paid for it.

alter table public.profiles
  add column if not exists rolls_created int not null default 0;

comment on column public.profiles.rolls_created is
  'Rolls this person has opened, ever. Never decremented — deleting a roll does '
  'not return the free allowance it was opened against.';

-- Everyone who already has rolls keeps an honest number rather than starting
-- again at zero on the day this ships.
update public.profiles p
   set rolls_created = (
     select count(*) from public.rolls r where r.owner_id = p.id
   )
 where rolls_created = 0;

/**
 * How many rolls a free account may open.
 *
 * Mirrored by `FREE_ROLLS` in src/lib/purchases.ts, which is what actually
 * gates today — this is the server's statement of the same rule, ready for
 * when `create_roll` enforces it.
 */
create or replace function public.free_roll_allowance()
returns int
language sql
immutable
as $$ select 2 $$;

grant execute on function public.free_roll_allowance() to authenticated;

-- ------------------------------------------------------------- create a roll
-- Unchanged except for the counter. The active-roll cap still applies on top:
-- a subscriber may open as many rolls as they like over time, but still only
-- three at once, because that limit is about attention rather than money.
create or replace function public.create_roll(
  p_name       text,
  p_max_frames int,
  p_filter     text default 'none'
)
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
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- Count memberships, not owned rolls: joining and creating have to draw on
  -- the same budget, or someone in five joined rolls could still create five more.
  select count(*) into v_active
    from public.roll_members m
    join public.rolls r on r.id = m.roll_id
   where m.user_id = v_uid and r.status = 'active';

  if v_active >= public.max_active_rolls() then
    raise exception 'too many active rolls' using errcode = 'P0001';
  end if;

  insert into public.rolls (name, owner_id, max_frames, filter, share_code)
  values (p_name, v_uid, p_max_frames, coalesce(p_filter, 'none'), public.generate_share_code())
  returning * into v_roll;

  insert into public.roll_members (roll_id, user_id, role)
  values (v_roll.id, v_uid, 'owner');

  -- After the insert, so a roll that failed to open is not charged for.
  update public.profiles
     set rolls_created = rolls_created + 1
   where id = v_uid;

  return v_roll;
end;
$$;
