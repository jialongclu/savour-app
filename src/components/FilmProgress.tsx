import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

/**
 * A save in progress, as film going through a camera.
 *
 * Two motions doing two jobs, which is what makes this readable where a plain
 * advancing strip was not. The sprockets travelling say work is happening; the
 * band's own width says how much of it is done. A film strip alone can only
 * ever report the first of those, and on a roll of thirty-six full-quality
 * frames the second is the one people actually want.
 *
 * Both run left to right, the direction film is pulled across the gate — and
 * the direction a progress bar fills, so the two agree rather than fighting.
 * At the end the band spans the screen: the strip complete, edge to edge.
 */

/** Sprocket, gap, and the pitch they repeat on. */
const PERF_W = 7;
const PERF_H = 8;
const PERF_GAP = 7;
const PITCH = PERF_W + PERF_GAP;

/** One sprocket's worth of travel. Roughly the wind of a real advance lever. */
const ADVANCE_MS = 620;

/** How quickly the band catches up to a new figure. */
const GROW_MS = 280;
const GROW_EASE = Easing.bezier(0.25, 0.9, 0.3, 1);

interface Props {
  /** 0 to 1, or null when nothing is saving. */
  progress: number | null;
}

export function FilmProgress({ progress }: Props) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();

  const grown = useSharedValue(0);
  const travel = useSharedValue(0);

  useEffect(() => {
    if (progress === null) return;
    grown.set(withTiming(progress, { duration: GROW_MS, easing: GROW_EASE }));
  }, [progress, grown]);

  useEffect(() => {
    if (progress === null || reduced) return;
    travel.set(0);
    travel.set(
      // Linear and seamless: the row is drawn one pitch wider than it needs to
      // be and shifted by exactly one pitch, so the loop point is invisible.
      withRepeat(withTiming(PITCH, { duration: ADVANCE_MS, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(travel);
  }, [progress === null, reduced, travel]);

  const bandStyle = useAnimatedStyle(() => ({ width: grown.get() * width }));
  const perfStyle = useAnimatedStyle(() => ({ transform: [{ translateX: travel.get() }] }));

  if (progress === null) return null;

  // Enough to cover the full screen even when the band is short, because the
  // band grows and the row inside it must never run out of sprockets.
  const count = Math.ceil(width / PITCH) + 2;

  return (
    <View style={styles.track} pointerEvents="none">
      <Animated.View style={[styles.band, bandStyle]}>
        <Animated.View style={[styles.perfs, perfStyle]}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={styles.perf} />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full width and clipped, so the band grows into it rather than pushing the
  // grid below it around.
  track: {
    height: 16,
    alignSelf: 'stretch',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  band: {
    height: '100%',
    backgroundColor: colors.filmEdge,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  // Started one pitch to the left, so the first sprocket travels in from
  // outside the band rather than appearing at its edge.
  perfs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PERF_GAP,
    marginLeft: -PITCH,
  },
  perf: {
    width: PERF_W,
    height: PERF_H,
    borderRadius: 1.5,
    backgroundColor: colors.perf,
  },
});
