import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'savour.intro.seen.v1';

/**
 * Whether the first-launch intro has been shown.
 *
 * Versioned in the key so a future rewrite of the argument can be shown again
 * to people who saw the old one, without a migration.
 */
export type IntroState = 'loading' | 'unseen' | 'seen';

/**
 * One shared answer, not one per caller.
 *
 * Both the router guard and the intro screen ask this question, and they have
 * to get the same answer at the same instant. Held in component state it was
 * two independent copies: the intro screen marked itself seen and moved to
 * sign-in, the guard still believed it was unseen, and its next pass sent the
 * user straight back to the intro.
 */
let cached: IntroState = 'loading';
let reading = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function set(next: IntroState) {
  if (cached === next) return;
  cached = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // The disk is read once, on whichever subscriber arrives first.
  if (!reading) {
    reading = true;
    AsyncStorage.getItem(KEY)
      .then((v) => set(v ? 'seen' : 'unseen'))
      // A storage read failing should never lock someone out of the app, and
      // showing the intro twice is a far smaller cost than never showing it.
      .catch(() => set('unseen'));
  }

  return () => {
    listeners.delete(listener);
  };
}

export function useIntroSeen() {
  const state = useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached,
  );

  const markSeen = useCallback(async () => {
    // Flip in memory first: the flag exists to move the router along, and
    // waiting on the disk write would stall the hand-off to sign-in.
    set('seen');
    await AsyncStorage.setItem(KEY, String(Date.now())).catch(() => {});
  }, []);

  return { state, markSeen };
}

/** Lets the intro be re-read later from Profile, where it answers a question
    people only think to ask weeks in ("why can't I see my photos yet?"). */
export async function resetIntro() {
  set('unseen');
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
