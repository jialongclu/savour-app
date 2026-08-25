-- Savour — lower the concurrent active roll cap from 5 to 3.
--
-- `max_active_rolls()` is the only place the limit lives: create_roll() and
-- join_roll_by_code() both read it, so redefining the function here moves both
-- paths at once and no other object needs touching. Nothing indexes or
-- materialises on it, so replacing an immutable function is safe.
--
-- Why 3 rather than the original 5: PRD §14 Q4 justified the cap as cheap
-- insurance against automated roll-spam, which is the weaker reason — almost
-- any number satisfies it. This one is set from the product's premise instead.
-- A camera holds one roll, and the Roll Finished screen is the payoff (§7.5a);
-- the more rolls a person runs at once, the more often that moment fires and
-- the less it lands.

create or replace function public.max_active_rolls() returns int
language sql immutable as $$ select 3 $$;
