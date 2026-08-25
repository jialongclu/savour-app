import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useQueuedFrames } from './frameQueue';
import { supabase } from './supabase';

/**
 * Keeps every screen honest about rolls other people are shooting into.
 *
 * A roll is collaborative, but until now the app only refetched after its own
 * shutter — so a member could sit on "9 / 12" while the others had already
 * filled the roll and were looking at the album. Nothing was corrupt; the
 * server rejects a frame on a developed roll and always did. The screen was
 * simply describing a state that had stopped being true.
 *
 * One subscription covers both halves, because `tg_photos_after_insert` writes
 * both to `rolls`: the count on every frame, and the status flip on the last
 * one.
 *
 * Invalidate rather than patch the cache from the payload. The payload says a
 * row changed, not what the reader is allowed to see of it — memberships,
 * blocks and RLS all shape that, and refetching asks the question properly.
 */
export function useRollSync() {
  const qc = useQueryClient();

  /**
   * A frame leaving the queue is a frame the server now has.
   *
   * Screens show the server's count plus whatever is still queued here, so the
   * moment one lands the queued half drops — and unless the server half is
   * asked again in the same breath, the total visibly goes backwards before it
   * catches up.
   */
  const waiting = useQueuedFrames();
  const before = useRef(waiting);
  useEffect(() => {
    if (waiting < before.current) {
      qc.invalidateQueries({ queryKey: ['active-rolls'] }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['finished-rolls'] }).catch(() => {});
    }
    before.current = waiting;
  }, [waiting, qc]);

  useEffect(() => {
    const channel = supabase
      .channel('roll-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rolls' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string } | null;

          // A roll can move between these two lists in either direction, so
          // both are refreshed whichever way it went.
          qc.invalidateQueries({ queryKey: ['active-rolls'] });
          qc.invalidateQueries({ queryKey: ['finished-rolls'] });
          if (row?.id) qc.invalidateQueries({ queryKey: ['roll', row.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
