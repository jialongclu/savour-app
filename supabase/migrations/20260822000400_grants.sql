-- Savour — table privileges.
--
-- RLS decides WHICH ROWS a role may touch, but it only ever narrows what a
-- GRANT already allows. Without these, PostgREST fails with
-- "permission denied for table rolls" before any policy is consulted.
--
-- Granted per table to match the policies in 20260822000300_rls.sql exactly:
-- anything the client has no policy for gets no privilege either, so the two
-- layers cannot drift into disagreeing.

grant usage on schema public to anon, authenticated;

-- profiles: read anyone, write only your own row (RLS enforces "own").
grant select, insert, update on public.profiles to authenticated;

-- rolls: readable by members; deletable by the owner while still empty.
-- No insert/update — create_roll() and develop_roll_early() are the only
-- writers, and they run as owner (§9.2, §9.9).
grant select, delete on public.rolls to authenticated;

-- roll_members: read the roster, and leave. Joining goes through
-- join_roll_by_code() so that a client never needs insert here (§9.10).
grant select, delete on public.roll_members to authenticated;

-- photos: read only, and only once the roll is developed. Writes go through
-- shoot_frame(), hide_photo() and unhide_photo().
grant select on public.photos to authenticated;

grant select, insert on public.reports to authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- join_attempts is deliberately ungranted: it is written and read only by
-- join_roll_by_code(), and exposing it would leak how close a caller is to
-- being rate-limited.

-- Callers still need EXECUTE even on SECURITY DEFINER functions.
grant execute on function public.create_roll(text, int, text) to authenticated;
grant execute on function public.join_roll_by_code(text) to authenticated;
grant execute on function public.shoot_frame(uuid, text, int, int) to authenticated;
grant execute on function public.develop_roll_early(uuid) to authenticated;
grant execute on function public.hide_photo(uuid) to authenticated;
grant execute on function public.unhide_photo(uuid) to authenticated;
grant execute on function public.is_roll_member(uuid) to authenticated;
grant execute on function public.is_roll_owner(uuid) to authenticated;

-- Keep future tables in this schema from repeating the problem.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
