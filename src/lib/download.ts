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
export async function downloadAlbum(rollId: string): Promise<DownloadResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Savour needs permission to add photos to your library.');
  }

  const [roll, photos] = await Promise.all([fetchRoll(rollId), fetchPhotos(rollId)]);
  const visible = photos.filter((p: Photo) => !p.hidden_at);

  if (visible.length === 0) throw new Error('This roll has no frames to save.');

  const signed = await signPhotoUrls(visible.map((p) => p.storage_path));

  const albumName = roll?.name?.trim() || 'Savour';
  const dir = workspace();
  let saved = 0;
  let failed = 0;
  let album: Awaited<ReturnType<typeof MediaLibrary.getAlbumAsync>> | null = null;

  for (const photo of visible) {
    const url = signed[photo.storage_path];
    if (!url) {
      failed += 1;
      continue;
    }

    // Named by frame number, so the library shows them in shooting order even
    // where it sorts by filename rather than by date.
    const name = `${albumName} ${String(photo.frame_number).padStart(2, '0')}.jpg`;
    const file = new File(dir, name);

    try {
      if (file.exists) file.delete();
      await File.downloadFileAsync(url, file, { idempotent: true });

      stampDate(file, photo.taken_at);

      const asset = await MediaLibrary.createAssetAsync(file.uri);

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

      saved += 1;
    } catch {
      failed += 1;
    } finally {
      // The library has its own copy now, so the working file is dead weight —
      // and a roll of full-quality frames is a lot of it.
      try {
        if (file.exists) file.delete();
      } catch {
        /* swept next time */
      }
    }
  }

  return { saved, failed };
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

  downloadAlbum(rollId)
    .then(handlers.onDone)
    .catch((e: any) => handlers.onFail(e?.message ?? 'Please try again.'))
    .finally(() => inFlight.delete(rollId));

  return true;
}
