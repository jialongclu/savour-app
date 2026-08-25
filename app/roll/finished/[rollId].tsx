import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { DOCKET_REST_AT, LabDocket } from '@/components/LabDocket';
import { Button } from '@/components/ui';
import { fetchPhotos, fetchRoll, signPhotoUrls } from '@/lib/api';
import { filterById } from '@/lib/filters';
import { useQueuedForRoll } from '@/lib/frameQueue';
import { colors, fonts, space } from '@/theme';
import type { RollWithMembers } from '@/lib/types';

/** Frames carried on the wound-back length. Enough travel to read as a run. */
const MAX_FRAMES_ON_STRIP = 8;

const FRAME_H = 132;
/** The rebate between frames — the gap the edge code is printed in. */
const REBATE = 16;
const PITCH = FRAME_H + REBATE;

/**
 * How much of the strip is in view.
 *
 * Just the resting frame and the rebate beneath it. Any taller and the film
 * runs out before the window does, leaving a field of black under the last
 * frame — the strip has nothing below it to show.
 */
const WINDOW_H = FRAME_H + REBATE;

/**
 * How wide the wound-back length is, as a share of the screen.
 *
 * Half. The viewfinder's strip runs edge to edge because you are looking
 * through it; this one is an object being shown to you, and an object needs
 * space around it to read as one.
 */
const STRIP_SHARE = 0.5;

const PERF_PITCH = PITCH / 8;
const PERF_W = 15;

/** The wind itself: fast away, decelerating hard onto a stop. No settle. */
const WIND_MS = 1500;
const WIND_EASING = Easing.bezier(0.12, 0.72, 0.2, 1);

const COPY_DELAY = WIND_MS + 40;
const CTA_DELAY = WIND_MS + 300;

/**
 * How long the wind will wait on the photographs before going anyway.
 *
 * A frame that 404s or stalls never reports back, and the roll being finished
 * is news that cannot be withheld on account of one slow image. The strip is
 * legible without every frame decoded; a screen that never animates is not.
 */
const LOAD_TIMEOUT_MS = 6000;

/**
 * How long the payoff waits for the last frame to reach the server.
 *
 * Past a working upload — a couple of megabytes usually lands well inside this
 * — and short enough that nobody is left staring at a spinner wondering what
 * they are waiting for.
 */
const SETTLE_MS = 4000;

export default function RollFinished() {
  const { rollId } = useLocalSearchParams<{ rollId: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  // Frames this phone has taken but not yet handed over. While there are any,
  // the roll cannot have developed — whatever the server has, it is missing
  // these, so there is nothing complete to show.
  const { count: queuedHere, stalled } = useQueuedForRoll(rollId);

  const { data, isError, refetch } = useQuery({
    queryKey: ['finished-roll', rollId],
    queryFn: async () => {
      const [roll, photos] = await Promise.all([fetchRoll(rollId!), fetchPhotos(rollId!)]);
      // The *end* of the roll, not the start. `fetchPhotos` returns frames in
      // shooting order, so the last of these is the frame that just finished
      // the roll — which is the one the film has to come to rest on.
      const paths = photos
        .filter((p) => !p.hidden_at)
        .slice(-MAX_FRAMES_ON_STRIP)
        .map((p) => p.storage_path);
      const signed = await signPhotoUrls(paths);
      // Carry the path alongside the URL: it is the stable identity for both
      // the cache key and the list key, where the signed URL is not.
      const strip = paths.filter((p) => signed[p]).map((p) => ({ path: p, url: signed[p] }));
      return { roll, strip };
    },
    enabled: !!rollId,
    // Offline this fails immediately and would otherwise sit failed forever;
    // the drain below is what actually revives it.
    retry: 1,
  });

  /**
   * The roll as this phone last knew it.
   *
   * With no connection the query above returns nothing, but the roll itself
   * was in hand a moment ago — the camera was shooting into it — so the docket
   * is built from the cached list rather than from a request that cannot be
   * made.
   */
  const qc = useQueryClient();
  const knownRoll =
    data?.roll ??
    qc
      .getQueryData<RollWithMembers[]>(['active-rolls'])
      ?.find((r) => r.id === rollId) ??
    null;

  const developed = data?.roll?.status === 'finished';

  /**
   * Long enough for a working connection to finish the last frame.
   *
   * Every frame is queued, online or not — the shutter writes to disk and
   * returns while the upload is still in flight — so a frame merely *being* in
   * the queue said nothing, and the docket was shown to everybody. What is
   * needed is evidence that the upload will not land: either a send that came
   * back a transport failure, or enough time passing that it plainly is not
   * coming.
   */
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, []);

  /**
   * The roll filled here, but not everywhere.
   *
   * `stalled` is the honest signal and arrives within a second of the first
   * failed send; `waited` is the backstop for a connection so slow it may as
   * well be absent, and `isError` for a roll that could not be read at all.
   */
  const pending = !developed && queuedHere > 0 && (stalled || isError || waited);

  // The moment the last frame goes up, ask again. Without this the docket would
  // sit there after the sync had already finished.
  const drained = queuedHere === 0;
  useEffect(() => {
    if (drained && !developed) refetch().catch(() => {});
  }, [drained, developed, refetch]);

  // The way out arrives with the note, not before the paper has printed.
  const foot = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      foot.set(1);
      return;
    }
    foot.set(withDelay(DOCKET_REST_AT, withTiming(1, { duration: 420 })));
  }, [reduced, foot]);
  const footStyle = useAnimatedStyle(() => ({ opacity: foot.get() }));

  /**
   * Shooting order, so the film runs to its end and stops on the last exposure.
   *
   * This used to be reversed, which read as a rewind but landed on frame one —
   * the oldest photograph on the roll, shown at the moment you finished it.
   * Running forwards puts the frame you just took in the gate.
   */
  const frames = data?.strip ?? [];

  const travel = Math.max(0, (frames.length - 1) * PITCH);

  /**
   * The film does not move until there is something printed on it.
   *
   * A signed URL is only a string: having one says the frame can be fetched,
   * not that it has been. Winding on the query alone ran the strip past eight
   * empty rectangles and dropped the photographs in afterwards, at rest —
   * exactly backwards, since the travel is what is meant to show them.
   *
   * Load events rather than `Image.prefetch`, which takes no `cacheKey` and so
   * cannot be relied on to fill the cache these frames actually read from.
   */
  const [framesReady, setFramesReady] = useState(false);
  const settled = useRef(0);
  const stripKey = frames.map((f) => f.path).join('|');

  useEffect(() => {
    settled.current = 0;
    setFramesReady(false);

    if (!data?.roll) return;
    // A roll whose frames are all hidden still deserves its moment.
    if (frames.length === 0) {
      setFramesReady(true);
      return;
    }

    const timer = setTimeout(() => setFramesReady(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [stripKey, data?.roll?.id, frames.length]);

  // Errors count as settled: a frame that will never arrive must not hold the
  // wind behind it for the full timeout.
  const onFrameSettled = useCallback(() => {
    settled.current += 1;
    if (settled.current >= frames.length) setFramesReady(true);
  }, [frames.length]);

  const wind = useSharedValue(0);
  const copy = useSharedValue(0);
  const cta = useSharedValue(0);

  useEffect(() => {
    if (!data?.roll || !framesReady) return;

    if (reduced) {
      wind.set(-travel);
      copy.set(1);
      cta.set(1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }

    wind.set(0);
    wind.set(
      withTiming(-travel, { duration: WIND_MS, easing: WIND_EASING }, (done) => {
        'worklet';
        // On the stop, not on mount. The buzz is the mechanism landing; firing
        // it when the data arrives means it goes off before anything has moved.
        if (done) scheduleOnRN(landed);
      }),
    );

    copy.set(withDelay(COPY_DELAY, withTiming(1, { duration: 460 })));
    cta.set(withDelay(CTA_DELAY, withTiming(1, { duration: 420 })));
  }, [data?.roll?.id, travel, reduced, framesReady]);

  const windStyle = useAnimatedStyle(() => ({ transform: [{ translateY: wind.get() }] }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.get(),
    transform: [{ translateY: (1 - copy.get()) * 10 }],
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: cta.get(),
    transform: [{ translateY: (1 - cta.get()) * 10 }],
  }));

  if (pending && knownRoll) {
    const customers = knownRoll.members
      .map((m) => m.profile?.username)
      .filter((n): n is string => !!n);

    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.docketBody}>
          <LabDocket
            title={knownRoll.name}
            maxFrames={knownRoll.max_frames}
            stock={filterById(knownRoll.filter).label.toUpperCase()}
            customers={customers}
            onThisPhone={queuedHere}
            reference={knownRoll.share_code}
          />
        </View>

        <Animated.View style={[styles.docketFoot, footStyle]}>
          <Button
            title="View Active Films"
            variant="ghost"
            onPress={() => router.replace('/film')}
          />
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (!data?.roll) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.onDark} />
      </SafeAreaView>
    );
  }

  const { roll } = data;
  const names = roll.members.map((m) => m.profile?.username).filter((n): n is string => !!n);

  const stripW = Math.round(width * STRIP_SHARE);
  const coreW = stripW - PERF_W * 2;
  const stripH = Math.max(WINDOW_H, frames.length * PITCH);
  // Only as far as the film actually travels past the window.
  const holes = holePositions(travel + WINDOW_H);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/* The window runs to the very top of the screen, but the film inside it
          starts below the notch. The strip appears to carry on off the top edge
          — which is true, it has just wound past — and the only thing under the
          cut-out is bare film edge, never a photograph. */}
      <View style={[styles.window, { height: insets.top + WINDOW_H, width: stripW }]}>
        <Animated.View style={[styles.reel, { top: insets.top, height: stripH }, windStyle]}>
          {frames.map(({ path, url }, i) => (
            <Image
              key={path}
              source={{ uri: url, cacheKey: path }}
              style={[styles.frame, { top: i * PITCH, left: PERF_W, width: coreW }]}
              contentFit="cover"
              onLoad={onFrameSettled}
              onError={onFrameSettled}
            />
          ))}

          {/* Punched edges, riding with the film they are punched in — without
              them travelling too, the strip reads as a photo carousel. */}
          {holes.map((top) => (
            <View key={`l${top}`} style={[styles.hole, { top, left: 4 }]} />
          ))}
          {holes.map((top) => (
            <View key={`r${top}`} style={[styles.hole, { top, right: 4 }]} />
          ))}
        </Animated.View>
      </View>

      <View style={styles.body}>
        <Animated.View style={[styles.copy, copyStyle]}>
          <Text style={styles.label}>
            {roll.developed_early
              ? `DEVELOPED EARLY · ${roll.photo_count} OF ${roll.max_frames}`
              : `${roll.photo_count} OF ${roll.max_frames} · DEVELOPED`}
          </Text>
          <Text style={styles.name}>{roll.name}</Text>
          <Text style={styles.by}>{creditLine(names)}</Text>
        </Animated.View>

        <Animated.View style={ctaStyle}>
          {/* Ghost, not dark: on a black screen the filled variant is a black
              button with a white label, which is the wrong way round here. */}
          <Button
            title="See the roll"
            variant="ghost"
            onPress={() => router.replace(`/album/${roll.id}`)}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

function landed() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Sprocket holes on a fixed pitch, covering the whole distance travelled. */
function holePositions(height: number): number[] {
  const count = Math.ceil(height / PERF_PITCH) + 2;
  return Array.from({ length: count }, (_, i) => i * PERF_PITCH - PITCH);
}

function creditLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `Shot by ${names[0]}.`;
  if (names.length === 2) return `Shot by ${names[0]} and ${names[1]}.`;
  return `Shot by ${names[0]}, ${names[1]} and ${names.length - 2} ${
    names.length - 2 === 1 ? 'other' : 'others'
  }.`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bodyBlack },
  center: { alignItems: 'center', justifyContent: 'center' },

  // The paper hangs from the top of the screen, as it would from a slot.
  docketBody: { flex: 1, paddingTop: space.xxl },
  docketFoot: { paddingHorizontal: space.xl, paddingBottom: space.xxl + space.md },

  window: {
    // Out of the flow: the copy below centres on the screen's own middle rather
    // than on whatever is left under the film.
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.filmEdge,
  },
  reel: { position: 'absolute', left: 0, right: 0 },
  frame: { position: 'absolute', height: FRAME_H, backgroundColor: colors.filmSpent },
  hole: {
    position: 'absolute',
    width: Math.round(PERF_W * 0.52),
    height: Math.round(PERF_PITCH * 0.42),
    borderRadius: 2.5,
    backgroundColor: colors.perf,
  },

  body: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl + space.md,
  },
  copy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Centred on the screen's own axis, not just within this block.
    alignSelf: 'stretch',
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: space.sm,
  },
  name: {
    fontFamily: fonts.serifSemi,
    fontSize: 28,
    color: colors.onDark,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  by: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: space.sm,
  },
});
