import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '@/theme';

const RING = 46;
const BEZEL = 4;
const WINDOW = RING - BEZEL * 2;
const ITEM_H = 22;
const TICKS = 36;

interface Props {
  /** Exposures used so far. Counts up, like the real mechanism (PRD §9.7). */
  frame: number;
}

/**
 * A film camera's top-plate frame counter.
 *
 * The neighbouring numbers clipped at the window's edge are what make this read
 * as a turning drum rather than a number in a circle — they are the whole
 * effect, and the cheapest part of it.
 */
export function FrameCounter({ frame }: Props) {
  const offset = useSharedValue(0);
  const previous = useSharedValue(frame);
  // The count arriving from the server is not an exposure being taken. Without
  // this the counter would advance and buzz just for opening the camera.
  const settled = useRef(false);

  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      previous.value = frame;
      return;
    }
    if (frame === previous.value) return;
    previous.value = frame;

    // Advance one frame and stop hard. Not a smooth tween — the step IS the
    // feedback that an exposure was spent.
    offset.value = ITEM_H;
    offset.value = withTiming(0, {
      duration: 130,
      easing: Easing.bezier(0.15, 0.85, 0.25, 1),
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  }, [frame]);

  const reelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        {Array.from({ length: TICKS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.tick,
              {
                transform: [{ rotate: `${(i * 360) / TICKS}deg` }, { translateY: -RING / 2 + 2 }],
              },
            ]}
          />
        ))}

        <View style={styles.window}>
          <Animated.View style={[styles.reel, reelStyle]}>
            <Text style={[styles.digit, styles.adjacent]}>{pad(frame - 1)}</Text>
            <Text style={[styles.digit, styles.current]}>{pad(frame)}</Text>
            <Text style={[styles.digit, styles.adjacent]}>{pad(frame + 1)}</Text>
          </Animated.View>
        </View>
      </View>

      <View style={styles.index} />
    </View>
  );
}

function pad(n: number): string {
  if (n < 0) return '';
  return String(n).padStart(2, '0');
}

const styles = StyleSheet.create({
  wrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Knurling, cut as real geometry rather than painted on as a gradient.
  tick: {
    position: 'absolute',
    width: 1.4,
    height: BEZEL + 1,
    backgroundColor: '#6E6E6E',
  },
  window: {
    width: WINDOW,
    height: WINDOW,
    borderRadius: WINDOW / 2,
    backgroundColor: colors.dialFace,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reel: {
    alignItems: 'center',
  },
  digit: {
    fontFamily: fonts.monoBold,
    color: colors.dialInk,
    height: ITEM_H,
    lineHeight: ITEM_H,
    textAlign: 'center',
  },
  current: {
    fontSize: 17,
  },
  adjacent: {
    fontSize: 9,
    opacity: 0.28,
  },
  index: {
    position: 'absolute',
    top: -1,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.dialIndex,
  },
});
