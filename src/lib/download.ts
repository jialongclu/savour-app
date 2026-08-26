import { Directory, File, Paths } from 'expo-file-system';
/**
 * The legacy entry, deliberately.
 *
 * In SDK 57 the album and asset functions exported from `expo-media-library`
 * itself are deprecation stubs that log a warning and then *throw* — the real
 * implementations moved to a class API and to this module. Importing from the
 * package root would have compiled cleanly and failed on the first save.
 */
import * as MediaLibrary from 'expo-media-library/legacy';
import piexif from 'piexifjs';
import { useSyncExternalStore } from 'react';

import { fetchPhotos, fetchRoll, signPhotoUrls } from './api';
import type { Photo } from './types';

/**
 * Saving a developed roll into the phone's own library.
 *
 * The frames are already full quality — nothing here re-encodes them. What this
 * does add is the metadata Skia's re-encode threw away: without a capture date
 * in the file, Photos files every frame under the day it was saved, so a roll
 * shot over a fortnight lands as one clump on the day it finished. The dates
 * are in `taken_at`, which is what the roll was ordered by in the first place.
 */

/** Where downloads are assembled before being handed to the library. */
const DIR = 'album-export';

export interface DownloadResult {
  saved: number;
  /** Frames that could not be fetched. The rest are still saved. */
  failed: number;
  /**
   * Whether the saved frames were filed into an album of the roll's name.
   *
   * False means they are in the library but loose in Recents — the grouping
   * calls need a wider permission than saving does, and losing it must not be
   * reported as losing the photographs.
   */
  grouped: boolean;
  /**
   * Frames deliberately hidden, and so deliberately not saved.
   *
   * Counted rather than merely skipped, because the album still shows a tile
   * for each one — someone looking at twelve tiles and told that ten were saved
   * has been given a number that looks like a fault. Hiding a frame is a safety
   * decision, and writing it into the phone's own library would undo it.
   */
  hidden: number;
}

function workspace(): Directory {
  const d = new Directory(Paths.document, DIR);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/**
 * EXIF's own date format: `YYYY:MM:DD HH:MM:SS`, in local time with no zone.
 *
 * Written from the phone's offset rather than UTC, because Photos reads these
 * as wall-clock time — a frame taken at eight in the evening should say eight
 * in the evening, not whatever that was in London.
 */
function exifDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Put the capture date back into a JPEG.
 *
 * piexifjs works on a binary string rather than bytes, which is what the odd
 * `binary` round trip below is for. Failure is swallowed on purpose: a frame
 * that cannot take metadata is still a photograph worth saving, and losing it
 * over a date would be the wrong trade.
 */
function stampDate(file: File, takenAt: string): void {
  try {
    const binary = file.base64Sync();
    const exif = {
      '0th': { [piexif.ImageIFD.DateTime]: exifDate(takenAt) },
      Exif: {
        [piexif.ExifIFD.DateTimeOriginal]: exifDate(takenAt),
        [piexif.ExifIFD.DateTimeDigitized]: exifDate(takenAt),
      },
      GPS: {},
      '1st': {},
      thumbnail: undefined,
    };

    const stamped = piexif.insert(piexif.dump(exif), `data:image/jpeg;base64,${binary}`);
    file.write(stamped.replace(/^data:image\/jpeg;base64,/, ''), { encoding: 'base64' });
  } catch {
    // Saved without a date rather than not saved.
  }
}

/**
 * Download a developed roll into an album named after it.
 *
 * Sequential rather than parallel: a roll is up to thirty-six full-quality
 * frames, and pulling them all at once is how a phone runs out of memory
 * halfway through and saves nothing. One at a time is slower and finishes.
 */
export async function downloadAlbum(
  rollId: string,
  onProgress?: (fraction: number) => void,
): Promise<DownloadResult> {
  /**
   * Checked, never requested.
   *
   * This used to call `requestPermissionsAsync` as a belt-and-braces guard,
   * which was not harmless: where access is already limited or add-only that
   * call raises the system sheet again, so a save that had been agreed to and
   * begun would stop and ask — the photo band already running under the header
   * while iOS asked whether Savour could have the photos at all. Backwards, and
   * exactly the sequence a prompt should never appear in.
   *
   * Asking belongs to the caller, before any of this starts. All that is left
   * here is refusing to work without it.
   */
  // Write-only is the bar to clear, because writing is the whole promise. Full
  // access buys the album grouping on top, and its absence is reported through
  // `grouped` rather than refused here.
  const permission = await MediaLibrary.getPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Savour needs permission to add photos to your library.');
  }

  const [roll, photos] = await Promise.all([fetchRoll(rollId), fetchPhotos(rollId)]);
  const visible = photos.filter((p: Photo) => !p.hidden_at);
  const hidden = photos.length - visible.length;

  if (visible.length === 0) throw new Error('This roll has no frames to save.');

  const signed = await signPhotoUrls(visible.map((p) => p.storage_path));

  const albumName = roll?.name?.trim() || 'Savour';
  const dir = workspace();
  let saved = 0;
  let failed = 0;
  let album: Awaited<ReturnType<typeof MediaLibrary.getAlbumAsync>> | null = null;
  /** False once any frame reached the library but could not be filed. */
  let grouped = true;
  /** Filename stems already claimed in this run — see the naming note below. */
  const used = new Set<string>();

  /**
   * How far along, counting bytes rather than photographs.
   *
   * A roll of full-quality frames is a dozen large downloads, and a bar that
   * only moves when one finishes stands still for seconds at a time and then
   * jumps. `createDownloadTask` reports bytes as they land, so `done` is the
   * frames already filed and `within` is how far into the current one we are.
   */
  let done = 0;
  const report = (within: number) => onProgress?.((done + within) / visible.length);
  report(0);

  for (const photo of visible) {
    const url = signed[photo.storage_path];
    if (!url) {
      failed += 1;
      done += 1;
      report(0);
      continue;
    }

    // Named by frame number, so the library shows them in shooting order even
    // where it sorts by filename rather than by date.
    //
    // Frame numbers are not unique on a roll that was filled without signal:
    // each phone counts on its own (that is the whole point of the offline
    // rule), so two frames can both be number five. Where that happens the
    // second takes a suffix rather than the first's name.
    const stem = `${albumName} ${String(photo.frame_number).padStart(2, '0')}`;
    const name = used.has(stem) ? `${stem} (${photo.id.slice(0, 4)}).jpg` : `${stem}.jpg`;
    used.add(stem);
    const file = new File(dir, name);

    try {
      if (file.exists) file.delete();

      // No `idempotent` here — a download *task* does not take one, and the
      // delete above is what keeps the destination clear.
      const task = File.createDownloadTask(url, file, {
        onProgress: ({ bytesWritten, totalBytes }) => {
          // A server that sends no length reports zero here; leaving the bar
          // where it is beats dividing by it.
          if (totalBytes > 0) report(Math.min(1, bytesWritten / totalBytes));
        },
      });
      await task.downloadAsync();

      stampDate(file, photo.taken_at);

      const asset = await MediaLibrary.createAssetAsync(file.uri);

      /**
       * Counted the moment it is in the library, before any grouping.
       *
       * The promise made to someone tapping Save is that their photographs end
       * up on their phone. An album is how they are filed once they are there —
       * a convenience, and one that needs a broader permission than saving
       * does. Counting after the grouping meant a phone that would not give up
       * that permission reported every saved frame as lost.
       */
      saved += 1;

      try {
        // The first frame makes the album; the rest join it. Creating one per
        // frame would leave thirty-six albums of one photograph each.
        if (!album) {
          // One may already exist from an earlier download, in which case this
          // run joins it rather than making a second album of the same name.
          const existing = await MediaLibrary.getAlbumAsync(albumName);
          if (existing) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], existing, false);
            album = existing;
          } else {
            // `createAlbumAsync` takes the first asset with it, so this frame is
            // already inside and must not be added again.
            album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
          }
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
      } catch (e: any) {
        // The frame is saved either way; only its filing failed.
        grouped = false;
        if (__DEV__) console.warn('[download] album grouping failed:', e?.message ?? e);
      }
    } catch (e: any) {
      failed += 1;
      // Counted for the person, named for whoever has to fix it. A bare tally
      // says two frames did not save and nothing about why — and the reasons
      // here are all different problems: an expired signature, a download that
      // died, a library that refused the file.
      if (__DEV__) {
        console.warn(
          `[download] frame ${photo.frame_number} (${photo.id.slice(0, 8)}) failed: ` +
            (e?.message ?? e),
        );
      }
    } finally {
      // Advanced whatever happened to it. A frame that failed is a frame no
      // longer being waited on, and a bar that stalls on failure is describing
      // work that has stopped.
      done += 1;
      report(0);

      // The library has its own copy now, so the working file is dead weight —
      // and a roll of full-quality frames is a lot of it.
      try {
        if (file.exists) file.delete();
      } catch {
        /* swept next time */
      }
    }
  }

  return { saved, failed, hidden, grouped };
}

/**
 * Rolls currently being saved.
 *
 * Module-level rather than component state, because the whole point of the
 * background save is that it outlives the menu that started it — and often the
 * screen too. A `useState` guard would be torn down on the first navigation and
 * the same roll could then be started again alongside itself, racing two writers
 * into one Photos album.
 */
const inFlight = new Set<string>();

/**
 * How far along each running save is, for anything on screen that wants to say.
 *
 * A store rather than component state, for the same reason the set above is one:
 * the save outlives the menu that started it, and the album underneath is what
 * ends up showing it. Same `useSyncExternalStore` shape as the frame queue.
 */
const progress = new Map<string, number>();
const watchers = new Set<() => void>();

function announce(): void {
  for (const w of watchers) w();
}

function subscribe(fn: () => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

/**
 * How far along this roll's save is, or null when nothing is saving it.
 *
 * Null rather than zero, so a screen can tell "not started" from "just started"
 * without a second flag.
 */
export function useSaveProgress(rollId: string | undefined): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (rollId ? (progress.get(rollId) ?? null) : null),
    () => null,
  );
}

/** Long enough for a full band to be seen before it goes. */
const HOLD_FULL_MS = 900;

/**
 * Where this phone stands on letting Savour into the photo library.
 *
 * - `granted`  — nothing to ask.
 * - `askable`  — never asked, or asked and deferred. The system will prompt.
 * - `blocked`  — refused, and iOS will not prompt again. Only Settings can undo
 *                it, which is exactly why the prompt is worth explaining before
 *                it appears: there is one chance at it per install.
 */
export type PhotoAccess = 'granted' | 'askable' | 'blocked';

/**
 * Asks the system what it already knows. Never raises a prompt.
 *
 * Two questions, because iOS has two answers. Full access is what Savour wants
 * — it is the only grant that can put frames into an album — but add-only is
 * enough to do the thing that actually matters, so somebody who chose it is not
 * sent back to Settings over a filing convenience. Their frames land loose, and
 * the report at the end says so.
 */
export async function photoAccess(): Promise<PhotoAccess> {
  const full = await MediaLibrary.getPermissionsAsync();
  if (full.granted) return 'granted';

  const addOnly = await MediaLibrary.getPermissionsAsync(true);
  if (addOnly.granted) return 'granted';

  return full.canAskAgain ? 'askable' : 'blocked';
}

/** Raises the system prompt. Resolves true if it came back granted. */
export async function askPhotoAccess(): Promise<boolean> {
  const p = await MediaLibrary.requestPermissionsAsync();
  return p.granted;
}

/**
 * Start a save and let go of it.
 *
 * Nothing here is awaited by the caller. A roll of thirty-six full-quality
 * frames takes as long as it takes, and holding a menu open over a percentage
 * meant standing and watching a progress bar to no purpose — the phone can do
 * this while its owner does something else. The result arrives whenever it
 * arrives, via `onDone`.
 *
 * Returns false if this roll is already being saved, so the caller can say so
 * rather than silently starting a second run.
 */
export function saveAlbumInBackground(
  rollId: string,
  handlers: {
    onDone(result: DownloadResult): void;
    onFail(message: string): void;
  },
): boolean {
  if (inFlight.has(rollId)) return false;
  inFlight.add(rollId);
  progress.set(rollId, 0);
  announce();

  downloadAlbum(rollId, (fraction) => {
    // Monotonic. Bytes arrive out of order across a frame boundary often enough
    // that a raw fraction can step backwards, and a bar that retreats reads as
    // something having gone wrong.
    const seen = progress.get(rollId) ?? 0;
    if (fraction <= seen) return;
    progress.set(rollId, Math.min(1, fraction));
    announce();
  })
    .then(handlers.onDone)
    .catch((e: any) => handlers.onFail(e?.message ?? 'Please try again.'))
    .finally(() => {
      inFlight.delete(rollId);
      // Filled, held, then gone. Arriving at the end is the last thing the bar
      // has to say, and snatching it away in the same frame as the alert means
      // nobody sees it get there.
      progress.set(rollId, 1);
      announce();
      setTimeout(() => {
        progress.delete(rollId);
        announce();
      }, HOLD_FULL_MS);
    });

  return true;
}
