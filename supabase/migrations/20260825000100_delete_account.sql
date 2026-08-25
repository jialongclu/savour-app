-- Savour — deleting your account, for real.
--
-- App Review guideline 5.1.1(v) requires any app that creates accounts to let
-- you destroy one from inside the app. The button existed and raised an alert
-- saying it was not wired up, which is the first thing a reviewer checks on an
-- account-based app.
--
-- The promise the confirmation dialog already makes is the one implemented
-- here: your username and picture go, and the frames you shot into other
-- people's rolls stay where they are. Deleting them would punch holes in
-- finished albums belonging to people who did not ask for anything — a roll of
-- twenty-four that comes back as nineteen because someone else left.

-- ------------------------------------------------------------ keep the frames
-- `photos.user_id` cascaded from profiles, so removing a profile destroyed
-- every photograph that person had ever contributed. Unlinked instead: the
-- frame survives, and it simply stops being attributed to anybody.
alter table public.photos alter column user_id drop not null;

alter table public.photos drop constraint if exists photos_user_id_fkey;
alter table public.photos
  add constraint photos_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

comment on column public.photos.user_id is
  'Who shot the frame, or null once that account has been deleted. The frame '
  'stays on the roll either way.';

-- --------------------------------------------------------------- delete account
create or replace function public.delete_account()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_roll record;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- Every roll they belong to has to be settled before they go, or the
  -- membership cascade would leave an ownerless roll behind. Same rule as
  -- `leave_roll`: hand it to whoever joined next, and if nobody did, the roll
  -- was theirs alone and goes with them.
  for v_roll in
    select r.id, r.owner_id
      from public.rolls r
      join public.roll_members m on m.roll_id = r.id
     where m.user_id = v_uid
  loop
    select m.user_id into v_heir
      from public.roll_members m
     where m.roll_id = v_roll.id
       and m.user_id <> v_uid
     order by m.joined_at asc
     limit 1;

    if v_heir is null then
      -- Nobody else was ever on it. Photos and memberships cascade from here.
      delete from public.rolls where id = v_roll.id;
    elsif v_roll.owner_id = v_uid then
      update public.rolls set owner_id = v_heir where id = v_roll.id;
      update public.roll_members
         set role = 'owner'
       where roll_id = v_roll.id and user_id = v_heir;
    end if;
  end loop;

  -- Whatever they shot into rolls that still exist stays, unattributed.
  update public.photos set user_id = null where user_id = v_uid;

  -- Reports they filed are theirs, not the roll's, and carry no value once the
  -- reporter is gone. Removed explicitly because nothing else would.
  delete from public.reports where reporter_id = v_uid;

  -- The account itself. `profiles` cascades from `auth.users`, and remaining
  -- memberships cascade from `profiles`, so this one statement finishes it.
  --
  -- Reachable because this function is owned by the migration role rather than
  -- the caller — an ordinary signed-in user has no rights on the auth schema,
  -- which is the point of doing it here rather than from the client.
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_account() to authenticated;

-- ------------------------------------------------------- unguessable codes
-- `random()` is a seeded PRNG, not a cryptographic one: its stream is
-- predictable to anyone who can observe enough of its output, and share codes
-- are the only thing standing between a stranger and someone's roll. pgcrypto
-- is already installed for `gen_random_uuid`, so the strong source costs
-- nothing.
--
-- The alphabet and length are unchanged — 32^6 is about 1.07 billion codes,
-- and `join_roll_by_code` already stops a caller after ten wrong guesses in an
-- hour, so the shape of the code was never the weak part.
create or replace function public.generate_share_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  bytes bytea;
  i int;
begin
  loop
    candidate := '';
    bytes := gen_random_bytes(6);
    for i in 1..6 loop
      -- 32 divides 256 exactly, so masking the low five bits is uniform —
      -- no modulo bias to correct for.
      candidate := candidate || substr(alphabet, 1 + (get_byte(bytes, i - 1) & 31), 1);
    end loop;
    exit when not exists (select 1 from public.rolls where share_code = candidate);
  end loop;
  return candidate;
end;
$$;
