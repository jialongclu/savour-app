import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { DOCKET_REST_AT, LabDocket } from '@/components/LabDocket';
import { Button } from '@/components/ui';
import { fetchRoll } from '@/lib/api';
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
 * How much film is hanging from the top when the wind stops.
 *
 * One whole frame and the rebate under it — expressed that way rather than as a
 * number, because the number is not the point: the point is that the cut lands
 * on a boundary the film actually has. Since frames repeat on `PITCH` and the
 * strip comes to rest with its bottom edge exactly here, the last frame fills
 * 0–132 and its rebate closes the tail at 132–148. Nothing is sliced through.
 *
 * It was briefly 64, which cut mid-frame. That is shorter and lighter on a
 * paper-white page, and it read as an offcut: a black band ending wherever it
 * happened to end. A frame with its rebate reads as film.
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

/**
 * The wind itself: fast away, decelerating hard onto a stop. No settle.
 *
 * Three seconds. Long for an interface and right for this one — it is the only
 * moment in the app where a roll is handed over, and hurrying it would make the
 * thing the whole app is built towards the briefest event in it.
 */
const WIND_MS = 3000;
const WIND_EASING = Easing.bezier(0.12, 0.72, 0.2, 1);

const COPY_DELAY = WIND_MS + 40;
const CTA_DELAY = WIND_MS + 300;

/**
 * How long before the waiting screen offers a way out.
 *
 * Not a verdict on the connection — nothing here infers one — just the point at
 * which a door is more use than none. Long enough that a big last frame going
 * up over a slow link is never interrupted by it.
 */
const GIVE_UP_MS = 15000;

/**
 * How long this screen looks before it commits to being one thing.
 *
 * A roll that fills without signal cannot announce that instantly — the first
 * send has to fail before anything knows. A second is long enough for that
 * failure to arrive and short enough to read as the shutter's own pause, and
 * spending it once is far better than starting the celebration and taking it
 * away again a beat later.
 *
 * Nothing here is waiting on the network to *succeed*. The film comes off this
 * phone's own disk; this is only the question of which screen is the honest one.
 */
const GRACE_MS = 1000;

export default function RollFinished() {
  const { rollId } = useLocalSearchParams<{ rollId: string }>();
  const router = useRouter();
  const { width, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();

  // Frames this phone has taken but not yet handed over. While there are any,
  // the roll cannot have developed — whatever the server has, it is missing
  // these, so there is nothing complete to show.
  const { count: queuedHere, stalled } = useQueuedForRoll(rollId);

  /**
   * The roll, and only the roll.
   *
   * Nothing here fetches photographs any more. The strip is bare film, so the
   * one thing the server is still asked is whether the roll has developed —
   * which decides the way in to the album, and nothing about the animation.
   */
  const { data, isError, refetch } = useQuery({
    queryKey: ['finished-roll', rollId],
    queryFn: async () => ({ roll: await fetchRoll(rollId!) }),
    enabled: !!rollId,
    // Offline this fails immediately and would otherwise sit failed forever;
    // the drain below is what actually revives it.
    retry: 1,
    /**
     * Asked again until the roll is actually finished.
     *
     * Arriving here is the last shutter press, not the last upload — the frame
     * is still going up as the screen mounts, and until the server has it the
     * roll's status is unchanged and every photograph it returns is hidden.
     * One refetch on the queue draining was not enough on its own: it fires
     * when this phone is done, which for a shared roll is not the same moment
     * the roll fills. Polling stops the instant the status flips.
     */
    refetchInterval: (q) => (q.state.data?.roll?.status === 'finished' ? false : 1500),
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
   * A way off this screen, once waiting has stopped looking temporary.
   *
   * Only a button, and only reachable now on a roll with no cached film to run.
   * It deliberately does not change what the screen *claims* is happening:
   * elapsed time cannot tell a dead connection from a slow one, and every
   * attempt to infer one from the other put the offline docket in front of
   * somebody who was online the whole time.
   */
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, []);

  /** The grace has elapsed and the screen may now commit to being the film. */
  const [graced, setGraced] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraced(true), GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  /**
   * The roll filled here, but not everywhere.
   *
   * Evidence only — never elapsed time. `stalled` is what the frame queue
   * reports after a send comes back a transport failure, which happens within a
   * second of there being no connection; `isError` is the roll itself failing
   * to load. Both mean something actually went wrong. A timer means only that
   * an upload is taking a while, which online is ordinary, and reading it as
   * absence is what kept showing the offline docket to people on wifi.
   */
  const stranded = !developed && queuedHere > 0 && (stalled || isError);

  /**
   * Which screen this is, decided once and then left alone.
   *
   * The film waits on nothing at all now — it is drawn, not fetched — so the
   * only question left is whether the frames are going anywhere. That question
   * gets one second: evidence of a failed send inside it means the docket, and
   * silence means the roll is going up fine and the film runs.
   *
   * Committed rather than derived, because a screen that keeps re-deciding is
   * how the celebration ended up being replaced by a docket a beat after it
   * started, and how the docket ended up in front of people on wifi.
   */
  const [screen, setScreen] = useState<'deciding' | 'film' | 'docket'>('deciding');
  useEffect(() => {
    if (screen !== 'deciding') return;
    if (stranded && knownRoll) setScreen('docket');
    else if (graced && knownRoll) setScreen('film');
  }, [screen, stranded, graced, knownRoll]);

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
   * How much film is on the spool.
   *
   * Drawn from the roll's own length rather than from a list of photographs,
   * capped at what the window can travel past in one wind. Nothing here needs
   * to know which frame is which — every exposed frame is opaque, and that is
   * the point of the roll rather than a limitation of the screen.
   */
  const frameCount = Math.min(MAX_FRAMES_ON_STRIP, Math.max(1, knownRoll?.max_frames ?? 1));

  /** The length of film, and the two ends of its journey up the screen. */
  const stripH = frameCount * PITCH;

  /**
   * Below the screen entirely, so the roll arrives rather than being revealed.
   * The first moment is empty paper, which is what makes the film coming up
   * into it read as an entrance.
   */
  const windFrom = screenH;

  /**
   * Far enough up that only the tail is left hanging from the top edge. The
   * strip's bottom lands exactly on WINDOW_H.
   */
  const windTo = WINDOW_H - stripH;

  const wind = useSharedValue(0);
  const copy = useSharedValue(0);
  const cta = useSharedValue(0);

  /**
   * Whether this wind has already been run.
   *
   * The query keeps polling until the roll develops, and every answer was once
   * a fresh reason to wind the film again. A roll finishes once, so it is shown
   * finishing once.
   */
  const played = useRef(false);

  useEffect(() => {
    if (screen !== 'film' || played.current) return;
    played.current = true;

    if (reduced) {
      wind.set(windTo);
      copy.set(1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }

    wind.set(windFrom);
    wind.set(
      withTiming(windTo, { duration: WIND_MS, easing: WIND_EASING }, (done) => {
        'worklet';
        // On the stop, not on mount. The buzz is the mechanism landing; firing
        // it when the data arrives means it goes off before anything has moved.
        if (done) scheduleOnRN(landed);
      }),
    );

    copy.set(withDelay(COPY_DELAY, withTiming(1, { duration: 460 })));
  }, [screen, windFrom, windTo, reduced]);

  /**
   * The way in to the album, held back until there is an album to go to.
   *
   * The wind now runs off cached film, which can be a moment before the server
   * has the last frame — and the album reads the real photographs, which stay
   * unreadable until the roll is developed. Tying this to the wind's clock
   * would offer a door onto an empty room. It is tied to the fact instead, and
   * on a working connection the fact arrives while the film is still moving.
   */
  useEffect(() => {
    if (screen !== 'film' || !developed) return;
    if (reduced) {
      cta.set(1);
      return;
    }
    cta.set(withDelay(CTA_DELAY, withTiming(1, { duration: 420 })));
  }, [screen, developed, reduced, cta]);

  const windStyle = useAnimatedStyle(() => ({ transform: [{ translateY: wind.get() }] }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.get(),
    transform: [{ translateY: (1 - copy.get()) * 10 }],
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: cta.get(),
    transform: [{ translateY: (1 - cta.get()) * 10 }],
  }));

  if (screen === 'docket' && knownRoll) {
    const customers = knownRoll.members
      .map((m) => m.profile?.username)
      .filter((n): n is string => !!n);

    return (
      <SafeAreaView style={styles.docketScreen} edges={['top', 'left', 'right']}>
        {/* The only dark screen left here, so the only one that needs light icons. */}
        <StatusBar style="light" />
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

  /**
   * The grace, and anything longer than it.
   *
   * With film cached here this is a second at most — just long enough to learn
   * whether the frames are going anywhere. Without it, this is the old wait:
   * the photographs have to be fetched before there is anything to wind.
   */
  if (screen !== 'film') {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.ink} />

        {/* Appears only if the wait outlasts a normal upload. No explanation
            offered, because none can be given honestly from here — the film is
            still going up, and how long that takes is the connection's
            business. This is a door, not a diagnosis. */}
        {stuck ? (
          <View style={styles.waitOut}>
            <Text style={styles.waitNote}>Still developing.</Text>
            <Button
              title="View Active Films"
              variant="ghost"
              onPress={() => router.replace('/film')}
            />
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  /**
   * The roll as described to the reader.
   *
   * From the server when it has answered, and from the persisted list of active
   * rolls when it has not — the camera was shooting into this roll a second ago,
   * so its name and its members are already in hand. The film no longer waits
   * for a request, and neither does the caption under it.
   */
  const roll = knownRoll;
  if (!roll) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.ink} />
      </SafeAreaView>
    );
  }

  const names = roll.members.map((m) => m.profile?.username).filter((n): n is string => !!n);

  /**
   * The server's count once there is one, and the roll's full length until then.
   *
   * The cached copy predates the last shutter, so reading `photo_count` off it
   * would announce a full roll as one frame short of itself.
   */
  const counted = data?.roll?.photo_count ?? roll.max_frames;

  const stripW = Math.round(width * STRIP_SHARE);
  const coreW = stripW - PERF_W * 2;
  // Punched the whole length of the film, since the whole length now passes
  // through the screen rather than a window's worth of it.
  const holes = holePositions(stripH);

  return (
    /* No top edge. Padding the safe area would hold the gate below the notch,
       and the film would stop short of the screen's actual top — a strip
       hanging under the status bar rather than one carrying on past it. The
       copy below centres in the full height and is nowhere near the cut-out. */
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      {/* The gate is the whole screen now, not a slot at the top of it: the
          roll comes up from below the bottom edge, crosses the screen, and
          carries on off the top until only its tail is left. Which means this
          view has to be transparent — it used to be filled with film edge, and
          at full height that would be a black column standing there before any
          film had arrived and after it had gone.

          Nothing is lost behind the cut-out: the strip is half the screen's
          width and centred, so the clock and the battery sit outside it. */}
      <View style={[styles.window, { width: stripW }]}>
        <Animated.View style={[styles.reel, { top: 0, height: stripH }, windStyle]}>
          {/* Bare film. The frames were printed here for a while and it was
              never worth what it cost: the photographs are full-resolution
              originals kept for downloading, far too heavy for a strip 166
              points wide, and every attempt to get them onto it in time — a
              load gate, a thumbnail cache written at exposure — bought a
              smoother wind at the price of another thing that could go wrong.
              Exposed film is opaque anyway (§9.2). This is what a roll actually
              looks like coming off the spool, and it cannot fail to load. */}
          {Array.from({ length: frameCount }, (_, i) => (
            <View
              key={i}
              style={[styles.frame, { top: i * PITCH, left: PERF_W, width: coreW }]}
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
              ? `DEVELOPED EARLY · ${counted} OF ${roll.max_frames}`
              : `${counted} OF ${roll.max_frames} · DEVELOPED`}
          </Text>
          <Text style={styles.name}>{roll.name}</Text>
          <Text style={styles.by}>{creditLine(names)}</Text>
        </Animated.View>

        <Animated.View style={ctaStyle}>
          {/* Filled now that the page is paper. On the black screen this had to
              be a ghost, because the filled variant is black on white and would
              have vanished into it; on white it is the right way round again,
              and this is the screen's one action. */}
          <Button title="See the roll" onPress={() => router.replace(`/album/${roll.id}`)} />
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
  // Paper. The film is the only dark thing on the screen now, which is how a
  // developed strip is actually looked at — held up against the light rather
  // than glowing on a black field.
  screen: { flex: 1, backgroundColor: colors.paper },
  // The docket keeps the dark ground it was drawn for: it is a white receipt,
  // and a white receipt on white paper is not a receipt.
  docketScreen: { flex: 1, backgroundColor: colors.bodyBlack },
  center: { alignItems: 'center', justifyContent: 'center' },

  waitOut: { position: 'absolute', bottom: space.xxl + space.md, left: space.xl, right: space.xl },
  waitNote: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: space.md,
  },

  // The paper hangs from the top of the screen, as it would from a slot.
  docketBody: { flex: 1, paddingTop: space.xxl },
  docketFoot: { paddingHorizontal: space.xl, paddingBottom: space.xxl + space.md },

  // Full height and out of the flow, so the copy below centres on the screen's
  // own middle rather than on whatever is left under the film. Transparent: the
  // black belongs to the film, which is the thing that moves.
  window: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  // The film's own edge, carried by the film rather than painted on the gate
  // behind it — otherwise the black stays put while the roll travels through.
  reel: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.filmEdge },
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
    color: colors.muted,
    marginBottom: space.sm,
  },
  name: {
    fontFamily: fonts.serifSemi,
    fontSize: 28,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  by: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
