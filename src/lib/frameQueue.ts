import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';


/**
 * Frames waiting for signal.
 *
 * A disposable camera's natural habitat is a festival, a hike, a basement — the
 * places without bars. Until now the shutter simply failed there: the upload
 * threw, the film wound back, and the moment was gone. A photograph cannot be
 * re-taken, so the shutter must always succeed and the network must always be
 * someone else's problem.
 *
 * Two stores, because they hold different kinds of thing. The image bytes go to
 * a directory under `Paths.document` — never `Paths.cache`, which the OS is
 * free to empty when the disk runs low, and losing a queued frame that way
 * would be exactly the failure this exists to prevent. The metadata goes to
 * AsyncStorage as one JSON array, small enough to rewrite whole on every change
 * and simpler to keep consistent than a row per frame.
 *
 * Ordering is FIFO and strict: an item that fails stops the drain rather than
 * being skipped, so frames reach the server in the order they were taken and a
 * roll cannot fill out of sequence because one upload was slow.
 */

const INDEX_KEY = 'savour.frameQueue.v1';
const DIR = 'queued-frames';

/** Give up on a frame after this many attempts and surface it to the user. */
const MAX_ATTEMPTS = 8;

/**
 * A refusal that retrying cannot fix — the roll closed before this frame
 * reached it, or the shooter is no longer a member. Retrying eight times over
 * four minutes would only delay telling someone their photograph needs a
 * decision from them.
 */
export class PermanentFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentFrameError';
  }
}

/** Retry cadence while the app is open and something is stuck. */
const RETRY_MS = 30_000;

export interface QueuedFrame {
  id: string;
  rollId: string;
  /** File name inside the queue directory — not a full URI, which moves. */
  file: string;
  width: number | null;
  height: number | null;
  /** When the shutter fired, ISO-8601. The server orders the roll by this. */
  takenAt: string;
  attempts: number;
  /** Last failure, kept for the UI rather than for logic. */
  lastError?: string;
  /**
   * Parked for want of a connection, rather than merely having failed once.
   *
   * The distinction earns its own field because screens act on it. `lastError`
   * is set by every kind of failure, including one transient stumble on a send
   * that succeeds moments later — reading it as "offline" put the offline
   * docket in front of people who were on wifi the whole time. This is set only
   * where the send could not reach the server at all, and cleared the moment
   * one does reach it.
   */
  waiting?: boolean;
}

type Listener = () => void;

let cache: QueuedFrame[] | null = null;
const listeners = new Set<Listener>();

function dir(): Directory {
  const d = new Directory(Paths.document, DIR);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToQueue(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One shared empty array rather than a fresh `[]` per call.
 *
 * `useSyncExternalStore` compares snapshots by identity to decide whether to
 * re-render; handing it a new array every time would report a change on every
 * render and loop forever.
 */
const EMPTY: QueuedFrame[] = [];

/** Synchronous read for render paths. Empty until `loadQueue` has run once. */
export function queueSnapshot(): QueuedFrame[] {
  return cache ?? EMPTY;
}

/**
 * How many frames are still waiting on this phone, for one roll or all of them.
 *
 * This is what the finished screen asks when it has to decide whether it is
 * showing a developed roll or a docket for one that has not left yet.
 */
export function useQueuedFrames(rollId?: string): number {
  const items = useSyncExternalStore(subscribeToQueue, queueSnapshot, queueSnapshot);
  return useMemo(
    () => (rollId ? items.filter((i) => i.rollId === rollId).length : items.length),
    [items, rollId],
  );
}

/**
 * What one roll's queue is doing, not merely how big it is.
 *
 * A frame sitting in the queue proves nothing on its own: every frame passes
 * through it, including on a perfect connection, because the shutter writes to
 * disk and returns long before the upload finishes. `stalled` is the part that
 * carries meaning — a send was attempted and came back a transport failure, so
 * there is genuinely nothing to send to.
 */
export function useQueuedForRoll(rollId?: string): { count: number; stalled: boolean } {
  const items = useSyncExternalStore(subscribeToQueue, queueSnapshot, queueSnapshot);
  return useMemo(() => {
    const mine = rollId ? items.filter((i) => i.rollId === rollId) : items;
    // `waiting`, not `lastError`. The latter is true of any frame that has ever
    // failed for any reason, which includes one that stumbled once and is
    // uploading perfectly well now.
    return { count: mine.length, stalled: mine.some((i) => i.waiting === true) };
  }, [items, rollId]);
}

/**
 * How many frames are waiting, per roll.
 *
 * The server's `photo_count` cannot see this phone's queue, so a roll that was
 * filled without signal still reports itself half shot and still lists itself
 * as active. Screens add this to the server's count to work out what the roll
 * actually holds — which is the only number a person who just shot it would
 * recognise.
 */
export function useQueuedByRoll(): Record<string, number> {
  const items = useSyncExternalStore(subscribeToQueue, queueSnapshot, queueSnapshot);
  return useMemo(() => {
    const by: Record<string, number> = {};
    for (const i of items) by[i.rollId] = (by[i.rollId] ?? 0) + 1;
    return by;
  }, [items]);
}

async function readIndex(): Promise<QueuedFrame[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    cache = raw ? (JSON.parse(raw) as QueuedFrame[]) : [];
  } catch {
    // A corrupt index must not brick the camera. The files are still on disk
    // and orphaned, which `sweepOrphans` will clear.
    cache = [];
  }
  return cache;
}

async function writeIndex(next: QueuedFrame[]) {
  cache = next;
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
  emit();
}

/** Called once at startup so `queueSnapshot` is populated before first render. */
export async function loadQueue(): Promise<QueuedFrame[]> {
  const items = await readIndex();
  emit();
  return items;
}

/**
 * Put a frame in the queue. Returns once it is durably on disk — which is the
 * moment the shutter is allowed to report success.
 */
export async function enqueueFrame(input: {
  rollId: string;
  /** Already developed: the filter is baked before this point, offline. */
  bytes: Uint8Array | null;
  /** Used when no filter was applied and there are no bytes to write. */
  uri: string;
  width?: number;
  height?: number;
  takenAt?: Date;
}): Promise<QueuedFrame> {
  const id = Crypto.randomUUID();
  const name = `${id}.jpg`;
  const target = new File(dir(), name);

  if (input.bytes) {
    target.write(input.bytes);
  } else if (input.uri.startsWith('file://') || input.uri.startsWith('/')) {
    // No filter to bake, so the camera's own file is the frame. Copied rather
    // than referenced: the originals live in the cache directory and will not
    // survive a low-storage sweep.
    await new File(input.uri).copy(target);
  } else {
    // A stand-in frame on a simulator, which has no camera and hands back a
    // remote URL. `File` only addresses the local disk, so pointing it at an
    // https URI throws — and it threw on the Default stock specifically, which
    // bakes to nothing and so is the one path that reaches here.
    await File.downloadFileAsync(input.uri, target, { idempotent: true });
  }

  const item: QueuedFrame = {
    id,
    rollId: input.rollId,
    file: name,
    width: input.width ?? null,
    height: input.height ?? null,
    takenAt: (input.takenAt ?? new Date()).toISOString(),
    attempts: 0,
  };

  await writeIndex([...(await readIndex()), item]);
  return item;
}

async function removeItem(id: string) {
  const items = await readIndex();
  const item = items.find((i) => i.id === id);

  if (item) {
    try {
      const file = new File(dir(), item.file);
      if (file.exists) file.delete();
    } catch {
      // The row leaving the index is what matters; a stray file is swept later.
    }
  }

  await writeIndex(items.filter((i) => i.id !== id));
}

async function recordFailure(id: string, message: string) {
  const items = await readIndex();
  await writeIndex(
    // Cleared: the server answered, so whatever went wrong, it was not the
    // connection.
    items.map((i) =>
      i.id === id ? { ...i, attempts: i.attempts + 1, lastError: message, waiting: false } : i,
    ),
  );
}

/** Straight to the end of its attempts, so it surfaces instead of retrying. */
async function failPermanently(id: string, message: string) {
  const items = await readIndex();
  await writeIndex(
    items.map((i) =>
      i.id === id ? { ...i, attempts: MAX_ATTEMPTS, lastError: message, waiting: false } : i,
    ),
  );
}

/**
 * There being no network is not the frame's fault.
 *
 * A transport failure says nothing about whether this frame can ever be sent,
 * only that it cannot be sent *now* — so it is recorded and the drain stops,
 * but the attempt budget is left alone. Counting these was the bug: a retry
 * every thirty seconds meant a phone spent four minutes out of signal came back
 * with every frame past `MAX_ATTEMPTS` and permanently skipped, and no amount of
 * reconnecting could rescue them.
 */
const TRANSPORT = [
  'network request failed',
  'fetch failed',
  'connection appears to be offline',
  'the internet connection',
  'unable to resolve host',
  'connection abort',
  'timed out',
  'timeout',
  // A token that expired while offline, not yet refreshed. Every policy is
  // written against auth.uid(), so sending now would only earn a 42501.
  'not signed in',
];

function isTransportFailure(e: unknown): boolean {
  const m = String((e as any)?.message ?? e ?? '').toLowerCase();
  return TRANSPORT.some((s) => m.includes(s));
}

/** Note why it is waiting, without spending one of its tries. */
async function noteWaiting(id: string, message: string) {
  const items = await readIndex();
  await writeIndex(
    items.map((i) => (i.id === id ? { ...i, lastError: message, waiting: true } : i)),
  );
}

/**
 * Failures the server has since stopped producing.
 *
 * A frame parked on a 42501 was refused by a storage policy that required the
 * roll to still be active — a rule the server no longer has. Frames stuck
 * behind a fixed policy should not need a person to press Try again for them,
 * so a drain gives those their tries back too. If the refusal turns out to be
 * real the frame will simply exhaust its budget again.
 */
const WAS_SERVER_SIDE = ['42501', 'insufficient_privilege', 'row-level security', 'violates'];

function wasServerSide(message: string | undefined): boolean {
  const m = String(message ?? '').toLowerCase();
  return WAS_SERVER_SIDE.some((s) => m.includes(s));
}

/**
 * Give back the tries that being offline — or a policy since corrected — took.
 *
 * Frames sitting past their budget for either reason were parked by something
 * other than their own condition, so a drain rescues them rather than asking
 * the shooter to intervene over a problem they did not cause.
 */
async function reviveOfflineStuck() {
  const stuck = (i: QueuedFrame) =>
    i.attempts >= MAX_ATTEMPTS && (isTransportFailure(i.lastError) || wasServerSide(i.lastError));

  const items = await readIndex();
  if (!items.some(stuck)) return;

  await writeIndex(
    items.map((i) => (stuck(i) ? { ...i, attempts: 0, lastError: undefined, waiting: false } : i)),
  );
}

let draining = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Send whatever is waiting, oldest first.
 *
 * `send` is injected rather than imported so this module stays free of the API
 * layer — which imports the queue itself, and would otherwise form a cycle.
 */
export async function drainQueue(
  send: (item: QueuedFrame, uri: string) => Promise<void>,
): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    await reviveOfflineStuck();

    for (const item of [...(await readIndex())]) {
      if (item.attempts >= MAX_ATTEMPTS) continue;

      const file = new File(dir(), item.file);
      if (!file.exists) {
        // Nothing to send. Dropping the row is not losing a photograph — the
        // photograph is already gone, and keeping the row would retry forever.
        await removeItem(item.id);
        continue;
      }

      try {
        await send(item, file.uri);
        await removeItem(item.id);
      } catch (e: any) {
        if (e instanceof PermanentFrameError) {
          // Park it and carry on: the frames behind it may belong to a
          // different roll that is still perfectly happy to take them.
          await failPermanently(item.id, e.message);
          continue;
        }

        if (isTransportFailure(e)) {
          // No signal. Nothing behind this frame will fare any better, so stop
          // — but without spending a try on a problem that is not this frame's.
          await noteWaiting(item.id, 'Waiting for a connection.');
          break;
        }

        await recordFailure(item.id, e?.message ?? 'Upload failed');
        // Stop at the first transient failure rather than working down the
        // list: it is almost always the network, and the roll's order depends
        // on frames arriving in sequence.
        break;
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Frames that will never send without help — either the roll refused them, or
 * they failed too many times.
 */
export function stuckFrames(): QueuedFrame[] {
  return queueSnapshot().filter((i) => i.attempts >= MAX_ATTEMPTS);
}

/** The same list, for a screen that has to show someone their frames are held. */
export function useStuckFrames(): QueuedFrame[] {
  const items = useSyncExternalStore(subscribeToQueue, queueSnapshot, queueSnapshot);
  return useMemo(() => items.filter((i) => i.attempts >= MAX_ATTEMPTS), [items]);
}

/**
 * Put a spent frame back in the run.
 *
 * Worth offering even for the refusals that cannot change: the roll a frame was
 * turned away from might be one the shooter has since rejoined, and a person
 * told their photograph is stuck will want to try before they will agree to
 * lose it.
 */
export async function retryStuckFrames() {
  const items = await readIndex();
  await writeIndex(
    items.map((i) =>
      i.attempts >= MAX_ATTEMPTS ? { ...i, attempts: 0, lastError: undefined, waiting: false } : i,
    ),
  );
}

/** Deletes the photograph. Only ever on an explicit instruction to. */
export async function discardFrame(id: string) {
  await removeItem(id);
}

export async function discardStuckFrames() {
  for (const item of stuckFrames()) await removeItem(item.id);
}

/**
 * Files with no row pointing at them, left by a crash between `write` and
 * `writeIndex`. Cheap to run at startup and it keeps the directory from growing
 * without bound.
 */
export async function sweepOrphans() {
  const known = new Set((await readIndex()).map((i) => i.file));
  try {
    for (const entry of dir().list()) {
      const name = entry.uri.split('/').pop();
      if (entry instanceof File && name && !known.has(name)) entry.delete();
    }
  } catch {
    // Best effort — a failed sweep is not worth surfacing.
  }
}

/**
 * Retry whenever the app comes back to the foreground, and on a slow timer
 * while it is open.
 *
 * Deliberately not NetInfo: adding a native module would force a rebuild, and
 * these two triggers cover the real case. Someone who walks back into signal
 * has almost always locked their phone and come back to it.
 */
export function startQueueSync(send: (item: QueuedFrame, uri: string) => Promise<void>) {
  const run = () => {
    drainQueue(send).catch(() => {});
  };

  loadQueue().then(run).catch(() => {});
  sweepOrphans().catch(() => {});

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });

  timer = setInterval(run, RETRY_MS);

  return () => {
    sub.remove();
    if (timer) clearInterval(timer);
    timer = null;
  };
}
