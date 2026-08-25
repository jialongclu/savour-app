import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

import { colors, fonts, space } from '@/theme';

interface Props {
  /** Frames already shot. */
  exposed: number;
  /** Length of the roll. */
  total: number;
}

/** Every sixth frame is struck long and numbered, as on real 35mm stock. */
const MAJOR_EVERY = 6;

/** Tallest a tick can be; every other height is a fraction of it. */
const TICK_MAX = 20;

/** Space between two bars. Everything left over in the slot is the bar. */
const GAP = 2;

const HEIGHTS = {
  minor: 6,
  major: 11,
  minorShot: 14,
  majorShot: TICK_MAX,
};

/** Unexposed ticks are the same ink, held back — never a second colour. */
const DIM = 0.22;

/** Strong ease-out: the mark lands, it doesn't drift into place. */
const EASE = cubicBezier(0.23, 1, 0.32, 1);
const DURATION = 260;

/**
 * How much of the card a roll's edge print occupies. A short roll is a short
 * piece of film — stretching twelve frames across the full width would give
 * them the spacing of a 36 and lose the one thing the strip says at a glance,
 * which is how long the roll is. Widths are deliberately not proportional to
 * frame count: a 12 at a true third would read as a stub.
 */
const WIDTH_BY_FRAMES: Record<number, number> = { 12: 40, 24: 70, 36: 100 };

function widthFor(total: number): `${number}%` {
  const pct = WIDTH_BY_FRAMES[total] ?? Math.min(100, Math.max(40, (total / 36) * 100));
  return `${pct}%`;
}

/**
 * The roll's progress drawn as the frame numbers printed along the edge of a
 * strip of 35mm film. Each exposure strikes its tick to full black; the frames
 * still to come stay faint, so the roll reads as something being used up
 * rather than a bar being filled.
 *
 * Nothing here shows what was photographed. Savour's premise is that the roll
 * is unseen until it develops, and the RLS policy enforces it — a photo row
 * isn't readable and a storage URL isn't signable until the roll is finished.
 */
export function EdgePrint({ exposed, total }: Props) {
  const reduced = useReducedMotion();

  const shot = Math.max(0, Math.min(exposed, total));
  const marks = Math.max(0, Math.floor(total / MAJOR_EVERY));

  const duration = reduced ? 0 : DURATION;

  return (
    <View style={[styles.wrap, { width: widthFor(total) }]}>
      <View style={styles.ticks}>
        {Array.from({ length: total }, (_, i) => {
          const isMajor = (i + 1) % MAJOR_EVERY === 0;
          const isShot = i < shot;
          const height = isShot
            ? isMajor
              ? HEIGHTS.majorShot
              : HEIGHTS.minorShot
            : isMajor
              ? HEIGHTS.major
              : HEIGHTS.minor;

          return (
            <View key={i} style={styles.tickSlot}>
              <Animated.View
                style={[
                  styles.tick,
                  {
                    opacity: isShot ? 1 : DIM,
                    transform: [{ scaleY: height / TICK_MAX }],
                    // Opacity and transform are free to animate — no layout
                    // pass, no sibling repaint. Animating each tick's height
                    // instead would re-run Yoga across the whole row every
                    // frame, 36 ticks at a time.
                    transitionProperty: ['opacity', 'transform'],
                    transitionDuration: duration,
                    transitionTimingFunction: EASE,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.numbers}>
        {Array.from({ length: marks }, (_, i) => {
          const at = (i + 1) * MAJOR_EVERY;
          const reached = at <= shot;
          return (
            <Animated.Text
              key={at}
              style={[
                styles.number,
                reached && styles.numberOn,
                {
                  opacity: reached ? 1 : DIM,
                  transitionProperty: 'opacity',
                  transitionDuration: duration,
                  transitionTimingFunction: EASE,
                },
              ]}
            >
              {String(at).padStart(2, '0')}
            </Animated.Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The roll name sits directly above; a close gap reads as a compact card
  // rather than losing the strip as a separate element from the title.
  wrap: { marginTop: space.sm, marginBottom: 0 },

  ticks: { height: TICK_MAX, flexDirection: 'row', alignItems: 'flex-end' },
  /** Stretch rather than centre a fixed width, so the bar is as thick as its
      slot allows and stays that thickness at 12, 24 or 36 frames. */
  tickSlot: { flex: 1, alignItems: 'stretch' },
  tick: {
    // No fixed width: the margin is the gap, and the bar takes the rest.
    marginHorizontal: GAP / 2,
    height: TICK_MAX,
    borderRadius: 1,
    backgroundColor: colors.ink,
    // Scaling from the baseline, so a tick grows upward like a struck mark
    // rather than expanding from its middle.
    transformOrigin: 'bottom',
  },

  numbers: { flexDirection: 'row', marginTop: 5 },
  number: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.4,
    color: colors.ink,
  },
  numberOn: { fontFamily: fonts.monoBold },
});
