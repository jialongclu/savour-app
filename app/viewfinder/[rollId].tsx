import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';

import { loadRoll } from '@/lib/loadedRoll';

/**
 * The viewfinder moved into the Camera tab, which now holds one camera and
 * switches the film in it. This route stays as the way in from everywhere that
 * still points at a specific roll — the share screen's "Start shooting", a
 * notification, an old deep link — and simply loads that roll before handing
 * over.
 */
export default function ViewfinderRedirect() {
  const { rollId } = useLocalSearchParams<{ rollId: string }>();

  // In an effect, not the render body: loadRoll() notifies every subscriber
  // synchronously, and the Camera tab's own useLoadedRoll() can still be
  // mounted alongside this redirect under the headless tabs. Calling it
  // during render updates that other component while this one is still
  // rendering, which is exactly what React's cross-component update rule
  // forbids.
  useEffect(() => {
    if (rollId) loadRoll(rollId);
  }, [rollId]);

  return <Redirect href="/camera" />;
}
