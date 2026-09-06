import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { fetchActiveRolls } from '@/lib/api';
import { useQueuedByRoll } from '@/lib/frameQueue';
import { colors } from '@/theme';

/**
 * `savour://shoot` — the one link worth putting on a button.
 *
 * The iPhone's Action Button cannot open an app screen directly; it runs a
 * Shortcut, and the only thing a Shortcut needs from us is a URL. Pointing it
 * straight at `savour://camera` would work right up until the moment it
 * mattered — pressing a camera button and being shown an empty state is worse
 * than not having the button, and it happens exactly when someone has just
 * finished a roll.
 *
 * So the decision lives here rather than in a Shortcut nobody can edit
 * afterwards: if there is film to shoot, the viewfinder; if there is not, the
 * shelf where a new roll is opened.
 *
 * This screen is never seen for more than an instant and never appears in the
 * back stack — every exit is a `replace`.
 */

/**
 * How long to wait on the roll list before choosing anyway.
 *
 * The list is persisted, so it is usually in hand before this screen paints and
 * this timer never fires. It exists for a cold start with no signal, where the
 * query cannot resolve at all and a spinner would otherwise be the whole
 * feature.
 */
const DECIDE_BY_MS = 2500;

export default function Shoot() {
  const router = useRouter();

  const { data: rolls, isLoading, isError } = useQuery({
    queryKey: ['active-rolls'],
    queryFn: fetchActiveRolls,
  });

  // Frames taken but not yet uploaded still fill the roll they belong to. The
  // server cannot see them, so a roll finished without signal would otherwise
  // read as having room and send someone to a viewfinder with no film in it.
  const queued = useQueuedByRoll();

  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), DECIDE_BY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Nothing known yet and still worth waiting for.
    if (isLoading && !rolls && !isError && !waited) return;

    const shootable = (rolls ?? []).filter(
      (r) => r.photo_count + (queued[r.id] ?? 0) < r.max_frames,
    );

    // Film goes to the camera; no film goes to the shelf. On a cold start with
    // no connection and nothing cached, `rolls` is empty and this lands on the
    // roll list — which is the safe way round, since that screen can explain
    // itself and a viewfinder with no film cannot.
    router.replace(shootable.length > 0 ? '/camera' : '/film');
  }, [rolls, isLoading, isError, waited, queued, router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
});
