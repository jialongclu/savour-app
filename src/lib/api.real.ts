import * as Crypto from 'expo-crypto';

import { bakeFilter } from './filters';
import { drainQueue, enqueueFrame, PermanentFrameError, startQueueSync } from './frameQueue';
import { supabase } from './supabase';
import { MAX_ACTIVE_ROLLS } from './types';
import type { Photo, Profile, Roll, RollMember, RollWithMembers } from './types';

const PHOTO_BUCKET = 'roll-photos';
const AVATAR_BUCKET = 'avatars';

/* ------------------------------------------------------------------ profile */

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .ilike('username', username);

  if (error) throw error;
  return (count ?? 0) === 0;
}

export async function createProfile(input: {
  userId: string;
  username: string;
  avatarUri?: string | null;
}): Promise<Profile> {
  let avatarUrl: string | null = null;

  if (input.avatarUri) {
    try {
      const path = `${input.userId}/avatar.jpg`;
      await uploadLocalFile(AVATAR_BUCKET, path, input.avatarUri, true);
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      avatarUrl = data.publicUrl;
    } catch (e) {
      // The avatar is optional (§7.1a). Letting it fail the whole sign-up would
      // strand someone on the setup screen over a picture they never had to add.
      console.warn('[profile] avatar upload failed, continuing without it', e);
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: input.userId, username: input.username, avatar_url: avatarUrl })
    .select()
    .single();

  if (error) throw describe(error, 'create your profile');
  return data;
}

/**
 * Postgres puts the useful part of a failure in `details`/`hint`, and
 * PostgREST's top-line message alone rarely says which table or policy tripped.
 */
function describe(error: any, action: string): Error {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);
  const e = new Error(`Could not ${action}: ${parts.join(' — ')}`);
  (e as any).code = error?.code;
  return e;
}

/* -------------------------------------------------------------------- rolls */

/** Rolls still being shot into. */
export async function fetchActiveRolls(): Promise<RollWithMembers[]> {
  return fetchRollsByStatus('active');
}

/** Developed rolls — what Home shows. */
export async function fetchFinishedRolls(): Promise<RollWithMembers[]> {
  return fetchRollsByStatus('finished');
}

async function fetchRollsByStatus(status: 'active' | 'finished'): Promise<RollWithMembers[]> {
  // RLS already restricts this to rolls you belong to (§10), so there is no
  // membership filter here — adding one would be redundant, not safer.
  const { data, error } = await supabase
    .from('rolls')
    .select('*, members:roll_members(*, profile:profiles(*))')
    .eq('status', status)
    .order(status === 'finished' ? 'finished_at' : 'created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as RollWithMembers[];
}

export async function fetchRoll(rollId: string): Promise<RollWithMembers | null> {
  const { data, error } = await supabase
    .from('rolls')
    .select('*, members:roll_members(*, profile:profiles(*))')
    .eq('id', rollId)
    .maybeSingle();

  if (error) throw error;
  return data as RollWithMembers | null;
}

const TOO_MANY_ROLLS = `You're only allowed a maximum of ${MAX_ACTIVE_ROLLS} active rolls at once.`;

/** Both the create and join paths spend the same budget, so both can hit it. */
function isRollCapError(message: string): boolean {
  return message.includes('too many active rolls');
}

export async function createRoll(input: {
  name: string;
  maxFrames: number;
  filter?: string;
}): Promise<Roll> {
  const { data, error } = await supabase.rpc('create_roll', {
    p_name: input.name.trim(),
    p_max_frames: input.maxFrames,
    p_filter: input.filter ?? 'none',
  });

  if (error) {
    if (isRollCapError(error.message)) throw new Error(TOO_MANY_ROLLS);
    throw error;
  }
  return data as Roll;
}

export async function joinRollByCode(code: string): Promise<Roll> {
  const { data, error } = await supabase.rpc('join_roll_by_code', {
    p_code: code.trim().toUpperCase(),
  });

  if (error) {
    // The server deliberately returns one message for wrong / finished /
    // blocked, so the client must not try to be more specific than it is.
    if (error.code === 'P0002') throw new Error("That code doesn't match an open roll.");
    if (error.message.includes('too many attempts')) {
      throw new Error('Too many tries. Wait an hour and try again.');
    }
    if (isRollCapError(error.message)) throw new Error(TOO_MANY_ROLLS);
    throw error;
  }
  return data as Roll;
}

/**
 * Leave a roll, and take it with you if you were the last one on it.
 *
 * Deleting the membership row directly used to be enough, but it left an
 * ownerless roll behind when the owner left and an empty one behind when the
 * last member did. `leave_roll()` does the hand-over and the cleanup in one
 * transaction — none of which the client has the rights to do itself.
 */
export async function leaveRoll(rollId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_roll', { p_roll_id: rollId });
  if (error) {
    if (error.code === 'P0002') throw new Error('That roll is no longer yours.');
    throw error;
  }
}

/* ------------------------------------------------------------------- frames */

/**
 * Send one already-developed frame to the server.
 *
 * The file is named with a random id rather than the frame number: the frame
 * number isn't known until `shoot_frame` has ordered the roll, and two people
 * shooting at once would otherwise race for the same filename.
 *
 * `takenAt` is the shutter, not the upload. A frame queued offline may arrive
 * days late, and the server slots it into the roll by this timestamp — so
 * passing the wrong one puts a photograph in the wrong place in the album.
 */
async function sendFrame(input: {
  rollId: string;
  uri: string;
  width?: number | null;
  height?: number | null;
  takenAt: string;
}): Promise<Photo> {
  const path = `${input.rollId}/${Crypto.randomUUID()}.jpg`;

  // Every policy behind this call is written against `auth.uid()`, so without a
  // session the upload comes back 42501 — indistinguishable from being genuinely
  // forbidden, and it would spend one of the frame's few tries on a problem that
  // fixes itself. A drain can fire from a timer at any moment, including before
  // a token that expired offline has been refreshed.
  let { data: session } = await supabase.auth.getSession();

  // One deliberate attempt to renew before giving up. A token that expired
  // while the phone was out of signal cannot be refreshed until it is back, and
  // nothing else in the drain would ever ask again — so the queue sat there
  // holding frames it was perfectly able to send, waiting for a restart to
  // re-read the session from storage.
  if (!session.session) {
    const { data: renewed } = await supabase.auth.refreshSession();
    session = renewed;
  }

  if (!session.session) {
    throw new Error('Waiting for a connection: not signed in yet.');
  }

  try {
    await uploadLocalFile(PHOTO_BUCKET, path, input.uri, false);
  } catch (e: any) {
    throw describe(e, 'upload that frame');
  }

  const { data, error } = await supabase.rpc('shoot_frame', {
    p_roll_id: input.rollId,
    p_storage_path: path,
    p_width: input.width ?? null,
    p_height: input.height ?? null,
    p_taken_at: input.takenAt,
  });

  if (error) {
    // Don't leave an orphan object in the bucket if the insert was rejected.
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);

    // These refuse this frame every time it is offered: the shooter has spent
    // their whole allowance on this roll, or has since left it. Neither is
    // waiting on a better connection.
    //
    // A full roll is no longer among them — a late frame from a phone that was
    // out of range is admitted however long it took to arrive.
    const permanent =
      error.message?.includes('frame budget spent') || error.message?.includes('not a member');

    if (permanent) throw new PermanentFrameError(describe(error, 'record that frame').message);
    throw describe(error, 'record that frame');
  }
  return data as Photo;
}

/**
 * Take a frame.
 *
 * Develops the filter locally — Skia needs no network — writes the result to
 * the durable queue, and only then reports success. The shutter is finished at
 * that point whether or not there is any signal: the upload is the queue's
 * problem from here, and it will keep trying across relaunches.
 *
 * This no longer returns the server's `Photo`, because there may not be a
 * server in reach. Callers that need to know where the roll now stands should
 * read it from the roll itself once the frame has actually landed.
 */
export async function shootFrame(input: {
  rollId: string;
  uri: string;
  width?: number;
  height?: number;
  /** The roll's film stock, baked in here so no caller can forget to. */
  filter?: string;
}): Promise<void> {
  const takenAt = new Date();

  // Before the queue, not after: a frame stored undeveloped would come back
  // from a later drain without the roll's stock on it.
  const baked = await bakeFilter(input.uri, input.filter ?? 'none');

  await enqueueFrame({
    rollId: input.rollId,
    bytes: baked,
    uri: input.uri,
    width: input.width,
    height: input.height,
    takenAt,
  });

  // Never awaited. The shutter's job ends when the frame is safely on disk;
  // what happens to it after that is the queue's business.
  //
  // Awaiting this was the offline bug: with no signal the upload sits on a
  // socket timeout that can run for the best part of a minute, and every one of
  // those seconds was spent with the shutter still disabled, the frame count
  // held back, and a roll that had actually just filled unable to say so.
  flushFrames().catch(() => {});
}

/** Push whatever is queued. Safe to call at any time; it self-serialises. */
export function flushFrames(): Promise<void> {
  return drainQueue((item, uri) =>
    sendFrame({
      rollId: item.rollId,
      uri,
      width: item.width,
      height: item.height,
      takenAt: item.takenAt,
    }).then(() => undefined),
  );
}

/** Wired up once at startup, in the root layout. */
export function startFrameSync() {
  return startQueueSync((item, uri) =>
    sendFrame({
      rollId: item.rollId,
      uri,
      width: item.width,
      height: item.height,
      takenAt: item.takenAt,
    }).then(() => undefined),
  );
}

export async function fetchPhotos(rollId: string): Promise<Photo[]> {
  // Returns nothing at all while the roll is active — that is RLS (§9.2)
  // doing its job, not an error to handle.
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('roll_id', rollId)
    .order('frame_number', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Signed URLs for a developed roll's frames, keyed by storage path. */
export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 60 * 60);

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) map[row.path] = row.signedUrl;
  }
  return map;
}

/* ------------------------------------------------------------------- safety */

export async function hidePhoto(photoId: string): Promise<Photo> {
  const { data, error } = await supabase.rpc('hide_photo', { p_photo_id: photoId });
  if (error) throw error;
  return data as Photo;
}

export async function unhidePhoto(photoId: string): Promise<Photo> {
  const { data, error } = await supabase.rpc('unhide_photo', { p_photo_id: photoId });
  if (error) throw error;
  return data as Photo;
}

export async function reportPhoto(input: {
  photoId: string;
  reporterId: string;
  reason: 'nudity' | 'violence' | 'harassment' | 'other';
  note?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    photo_id: input.photoId,
    reporter_id: input.reporterId,
    reason: input.reason,
    note: input.note ?? null,
  });
  if (error) throw error;
}

/**
 * Destroy this account.
 *
 * Everything that has to happen in one transaction — handing over rolls this
 * person owned, unlinking their frames, removing the auth row — happens in
 * `delete_account()`, because a signed-in client has no rights on the auth
 * schema and should not.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_account');
  if (error) throw describe(error, 'delete your account');
}

/* ------------------------------------------------------------------ helpers */

/**
 * React Native's fetch can read a file:// URI, which avoids pulling the whole
 * image through a base64 string the way FileSystem would.
 */
async function uploadLocalFile(
  bucket: string,
  path: string,
  uri: string,
  upsert: boolean,
): Promise<void> {
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  await uploadBytes(bucket, path, bytes, upsert);
}

async function uploadBytes(
  bucket: string,
  path: string,
  bytes: ArrayBuffer | Uint8Array,
  upsert: boolean,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert,
  });

  if (error) throw error;
}
