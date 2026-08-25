#!/usr/bin/env node
/**
 * Empty Savour's storage buckets.
 *
 * Postgres cascades never reach storage, so wiping `auth.users` leaves every
 * frame and avatar behind as an orphan you still pay for. Supabase also blocks
 * `delete from storage.objects` outright — a `protect_delete()` trigger raises
 * 42501 — so the files have to go through the Storage API, which is what this
 * does.
 *
 * Needs the service-role key: the anon key may only delete its own objects, and
 * only while a roll is still open. Pass it in the environment rather than as an
 * argument, so it does not end up in your shell history:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/empty-buckets.mjs
 *
 * Add --dry-run to list what would go without removing anything.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const BUCKETS = ['roll-photos', 'avatars'];
const PAGE = 100;

const dryRun = process.argv.includes('--dry-run');

/** The URL lives in .env already; only the secret has to be supplied. */
function readEnvUrl() {
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const line = env.split('\n').find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_URL='));
    return line?.split('=')[1]?.trim();
  } catch {
    return undefined;
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? readEnvUrl();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error('No Supabase URL. Set EXPO_PUBLIC_SUPABASE_URL or put it in .env.');
  process.exit(1);
}
if (!key) {
  console.error(
    'No service-role key.\n\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=... node scripts/empty-buckets.mjs\n\n' +
      'Find it under Project Settings → API → service_role. It bypasses RLS, so ' +
      'keep it out of the app and out of git.',
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * Every file under a prefix, depth-first.
 *
 * `list` returns one directory level at a time and marks folders with a null
 * id, so the tree has to be walked rather than read in one call. Frames live at
 * `{rollId}/{uuid}.jpg` and avatars at `{userId}/avatar.jpg`, both one level
 * down, but this recurses anyway so a future layout does not silently leave
 * files behind.
 */
async function walk(bucket, prefix = '') {
  const found = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });

    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) found.push(...(await walk(bucket, path)));
      else found.push(path);
    }

    if (data.length < PAGE) break;
  }

  return found;
}

let total = 0;

for (const bucket of BUCKETS) {
  const paths = await walk(bucket);

  if (paths.length === 0) {
    console.log(`${bucket}: already empty`);
    continue;
  }

  if (dryRun) {
    console.log(`${bucket}: ${paths.length} file(s) would be removed`);
    for (const p of paths.slice(0, 10)) console.log(`    ${p}`);
    if (paths.length > 10) console.log(`    … and ${paths.length - 10} more`);
    continue;
  }

  // Removed in batches: one enormous request is the thing most likely to time
  // out, and a partial failure is easier to read a hundred paths at a time.
  for (let i = 0; i < paths.length; i += PAGE) {
    const batch = paths.slice(i, i + PAGE);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
  }

  total += paths.length;
  console.log(`${bucket}: removed ${paths.length} file(s)`);
}

if (!dryRun) {
  console.log(
    total === 0
      ? '\nNothing to do — both buckets were already empty.'
      : `\n${total} file(s) gone. Now run the auth.users delete in the SQL editor.`,
  );
}
