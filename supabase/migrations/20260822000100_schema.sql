-- Savour — core schema (PRD §10)
-- Rolls are capped-length shared albums. Photos stay hidden until the roll finishes (§9.2).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

-- Usernames are compared case-insensitively: @Jialong and @jialong are the same person.
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- ------------------------------------------------------------------- rolls
create table public.rolls (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  max_frames      int not null,
  filter          text not null default 'none',
  share_code      text not null unique,
  status          text not null default 'active',
  photo_count     int not null default 0,
  developed_early boolean not null default false,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint name_length     check (char_length(name) between 1 and 40),
  constraint max_frames_set  check (max_frames in (12, 24, 36)),
  constraint status_enum     check (status in ('active', 'finished')),
  constraint count_in_range  check (photo_count >= 0 and photo_count <= max_frames),
  -- A finished roll always has a timestamp; an active one never does.
  constraint finished_shape  check (
    (status = 'finished' and finished_at is not null)
    or (status = 'active' and finished_at is null)
  )
);

create index rolls_owner_idx  on public.rolls (owner_id);
create index rolls_status_idx on public.rolls (status);

-- ------------------------------------------------------------ roll_members
create table public.roll_members (
  roll_id   uuid not null references public.rolls (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (roll_id, user_id),
  constraint role_enum check (role in ('owner', 'member'))
);

create index roll_members_user_idx on public.roll_members (user_id);

-- ------------------------------------------------------------------ photos
create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  roll_id      uuid not null references public.rolls (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  frame_number int not null,
  width        int,
  height       int,
  taken_at     timestamptz not null default now(),
  -- Soft hide (§9.10). The row and its frame_number survive so the sequence never breaks.
  hidden_at    timestamptz,
  hidden_by    uuid references public.profiles (id) on delete set null,
  unique (roll_id, frame_number),
  constraint frame_positive check (frame_number > 0),
  constraint hidden_shape check (
    (hidden_at is null and hidden_by is null)
    or (hidden_at is not null and hidden_by is not null)
  )
);

create index photos_roll_idx on public.photos (roll_id, frame_number);

-- ----------------------------------------------------------------- reports
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      text not null,
  note        text,
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  unique (photo_id, reporter_id),
  constraint reason_enum check (reason in ('nudity', 'violence', 'harassment', 'other')),
  constraint report_status_enum check (status in ('open', 'actioned', 'dismissed'))
);

-- ------------------------------------------------------------------ blocks
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

-- ----------------------------------------------------------- join_attempts
-- Feeds the rate limiter in join_roll_by_code (§9.10).
create table public.join_attempts (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

create index join_attempts_user_idx on public.join_attempts (user_id, attempted_at desc);

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('roll-photos', 'roll-photos', false)
on conflict (id) do nothing;
