-- Savour — row level security (PRD §10)
-- Guiding rule: clients may READ what they belong to and WRITE almost nothing.
-- Every state transition goes through a SECURITY DEFINER function instead.

alter table public.profiles      enable row level security;
alter table public.rolls         enable row level security;
alter table public.roll_members  enable row level security;
alter table public.photos        enable row level security;
alter table public.reports       enable row level security;
alter table public.blocks        enable row level security;
alter table public.join_attempts enable row level security;

-- ---------------------------------------------------------------- profiles
-- Readable by any signed-in user: usernames and avatars have to render in the
-- member lists of rolls you share with people you have not otherwise met.
create policy "profiles are readable when signed in"
  on public.profiles for select to authenticated
  using (true);

create policy "users insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------------- rolls
create policy "members read their rolls"
  on public.rolls for select to authenticated
  using (public.is_roll_member(id));

-- No INSERT/UPDATE policy by design: create_roll() and develop_roll_early()
-- are SECURITY DEFINER and bypass RLS. A client that could write `status`
-- could unlock every photo in the roll (§9.2).

-- An owner may discard a roll only while nothing has been shot into it; after
-- the first frame it is partly someone else's object (§14 Q2).
create policy "owner deletes an empty roll"
  on public.rolls for delete to authenticated
  using (owner_id = auth.uid() and photo_count = 0);

-- ------------------------------------------------------------ roll_members
create policy "members see the roster"
  on public.roll_members for select to authenticated
  using (public.is_roll_member(roll_id));

-- Joining is join_roll_by_code() only — a client INSERT here would need SELECT
-- on rolls by share_code, which is the enumeration oracle we are avoiding.

create policy "members may leave"
  on public.roll_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

-- ------------------------------------------------------------------ photos
-- THE rule (§9.2): membership is not enough. Nobody reads a frame — not even
-- the person who shot it — until the roll is developed.
create policy "photos readable only once the roll is developed"
  on public.photos for select to authenticated
  using (
    public.is_roll_member(roll_id)
    and exists (
      select 1 from public.rolls r
      where r.id = photos.roll_id and r.status = 'finished'
    )
  );

-- No INSERT/UPDATE: shoot_frame(), hide_photo() and unhide_photo() own those.

-- ----------------------------------------------------------------- reports
create policy "members report a frame in their roll"
  on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.photos p
      where p.id = reports.photo_id and public.is_roll_member(p.roll_id)
    )
  );

-- Triage happens server-side; the app only ever shows you your own reports.
create policy "reporters read their own reports"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

-- ------------------------------------------------------------------ blocks
-- Scoped entirely to the blocker: a user can never discover who blocked them.
create policy "blocks are private to the blocker"
  on public.blocks for select to authenticated
  using (blocker_id = auth.uid());

create policy "users create their own blocks"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());

create policy "users remove their own blocks"
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ----------------------------------------------------------- join_attempts
-- No policies at all: written and read exclusively by join_roll_by_code().
-- Exposing it would leak how close an attacker is to a lockout.

-- ----------------------------------------------------------------- storage
-- Storage policies must MIRROR the photos policies. If they do not, a signed
-- URL hands out exactly what RLS was protecting (§9.2).

create policy "members upload frames to an active roll"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'roll-photos'
    and name ~ '^[0-9a-f-]{36}/'
    and exists (
      select 1 from public.rolls r
      where r.id = ((storage.foldername(name))[1])::uuid
        and r.status = 'active'
        and public.is_roll_member(r.id)
    )
  );

create policy "members read frames of a developed roll"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'roll-photos'
    and name ~ '^[0-9a-f-]{36}/'
    and exists (
      select 1 from public.rolls r
      where r.id = ((storage.foldername(name))[1])::uuid
        and r.status = 'finished'
        and public.is_roll_member(r.id)
    )
  );

-- Avatars: readable by anyone signed in, writable only under your own uid.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars are readable"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

create policy "users write their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
