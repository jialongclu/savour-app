-- Savour — a frame that was taken is a frame that is kept.
--
-- Until now a roll could refuse a photograph. `shoot_frame` raised
-- 'roll already developed' whenever the roll had filled, and the client then
-- deleted the object it had just uploaded. Two shooters racing the last frame
-- meant one of them lost a photograph to a lock they could not have known
-- about, and offline capture — which is the whole point of a camera you take
-- to places without signal — could not exist at all.
--
-- The rule changes from "is there room on the roll?" to "has this shooter used
-- up their own roll?". Each member may contribute at most `max_frames` frames,
-- which is exactly what an offline phone enforces for itself: it counts its own
-- exposures against the roll's length because it cannot see anyone else's.
--
-- Gating on time instead — admitting only frames taken before the roll
-- developed — looks equivalent and is not. Two phones go offline; the first
-- finds signal at four o'clock and its frames fill the roll; the second is
-- still out of range and keeps shooting until six. Every frame it took after
-- four would be refused, for a closure its shooter had no way to learn about.
-- That is the same silent loss this migration exists to end, moved somewhere
-- less visible.
--
-- The consequence is that a 24-frame roll can come back with more than 24
-- frames on it — two phones on a 24 can between them produce up to 48. That is
-- accepted deliberately. A roll longer than it promised is a far smaller harm
-- than deleting a photograph someone believed they had taken, and the per-
-- member cap is what keeps "longer" bounded rather than open-ended.

-- ------------------------------------------------------------- overflow room
-- `photo_count <= max_frames` was the constraint that made overflow
-- impossible. The floor stays; the ceiling goes.
alter table public.rolls drop constraint if exists count_in_range;
-- Dropped first so a re-run after a failed push does not trip over its own
-- previous attempt.
alter table public.rolls drop constraint if exists count_non_negative;
alter table public.rolls add constraint count_non_negative check (photo_count >= 0);

-- --------------------------------------------------------------- when it was
-- `taken_at` already exists but has only ever held `now()` at the moment of
-- insert — which for a queued frame is when the phone found signal again, not
-- when the shutter fired. It becomes client-supplied below, so the server
-- keeps its own arrival stamp as the account that cannot be wrong.
alter table public.photos
  add column if not exists received_at timestamptz not null default now();

comment on column public.photos.taken_at is
  'When the shutter fired, from the shooting device. Clamped server-side to no '
  'later than arrival, but still only as trustworthy as that phone''s clock.';
comment on column public.photos.received_at is
  'When the server recorded the frame. Never client-supplied; the tiebreaker '
  'when two devices disagree about the time.';

-- --------------------------------------------------------------- renumbering
-- Frames are numbered in the order they were taken, so a late arrival slots
-- into its true place in the roll rather than landing on the end. That means
-- renumbering the frames after it, which walks through states where two rows
-- briefly share a number. Deferring the constraint to commit lets the whole
-- shuffle happen in one statement instead of needing a scratch offset.
-- Found rather than named. The original was declared inline as an unnamed
-- `unique (roll_id, frame_number)`, so its name is whatever Postgres chose —
-- and dropping a name that turns out not to exist would silently leave the old
-- non-deferrable constraint in place beside the new one, where it would reject
-- the renumbering at runtime instead of failing loudly here.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.photos'::regclass
     and con.contype = 'u'
     and not con.condeferrable
     and (
       -- `attname` is of type `name`, and there is no name[] = text[] operator.
       select array_agg(att.attname::text order by att.attname::text)
         from unnest(con.conkey) k
         join pg_attribute att
           on att.attrelid = con.conrelid and att.attnum = k
     ) = array['frame_number', 'roll_id']::text[]
   limit 1;

  if v_name is not null then
    execute format('alter table public.photos drop constraint %I', v_name);
  end if;
end
$$;

alter table public.photos
  drop constraint if exists photos_roll_id_frame_number_key;

alter table public.photos
  add constraint photos_roll_id_frame_number_key
  unique (roll_id, frame_number) deferrable initially immediate;

-- ------------------------------------------------------------- shoot a frame
-- Replacing the old four-argument form outright rather than overloading it:
-- PostgREST resolves by argument name, and leaving both signatures in place
-- would make every call ambiguous.
drop function if exists public.shoot_frame(uuid, text, int, int);

create or replace function public.shoot_frame(
  p_roll_id      uuid,
  p_storage_path text,
  p_width        int default null,
  p_height       int default null,
  p_taken_at     timestamptz default null
)
returns public.photos
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_roll     public.rolls;
  v_photo    public.photos;
  v_uid      uuid := auth.uid();
  v_taken    timestamptz;
  v_mine     int;
  v_next     int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if not public.is_roll_member(p_roll_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;

  -- A phone with a fast clock could otherwise date a frame into next week and
  -- sit permanently at the end of every roll. It cannot have been taken after
  -- it arrived. This only sorts the roll; it never decides admission.
  v_taken := least(coalesce(p_taken_at, now()), now());

  select * into v_roll from public.rolls where id = p_roll_id for update;

  if v_roll.id is null then
    raise exception 'no such roll' using errcode = 'P0002';
  end if;

  -- The only reason to refuse a frame: this shooter has already contributed a
  -- whole roll's worth. Nothing here asks whether the roll is full or finished
  -- — a frame from a phone that spent the weekend out of range is admitted
  -- however long it took to arrive, because its shooter was within their own
  -- budget when they took it and could not have known about anyone else's.
  --
  -- Counted rather than tracked on the membership row: a count is derived from
  -- the photos themselves and so cannot drift out of step with them.
  select count(*) into v_mine
    from public.photos
   where roll_id = p_roll_id and user_id = v_uid;

  if v_mine >= v_roll.max_frames then
    raise exception 'frame budget spent' using errcode = 'P0001';
  end if;

  -- Provisional: the renumber below puts it in its true chronological place.
  -- Taken from the high-water mark rather than photo_count so an overflowing
  -- roll cannot collide with a number already on the strip.
  select coalesce(max(frame_number), 0) + 1 into v_next
    from public.photos where roll_id = p_roll_id;

  insert into public.photos
    (roll_id, user_id, storage_path, frame_number, width, height, taken_at)
  values
    (p_roll_id, v_uid, p_storage_path, v_next, p_width, p_height, v_taken)
  returning * into v_photo;

  -- Order of capture is the roll's true order. `received_at` breaks ties
  -- between two phones whose clocks agree to the millisecond, and `id` breaks
  -- the tie after that so the result is total and stable.
  set constraints photos_roll_id_frame_number_key deferred;

  with ordered as (
    select id, row_number() over (order by taken_at, received_at, id) as rn
      from public.photos
     where roll_id = p_roll_id
  )
  update public.photos p
     set frame_number = o.rn
    from ordered o
   where p.id = o.id
     and p.frame_number <> o.rn;

  -- Re-read: the row returned above may have just been renumbered.
  select * into v_photo from public.photos where id = v_photo.id;

  return v_photo;
end;
$$;

grant execute on function public.shoot_frame(uuid, text, int, int, timestamptz) to authenticated;

-- --------------------------------------------------------- count / finished
-- `photo_count` is now a count of what is on the roll, which may exceed
-- `max_frames`. The status flip still happens the first time it reaches the
-- roll's length and never again, so `finished_at` keeps marking the moment the
-- roll actually filled rather than sliding forward with each late arrival.
-- Nothing gates on that timestamp any more — it is a record, not a door.
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
