-- Savour — share codes without pgcrypto.
--
-- `20260825000100` swapped `random()` for `gen_random_bytes()` to get a
-- cryptographic source. The reasoning was right and the function was wrong:
-- `gen_random_bytes` belongs to pgcrypto, which Supabase installs into the
-- `extensions` schema, and `create_roll` runs with `search_path = public`. So
-- the name never resolved.
--
-- Worse, nothing said so. A plpgsql body is only checked for syntax when it is
-- created — names are resolved when it runs — so the migration applied cleanly
-- and every attempt to create a roll failed afterwards with "function
-- gen_random_bytes(integer) does not exist".
--
-- `gen_random_uuid()` needs no extension: it has been core since Postgres 13
-- and draws from the same strong RNG pgcrypto would have used. Sixteen bytes of
-- it is far more than the six this needs.

create or replace function public.generate_share_code()
returns text
language plpgsql
volatile
-- Pinned, so this resolves the same way wherever it is called from.
set search_path = public, pg_catalog
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  bytes bytea;
  i int;
begin
  loop
    candidate := '';

    -- The uuid's own bytes, minus its formatting. Every byte is uniform, and
    -- 32 divides 256 exactly, so masking the low five bits picks a symbol with
    -- no modulo bias to correct for.
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');

    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + (get_byte(bytes, i - 1) & 31), 1);
    end loop;

    exit when not exists (select 1 from public.rolls where share_code = candidate);
  end loop;

  return candidate;
end;
$$;

-- Proves it resolves and returns a well-formed code, at migration time rather
-- than the next time someone opens a roll — which is the check that was missing
-- when this broke.
do $$
declare
  v_code text := public.generate_share_code();
begin
  if v_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    raise exception 'generate_share_code returned %, which is not a share code', v_code;
  end if;
end
$$;
