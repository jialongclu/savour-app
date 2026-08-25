import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which roll is in the camera.
 *
 * The Camera tab is a viewfinder now rather than a list, so something has to
 * say what is loaded before the screen is touched. The Film tab writes here
 * when you pick a roll; the camera reads it and falls back to the first active
 * roll when the id is stale or unset.
 *
 * Shared through a module store rather than component state for the same reason
 * the intro flag is: two screens have to agree about it in the same render, and
 * one of them is not a parent of the other.
 *
 * Deliberately not persisted. Which roll you last pointed the camera at is
 * worth remembering for as long as the app is open and no longer than that.
 */
let loaded: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLoadedRoll() {
  const rollId = useSyncExternalStore(
    subscribe,
    () => loaded,
    () => loaded,
  );

  const load = useCallback((id: string | null) => {
    if (loaded === id) return;
    loaded = id;
    for (const listener of listeners) listener();
  }, []);

  return { rollId, load };
}

/** For callers outside React — the share screen's "Start shooting", say. */
export function loadRoll(id: string | null) {
  if (loaded === id) return;
  loaded = id;
  for (const listener of listeners) listener();
}
