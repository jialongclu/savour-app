import { useQuery } from '@tanstack/react-query';

import { fetchPhotos, fetchRoll, signPhotoUrls } from './api';
import type { Photo, Profile, RollWithMembers } from './types';

export interface Frame extends Photo {
  url: string | null;
  shooter: Profile | undefined;
}

export interface Album {
  roll: RollWithMembers | null;
  frames: Frame[];
}

/** How long Supabase signs a photo URL for (see `signPhotoUrls`). */
const SIGNED_URL_TTL = 60 * 60 * 1000;

/**
 * Hold a developed album for most of the signing window, with enough headroom
 * that a slow open near the boundary can't hand out a URL that expires while
 * it is on screen.
 */
const DEVELOPED_STALE_TIME = SIGNED_URL_TTL * 0.75;

/**
 * Shared by the album grid and the full-size viewer so they read the same
 * cache entry — opening a photo costs no extra request, and hiding one from
 * either screen updates both.
 */
export function useAlbum(rollId: string | undefined) {
  return useQuery({
    queryKey: ['album', rollId],
    enabled: !!rollId,

    // A developed roll is finished: its frames are fixed and no one can add
    // to it, so re-reading it on every open is wasted. The one part that does
    // go out of date is the signed URL, which is why this is held just under
    // the signing window rather than forever. Hiding or reporting a frame
    // invalidates this key explicitly, so staleness never hides those.
    staleTime: (query) =>
      query.state.data?.roll?.status === 'finished' ? DEVELOPED_STALE_TIME : 30_000,

    // Without this the entry is dropped a few minutes after the last screen
    // watching it unmounts, so backing out of an album and opening it again
    // refetched from scratch no matter how fresh the data still was.
    gcTime: DEVELOPED_STALE_TIME,

    queryFn: async (): Promise<Album> => {
      const [roll, photos] = await Promise.all([fetchRoll(rollId!), fetchPhotos(rollId!)]);

      const visible = photos.filter((p) => !p.hidden_at);
      const signed = await signPhotoUrls(visible.map((p) => p.storage_path));
      const byUser = new Map(roll?.members.map((m) => [m.user_id, m.profile]) ?? []);

      return {
        roll,
        frames: photos.map((p) => ({
          ...p,
          url: p.hidden_at ? null : (signed[p.storage_path] ?? null),
          // Null once the shooter has deleted their account. The frame stays
          // on the roll; it just stops carrying a name, and the album drops the
          // avatar rather than the photograph.
          shooter: p.user_id ? (byUser.get(p.user_id) ?? undefined) : undefined,
        })),
      };
    },
  });
}

/** Frames keep the shape they were shot in; never squared off (§7.5). */
export function aspectOf(frame: Pick<Frame, 'width' | 'height'>): number {
  if (frame.width && frame.height && frame.height > 0) return frame.width / frame.height;
  return 3 / 4;
}
