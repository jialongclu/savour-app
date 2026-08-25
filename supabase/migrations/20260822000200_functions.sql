-- Savour — server-side rules.
-- Everything the client must not be trusted with lives here: frame allocation,
-- the transition to 'finished', joining by code, and the 75% develop-early gate.

-- --------------------------------------------------------------- constants
-- Concurrent active rolls per user (PRD §14 Q4). Change here, not in the app.
create or replace function public.max_active_rolls() returns int
language sql immutable as $$ select 5 $$;

-- Failed join attempts tolerated per user per hour (PRD §9.10).
create or replace function public.max_join_failures() returns int
language sql immutable as $$ select 10 $$;

-- --------------------------------------------------------------- membership
-- SECURITY DEFINER so RLS policies can call it without recursing into
-- roll_members' own policy, which is the classic Postgres RLS deadlock.
create or replace function public.is_roll_member(p_roll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.roll_members
    where roll_id = p_roll_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_roll_owner(p_roll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rolls
    where id = p_roll_id and owner_id = auth.uid()
  );
$$;

-- -------------------------------------------------------------- share codes
-- 32 unambiguous characters: no 0/O/1/I. 32^6 ~ 1.07 billion (PRD §9.10).
create or replace function public.generate_share_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.rolls where share_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ------------------------------------------------ photo_count / finished
-- The ONLY automatic path to 'finished'. Never a client write (PRD §10).
create or replace function public.tg_photos_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roll public.rolls;
begin
  update public.rolls
     set photo_count = photo_count + 1
   where id = new.roll_id
  returning * into v_roll;

  if v_roll.photo_count >= v_roll.max_frames then
    update public.rolls
       set status = 'finished',
           finished_at = now()
     where id = v_roll.id
       and status = 'active';
  end if;

  return new;
end;
$$;

create trigger photos_after_insert
  after insert on public.photos
  for each row execute function public.tg_photos_after_insert();

-- ------------------------------------------------------------- create roll
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

  return v_roll;
end;
$$;

-- --------------------------------------------------------------- join roll
-- Clients never hold SELECT on rolls by share_code — that would make the join
-- path an enumeration oracle. This function is the only way in (PRD §9.10).
create or replace function public.join_roll_by_code(p_code text)
returns public.rolls
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_roll     public.rolls;
  v_uid      uuid := auth.uid();
  v_failures int;
  v_active   int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- Rate limit before touching the roll table at all.
  select count(*) into v_failures
    from public.join_attempts
   where user_id = v_uid
     and succeeded = false
     and attempted_at > now() - interval '1 hour';

  if v_failures >= public.max_join_failures() then
    raise exception 'too many attempts' using errcode = 'P0001';
  end if;

  select * into v_roll
    from public.rolls
   where share_code = upper(trim(p_code));

  -- Every rejection below returns the SAME message. A distinct error for
  -- "blocked" or "already finished" tells an attacker the code was real.
  if v_roll.id is null
     or v_roll.status <> 'active'
     or exists (
          select 1 from public.blocks
           where blocker_id = v_roll.owner_id and blocked_id = v_uid
        )
  then
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

-- -------------------------------------------------------------- shoot frame
-- Allocates the next frame_number under a row lock. Without the lock, two
-- members shooting at the same instant both compute count+1 and collide on
-- unique (roll_id, frame_number) — which is a real case, not a theoretical one.
create or replace function public.shoot_frame(
  p_roll_id      uuid,
  p_storage_path text,
  p_width        int default null,
  p_height       int default null
)
returns public.photos
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_roll  public.rolls;
  v_photo public.photos;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if not public.is_roll_member(p_roll_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;

  select * into v_roll from public.rolls where id = p_roll_id for update;

  if v_roll.status <> 'active' then
    raise exception 'roll already developed' using errcode = 'P0001';
  end if;

  insert into public.photos (roll_id, user_id, storage_path, frame_number, width, height)
  values (p_roll_id, v_uid, p_storage_path, v_roll.photo_count + 1, p_width, p_height)
  returning * into v_photo;

  return v_photo;
end;
$$;

-- ------------------------------------------------------------ develop early
-- PRD §9.9. The 75% threshold is re-checked here even though the UI hides the
-- action below it: a client-side check alone would unlock photos at frame one.
create or replace function public.develop_roll_early(p_roll_id uuid)
returns public.rolls
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_roll      public.rolls;
  v_threshold int;
begin
  select * into v_roll from public.rolls where id = p_roll_id for update;

  if v_roll.id is null then
    raise exception 'no such roll' using errcode = 'P0002';
  end if;

  if v_roll.owner_id <> auth.uid() then
    raise exception 'owner only' using errcode = '42501';
  end if;

  if v_roll.status <> 'active' then
    raise exception 'already developed' using errcode = 'P0001';
  end if;

  v_threshold := ceil(v_roll.max_frames * 0.75);

  if v_roll.photo_count < v_threshold then
    raise exception 'needs % of % frames', v_threshold, v_roll.max_frames
      using errcode = 'P0001';
  end if;

  update public.rolls
     set status = 'finished',
         finished_at = now(),
         developed_early = true
   where id = p_roll_id
  returning * into v_roll;

  return v_roll;
end;
$$;

-- ------------------------------------------------------------ hide / unhide
-- Trust-based and attributed (PRD §9.10): any member may hide, and the frame
-- renders as "hidden by @user" rather than vanishing.
create or replace function public.hide_photo(p_photo_id uuid)
returns public.photos
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_photo public.photos;
begin
  select * into v_photo from public.photos where id = p_photo_id;

  if v_photo.id is null or not public.is_roll_member(v_photo.roll_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  update public.photos
     set hidden_at = now(), hidden_by = auth.uid()
   where id = p_photo_id
  returning * into v_photo;

  return v_photo;
end;
$$;

create or replace function public.unhide_photo(p_photo_id uuid)
returns public.photos
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_photo public.photos;
begin
  select * into v_photo from public.photos where id = p_photo_id;

  if v_photo.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  -- Reversible by whoever hid it, or by the roll's owner.
  if v_photo.hidden_by <> auth.uid() and not public.is_roll_owner(v_photo.roll_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.photos
     set hidden_at = null, hidden_by = null
   where id = p_photo_id
  returning * into v_photo;

  return v_photo;
end;
$$;
