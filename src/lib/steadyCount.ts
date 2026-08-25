import { useRef } from 'react';

/**
 * Frame counts that only ever climb.
 *
 * What a roll holds is shown as the server's tally plus whatever is still
 * queued on this phone, and those two move at different moments: the instant a
 * frame uploads it leaves the queue, but the server's count does not rise until
 * the refetch that follows lands. For that round trip the total is one lower
 * than it was, so draining a queue made the edge print step backwards and
 * forwards — once per frame, each dip animated over its own 260ms.
 *
 * Nothing about a roll ever loses a frame: hiding one is soft and leaves
 * `photo_count` alone, and there is no delete. So the highest figure seen is
 * always the true one, and holding it is enough to make the gap invisible
 * without waiting on the network or coordinating the two sources.
 *
 * A ref rather than state: this derives a value during render and must not
 * cause another one. Writing to it here is idempotent — the same input always
 * produces the same output — so repeated renders agree.
 */
export function useSteadyCounts(counts: Record<string, number>): Record<string, number> {
  const highest = useRef<Record<string, number>>({});

  const steady: Record<string, number> = {};
  for (const id of Object.keys(counts)) {
    const best = Math.max(highest.current[id] ?? 0, counts[id]);
    highest.current[id] = best;
    steady[id] = best;
  }

  return steady;
}
