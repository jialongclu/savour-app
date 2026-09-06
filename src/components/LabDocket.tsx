import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, space } from '@/theme';

/** The paper's travel out of the slot. */
const FEED_MS = 1200;
/**
 * Steps, not a smooth slide.
 *
 * A thermal printer advances the paper a line at a time, and that judder is
 * most of what separates paper being driven out of a machine from a panel
 * animating into place. Nineteen across 1200ms is about sixteen a second,
 * near enough the real line rate.
 */
const FEED_STEPS = 19;

/** A beat with the paper hanging still, so the tear is its own event. */
const PAUSE_MS = 300;

/** The teeth forming. They *are* the tear, so this is its whole duration. */
const TEAR_MS = 240;
const STAMP_AT = FEED_MS + PAUSE_MS + 200;
const REST_AT = STAMP_AT + 260;

/** How deep the teeth bite into the paper. */
const TOOTH_DEPTH = 7;
const TEETH = 26;

/**
 * Where the tear falls in the recording.
 *
 * The clip is nine and a bit seconds of a thermal printer, and the paper is
 * torn off near the end of it. Rather than cutting the file, the playhead is
 * dropped in far enough back that the printing runs for exactly as long as the
 * paper is moving on screen — so the tear is heard and seen at once.
 */
const RIP_AT_S = 8.9;
const TEAR_AT_MS = FEED_MS + PAUSE_MS;
const AUDIO_FROM_S = RIP_AT_S - TEAR_AT_MS / 1000;

/** Left running past the tear: the rip has a tail, and cutting it is audible. */
const AUDIO_TAIL_MS = 700;

interface Props {
  title: string;
  /** The roll's own length. What is on it is unknown from here. */
  maxFrames: number;
  stock: string;
  /** Everyone shooting into the roll, by username. */
  customers: string[];
  /** Frames still waiting on this phone. */
  onThisPhone: number;
  /** Printed as the docket number — a real reference, not decoration. */
  reference: string;
}

/**
 * The roll filled, but nothing can be shown yet.
 *
 * A finished screen exists to hand over the photographs, and offline it
 * cannot: this phone's frames are queued and the rest are on other people's.
 * So it hands over the paper slip instead — the thing you get when film is
 * left at a counter, which is honest about being a promise rather than the
 * pictures.
 *
 * The one figure it will not invent is the frame count. Nobody here knows how
 * many are on the roll until the queue drains, so it prints a question mark.
 */
export function LabDocket({
  title,
  maxFrames,
  stock,
  customers,
  onThisPhone,
  reference,
}: Props) {
  const reduced = useReducedMotion();
  const player = useAudioPlayer(require('../../assets/sounds/thermal-printer.mp3'));

  // Measured rather than assumed: the docket's height depends on how many
  // people are on the roll, and the paper has to start exactly that far above
  // the slot to be fully hidden behind it.
  const [paperH, setPaperH] = useState(0);

  const feed = useSharedValue(0);
  const teeth = useSharedValue(0);
  const stamp = useSharedValue(0);
  const rest = useSharedValue(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!paperH) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (reduced) {
      feed.set(1);
      teeth.set(1);
      stamp.set(1);
      rest.set(1);
      return;
    }

    feed.set(0);
    teeth.set(0);
    stamp.set(0);
    rest.set(0);

    feed.set(withTiming(1, { duration: FEED_MS, easing: Easing.steps(FEED_STEPS, true) }));

    // Released with the paper's first step, wound to the point that leaves
    // exactly the animation's length before the tear.
    //
    // The wind and the release are deliberately not chained. `useAudioPlayer`
    // loads asynchronously, and this fires the moment the paper is measured —
    // often before a nine-second clip is ready — so `seekTo` can reject. Chained,
    // that rejection took `play` down with it and the docket printed in silence;
    // now a failed wind only costs the run-up, and the printer is still heard.
    (async () => {
      try {
        await player.seekTo(AUDIO_FROM_S);
      } catch {
        // Not wound back: it starts from wherever it is rather than not at all.
      }
      try {
        player.play();
      } catch (e) {
        // Genuinely unplayable. Worth saying so — this went unnoticed for a
        // while precisely because every failure here was swallowed whole.
        console.warn('[docket] the printer sound did not play', e);
      }
    })();
    timers.current.push(
      setTimeout(() => {
        try {
          player.pause();
        } catch {
          // The screen may already be gone; nothing to stop.
        }
      }, TEAR_AT_MS + AUDIO_TAIL_MS),
    );

    timers.current.push(
      setTimeout(() => {
        // The tear is a physical event, so it lands as one. Rigid rather than
        // heavy: paper gives way sharply, it does not thud.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
        teeth.set(withTiming(1, { duration: TEAR_MS, easing: Easing.out(Easing.cubic) }));
      }, FEED_MS + PAUSE_MS),
    );

    timers.current.push(
      setTimeout(() => stamp.set(withTiming(1, { duration: 220 })), STAMP_AT),
    );
    timers.current.push(
      setTimeout(() => rest.set(withTiming(1, { duration: 420 })), REST_AT),
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [paperH, reduced, feed, teeth, stamp, rest, player]);

  const paperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -paperH * (1 - feed.get()) }],
  }));

  // Scaled from nothing rather than swapped in: at zero height the teeth are a
  // straight edge, so growing them downward *is* the paper coming apart.
  const teethStyle = useAnimatedStyle(() => ({
    opacity: teeth.get() > 0 ? 1 : 0,
    transform: [{ scaleY: teeth.get() }],
  }));

  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.get(),
    transform: [{ scale: 1 + (1 - stamp.get()) * 0.5 }],
  }));

  const restStyle = useAnimatedStyle(() => ({ opacity: rest.get() }));

  const toothPath = useMemo(() => buildTeeth(TEETH, TOOTH_DEPTH), []);

  return (
    <>
      {/* A fixed window the paper travels through. Growing this instead would
          uncover a stationary docket, which reads as a wipe rather than as
          something being printed. */}
      <View style={[styles.slot, paperH ? { height: paperH } : null]}>
        {/* Hidden for the one frame it takes to measure. Until the height is
            known the slot cannot clip it, so it would otherwise appear whole
            and in place before being yanked back above the fold. */}
        <Animated.View
          style={[paperStyle, { opacity: paperH ? 1 : 0 }]}
          onLayout={(e) => setPaperH(e.nativeEvent.layout.height)}
        >
          <View style={styles.docket}>
            <View style={styles.head}>
              <Text style={styles.headText}>Savour Lab</Text>
              <Text style={styles.headText}>№ {reference}</Text>
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.sub}>Received for developing</Text>

            <View style={styles.rule} />

            <Row label="FRAMES">
              <Text style={styles.value}>
                <Text style={styles.unknown}>?</Text> / {maxFrames}
              </Text>
            </Row>
            <Row label="STOCK">
              <Text style={styles.value}>{stock}</Text>
            </Row>
            <Row label="CUSTOMER">
              <View>
                {customers.map((name) => (
                  <Text key={name} style={styles.value}>
                    {name}
                  </Text>
                ))}
              </View>
            </Row>
            <Row label="FRAMES ON THIS PHONE">
              <Text style={styles.value}>{onThisPhone}</Text>
            </Row>

            <Animated.View style={[styles.stampRow, stampStyle]}>
              <Text style={styles.stamp}>AWAITING CONNECTION</Text>
            </Animated.View>
          </View>

          {/* Painted in the page's own colour over the top of the paper, which
              is the only way to cut a shape out of a view in React Native —
              there is no clip-path here. */}
          <Animated.View style={[styles.teeth, teethStyle]} pointerEvents="none">
            {/* `none`, or the default `xMidYMid meet` scales the 100-wide
                viewBox uniformly to the 7pt height — which fits it at its
                natural 100pt width and centres it, tearing a strip out of the
                middle of the docket instead of across the whole of it. */}
            <Svg
              width="100%"
              height={TOOTH_DEPTH}
              viewBox={`0 0 100 ${TOOTH_DEPTH}`}
              preserveAspectRatio="none"
            >
              <Path d={toothPath} fill={colors.bodyBlack} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View style={restStyle}>
        <Text style={styles.note}>
          Your film roll will be available as soon as you&apos;re back online.
        </Text>
      </Animated.View>
    </>
  );
}

/**
 * When the sequence has played out, so a caller's own footer can arrive with
 * the note rather than sitting there through the printing.
 */
export const DOCKET_REST_AT = REST_AT;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

/**
 * The torn edge, in a 100-wide viewBox so it scales to whatever width the
 * docket ends up. Alternating vertices along the bottom, closed across the top.
 */
function buildTeeth(count: number, depth: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= count; i++) {
    const x = ((i / count) * 100).toFixed(2);
    pts.push(`${i === 0 ? 'M' : 'L'}${x},${i % 2 === 0 ? depth : 0}`);
  }
  return `${pts.join(' ')} L100,0 L0,0 Z`;
}

const PAPER_PAD = space.lg;

const styles = StyleSheet.create({
  slot: { overflow: 'hidden', marginHorizontal: space.xl },

  docket: {
    backgroundColor: colors.paper,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  teeth: { position: 'absolute', top: 0, left: 0, right: 0, transformOrigin: 'top' },

  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headText: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#6A6A6A',
  },

  title: {
    fontFamily: fonts.serifSemi,
    fontSize: 22,
    letterSpacing: -0.3,
    color: '#000000',
  },
  sub: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: '#6A6A6A',
    marginTop: 2,
    marginBottom: space.md,
  },

  rule: { height: 1, backgroundColor: '#C9C9C9', marginBottom: space.md },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: '#6A6A6A',
    marginRight: space.md,
  },
  rowValue: { alignItems: 'flex-end' },
  value: {
    fontFamily: fonts.monoBold,
    fontSize: 10.5,
    color: '#000000',
    textAlign: 'right',
  },
  unknown: { color: colors.danger },

  stampRow: { alignItems: 'center', marginTop: space.md },
  stamp: {
    fontFamily: fonts.monoBold,
    fontSize: 9.5,
    letterSpacing: 1.8,
    color: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 5,
    transform: [{ rotate: '-3.5deg' }],
  },

  note: {
    fontFamily: fonts.serif,
    fontSize: 13.5,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: PAPER_PAD,
    paddingHorizontal: space.xl,
  },
});
