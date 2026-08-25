import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Close } from '@/components/Aperture';
import { CARTRIDGE_ROW_HEIGHT, Cartridges } from '@/components/Cartridges';
import { usePillHeight, useTabPillClearance } from '@/components/TabPill';
import { FilmStrip, useFilmMetrics, type FilmStripHandle } from '@/components/FilmStrip';
import { Button } from '@/components/ui';
import { fetchActiveRolls, shootFrame } from '@/lib/api';
import { filterById } from '@/lib/filters';
import { queueSnapshot, useQueuedByRoll } from '@/lib/frameQueue';
import { useLoadedRoll } from '@/lib/loadedRoll';
import { posthog } from '@/lib/posthog';
import { colors, fonts, space } from '@/theme';

/** Simulators have no camera. Reviewing the flow there still has to work. */
const HAS_CAMERA = Device.isDevice;

/**
 * The screen growing out of the tab it was opened from.
 *
 * There is no transform origin in React Native, so the effect is built from a
 * translate and a scale together: shifting by the distance from the icon to the
 * screen's centre, scaled by how much growing is left, keeps the icon's point
 * fixed while everything expands away from it.
 */
const OPEN_MS = 210;
const OPEN_FROM = 0.32;

/**
 * Longest the shutter will wait on the film to finish winding.
 *
 * Comfortably past the ~620ms the advance actually takes, so it never fires in
 * normal use — it exists only so that an animation which never reports back
 * cannot take the rest of the shutter with it.
 */
const ADVANCE_CEILING_MS = 1500;

/** The old film leaving, then the new one arriving. Out is quicker than in. */
const SWAP_OUT_MS = 150;
const SWAP_IN_MS = 230;
const SWAP_EASE = Easing.bezier(0.23, 1, 0.32, 1);

export default function CameraTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const camera = useRef<CameraView>(null);
  const strip = useRef<FilmStripHandle>(null);

  // The tab bar is hidden on this screen, so nothing is reserved for it — that
  // space belongs to the frame. What the base does owe room to is the cartridge
  // row sitting above the shutter.
  const metrics = useFilmMetrics(CARTRIDGE_ROW_HEIGHT + space.sm);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [shooting, setShooting] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);

  const { data: rolls, isLoading } = useQuery({
    queryKey: ['active-rolls'],
    queryFn: fetchActiveRolls,
  });

  // The tab opens onto whatever was last loaded. When that id is stale — the
  // roll finished, or nothing has been chosen yet — fall through to the first
  // active roll rather than showing an empty camera.
  const { rollId, load } = useLoadedRoll();

  // Same rule as the Film tab: a roll this phone has already filled is out,
  // even while the server still lists it as active because the frames proving
  // it are queued here. Without this the camera keeps offering film that is
  // spent, and the server would turn those frames away.
  //
  // Except the one in the gate. Filling a roll queues its last frame, which
  // makes it fail this test instantly — mid-shutter, while the film is still
  // winding. Dropping it here swapped the whole screen for the empty state and
  // took `FilmStrip` down with it, leaving the advance waiting on a completion
  // callback from an animation that no longer existed. Nothing after that ever
  // ran, including the navigation to the docket. The loaded roll stays until
  // the screen is left.
  /**
   * The roll actually on screen.
   *
   * It lags `roll` for the length of a swap so the film can slide out carrying
   * the old edge codes and slide back in carrying the new ones. Without the lag
   * the numbers change while the old strip is still visible.
   *
   * Declared before the list it helps filter, because that filter reads it.
   */
  const [shownId, setShownId] = useState<string | null>(null);

  const queued = useQueuedByRoll();
  const active = (rolls ?? []).filter(
    (r) => r.id === shownId || r.photo_count + (queued[r.id] ?? 0) < r.max_frames,
  );
  const roll = active.find((r) => r.id === rollId) ?? active[0];
  const shown = active.find((r) => r.id === shownId) ?? roll;

  const { width: screenW, height: screenH } = useWindowDimensions();
  const pillH = usePillHeight();
  // The bar is on screen for the empty state — it is the only way off it —
  // so that state has to keep its buttons clear of the bar.
  const pillClearance = useTabPillClearance();
  const reduced = useReducedMotion();

  // Camera is the middle tab, so its icon sits on the screen's own vertical
  // axis — only the height has to be worked out.
  const originY = screenH - Math.max(insets.bottom, space.lg) - pillH / 2;

  const open = useSharedValue(0);
  const openStyle = useAnimatedStyle(() => {
    const t = open.get();
    return {
      opacity: t,
      transform: [
        { translateY: (originY - screenH / 2) * (1 - t) },
        { scale: OPEN_FROM + (1 - OPEN_FROM) * t },
      ],
    };
  });

  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        open.set(1);
        return;
      }
      open.set(0);
      open.set(withTiming(1, { duration: OPEN_MS, easing: SWAP_EASE }));
    }, [open, reduced]),
  );
  const swap = useSharedValue(0);
  const swapStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swap.get() }] }));

  useEffect(() => {
    if (!roll) return;
    if (shownId === null || reduced) {
      setShownId(roll.id);
      return;
    }
    if (shownId === roll.id) return;

    // Which way the new cartridge sits in the row decides which way the film
    // travels: pick one to the right and the old strip leaves to the left.
    const from = active.findIndex((r) => r.id === shownId);
    const to = active.findIndex((r) => r.id === roll.id);
    const dir = to > from ? 1 : -1;

    const commit = () => {
      setShownId(roll.id);
      // Placed off the far edge with no animation, then brought home — the new
      // film enters from the side the old one left towards.
      swap.set(dir * screenW);
      swap.set(withTiming(0, { duration: SWAP_IN_MS, easing: SWAP_EASE }));
    };

    swap.set(
      withTiming(-dir * screenW, { duration: SWAP_OUT_MS, easing: SWAP_EASE }, (done) => {
        'worklet';
        if (done) scheduleOnRN(commit);
      }),
    );
  }, [roll?.id, shownId, reduced, screenW, active, swap]);

  const [exposed, setExposed] = useState<number | null>(null);

  /**
   * A different roll is a different count, in either direction.
   *
   * This has to be a hard reset rather than the follow below: that only ever
   * climbs, so switching to a roll with fewer frames left the old, higher
   * numbers printed on the new film.
   */
  useEffect(() => {
    if (shown) setExposed(shown.photo_count);
  }, [shownId]);

  /**
   * The strip advances the moment the shutter fires, so the count on screen is
   * local rather than the server's. It only ever follows the server upward, and
   * only while idle: another member shooting into the roll should move the
   * strip, but not underneath an advance already in flight.
   */
  useEffect(() => {
    if (!shown || shooting) return;
    setExposed((cur) => (cur === null || shown.photo_count > cur ? shown.photo_count : cur));
  }, [shown, shooting]);

  const commitAdvance = useCallback(() => {
    setExposed((n) => (n === null ? n : n + 1));
  }, []);

  async function capture() {
    if (!shown || exposed === null || shooting) return;
    if (HAS_CAMERA && !camera.current) return;
    setShooting(true);

    let advanced = false;
    try {
      let uri: string;
      let width: number | undefined;
      let height: number | undefined;

      if (HAS_CAMERA) {
        const shot = await camera.current!.takePictureAsync({
          // The sensor's own frame, uncompressed as far as the camera allows.
          // Default stock uploads this file untouched, and the filtered stocks
          // decode it — so anything lost here is lost for good, in both paths.
          quality: 1,
        });
        if (!shot) throw new Error('The camera returned no image.');
        ({ uri, width, height } = shot);
      } else {
        // Stand-in frame so the whole flow stays walkable on a simulator.
        const portrait = Math.random() > 0.5;
        width = portrait ? 600 : 800;
        height = portrait ? 800 : 600;
        uri = `https://picsum.photos/seed/${Math.random().toString(36).slice(2)}/${width}/${height}`;
      }

      // Wind the film against the queue write rather than after it. The
      // exposure is already made at this point; making the shooter watch a
      // progress bar to find that out would undo the whole mechanism.
      const stored = shootFrame({ rollId: shown.id, uri, width, height, filter: shown.filter });
      stored.catch(() => {}); // settled below — this only stops an unhandled rejection mid-advance

      if (strip.current) {
        // Raced against a ceiling. The wind is about 620ms of animation, and
        // everything that matters — the roll finishing, the docket — happens
        // after this line, so it must not be possible for a stalled or
        // unmounted animation to hold the payoff hostage. Whichever settles
        // first, the film has already been exposed.
        await Promise.race([
          strip.current.advance(),
          new Promise((resolve) => setTimeout(resolve, ADVANCE_CEILING_MS)),
        ]);
        advanced = true;
      }

      // Resolves once the frame is durably on disk, which may be well before it
      // reaches the server — or days before, on a phone with no signal.
      await stored;

      // The local counter decides, because it is the only thing that can decide
      // offline. This is the shooter's own roll filling up: their twenty-fourth
      // frame is their payoff moment whether or not anyone else's frames have
      // landed yet, and the server reconciles the true order later.
      const finished = exposed + 1 >= shown.max_frames;
      const frameNumber = exposed + 1;
      /**
       * The retention event.
       *
       * Opening the app is a weak signal — it can be done without taking a
       * photograph — so returning is measured by whether someone shot a frame,
       * which is the only thing this app is for.
       *
       * `$set_once` stamps the first ever frame on the person and never
       * overwrites it. That is what separates "signed up" from "actually
       * started", and retention among people who started is a far more honest
       * number than retention among everyone who made an account.
       */
      posthog?.capture('frame_captured', {
        frame_number: frameNumber,
        max_frames: shown.max_frames,
        filter: shown.filter,
        is_simulator: !HAS_CAMERA,
        $set_once: { first_frame_at: new Date().toISOString() },
      });

      if (finished) {
        /**
         * One event, broken down by property rather than split into three
         * names. `shared` separates a roll filled with other people from one
         * filled alone, and `developed_offline` marks a roll whose last frame
         * was taken with nothing to send it to — read live from the queue
         * rather than from the render's copy, which predates this shutter.
         */
        const waiting = queueSnapshot().filter((f) => f.rollId === shown.id).length;

        posthog?.capture('roll_completed', {
          max_frames: shown.max_frames,
          filter: shown.filter,
          shared: shown.members.length > 1,
          member_count: shown.members.length,
          developed_offline: waiting > 0,
          frames_awaiting_upload: waiting,
        });
        // Stop the camera session and let native finish tearing it down
        // before the route change unmounts CameraView — replacing while
        // it's still live races the view manager and throws "Can't find
        // ViewManager" on the last frame of the roll.
        setCameraActive(false);
        await new Promise((resolve) => requestAnimationFrame(resolve));

        router.replace(`/roll/finished/${shown.id}`);
      }

      // Refreshed behind the transition, never in front of it. `invalidateQueries`
      // resolves only once every matching *active* query has refetched, so
      // awaiting these put up to three network round trips between the last
      // frame and the screen that is meant to be the reward for it. The finished
      // screen fetches on its own key regardless.
      qc.invalidateQueries({ queryKey: ['roll', shown.id] }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['active-rolls'] }).catch(() => {});
      if (finished) qc.invalidateQueries({ queryKey: ['finished-rolls'] }).catch(() => {});
    } catch (e: any) {
      // The film already wound on, so wind it back rather than leaving the
      // strip claiming an exposure the roll never took.
      //
      // Only local failures reach here now — a frame that could not be
      // developed or could not be written to disk. Anything to do with the
      // network is the queue's problem and never fails the shutter.
      if (advanced) setExposed((n) => (n === null ? n : Math.max(0, n - 1)));

      Alert.alert("That frame didn't take", e?.message ?? 'Please try again.');
    } finally {
      setShooting(false);
    }
  }

  // Word for word the Film tab's empty state. With no rolls there is nothing
  // for the camera to say that Film does not already say, and two screens
  // phrasing the same absence differently would imply two different problems.
  if (!isLoading && active.length === 0) {
    return (
      <SafeAreaView style={styles.emptyScreen} edges={['top', 'left', 'right']}>
        <View style={[styles.empty, { paddingBottom: pillClearance }]}>
          <Text style={styles.emptyTitle}>No rolls</Text>
          <Text style={styles.emptyBody}>
            Open a roll, or join one a friend has already created.
          </Text>
          <Button
            title="Open a roll"
            onPress={() => router.push('/roll/new')}
            style={styles.emptyCta}
          />
          <Button
            title="Join a roll"
            variant="ghost"
            onPress={() => router.push('/roll/join')}
            style={styles.emptyCtaSecondary}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (HAS_CAMERA && !permission) {
    return (
      <View style={[styles.body, styles.center]}>
        <ActivityIndicator color={colors.onDark} />
      </View>
    );
  }

  if (HAS_CAMERA && !permission!.granted) {
    return (
      <SafeAreaView style={[styles.body, styles.center, { paddingHorizontal: space.xl }]}>
        <Text style={styles.permTitle}>Savour needs the camera</Text>
        <Text style={styles.permBody}>
          Frames can only be taken in the moment — there is no way to add a photo from your library.
        </Text>
        <Button title="Allow camera" onPress={requestPermission} style={styles.permCta} />
        <Button title="Not now" variant="text" onPress={() => router.navigate('/film')} />
      </SafeAreaView>
    );
  }

  return (
    <Animated.View style={[styles.body, openStyle]}>
      <StatusBar style="light" />

      {/* Mount only once the real count is known, so the strip's first paint is
          the truth rather than a zero that then jumps a frame. */}
      {/* The clear base, drawn here rather than inside the strip so it stays
          put while the film travels. Without it the base slides out from under
          the cartridges and the shutter, which do not move. */}
      <View style={[styles.staticBase, { top: metrics.freshTop }]} />

      {exposed !== null ? (
        <Animated.View
          // Clipped to the viewfinder. Only the film moves — everything below
          // the last edge code is the camera body, and a body does not swipe.
          style={[styles.swapWindow, { height: metrics.freshTop }, swapStyle]}
        >
          <FilmStrip
            ref={strip}
            metrics={metrics}
            exposed={exposed}
            onAdvanced={commitAdvance}
            // The stock printed in the rebate is the roll's own filter — it is
            // baked into every frame at capture (§9.3), so it is as much a
            // property of this length of film as its length is.
            stock={filterById(shown?.filter).label.toUpperCase()}
          >
            {HAS_CAMERA ? (
              <CameraView
                ref={camera}
                style={StyleSheet.absoluteFill}
                facing="back"
                active={cameraActive}
                // The app is portrait-locked (app.json), so without this the
                // camera reports every frame as portrait-shaped no matter how
                // the phone was actually turned — a landscape shot would come
                // back with width/height swapped to match the locked UI, not
                // the hand holding it.
                responsiveOrientationWhenOrientationLocked
                // The film strip's own freeze/wind/reveal *is* the shutter
                // feedback (§FilmStrip.advance). The native flash defaults on
                // and fires on its own clock, unsynced with that sequence —
                // which is the white flash landing at some arbitrary point
                // after the frame has already changed.
                animateShutter={false}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.noCamera]}>
                <Text style={styles.noCameraText}>No camera on a simulator</Text>
                <Text style={styles.noCameraHint}>
                  The shutter still works — it stands in a frame.
                </Text>
              </View>
            )}
          </FilmStrip>
        </Animated.View>
      ) : null}

      {/* A top plate rather than film: the spent frame winds up behind this and
          out of sight, which is where an exposed frame belongs (§9.2). */}
      <View style={[styles.head, { height: insets.top + metrics.headerH, paddingTop: insets.top }]}>
        <Text style={styles.rollName} numberOfLines={1}>
          {shown?.name ?? ''}
        </Text>

        {/* The tab bar is hidden here, so this is the only way off the screen. */}
        <Pressable
          // `navigate` rather than `push`: this is a move between tabs, not a
          // screen stacked on top of one.
          onPress={() => router.navigate('/film')}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Close the camera"
        >
          <Close size={23} color={colors.onDark} />
        </Pressable>
      </View>

      {/* On the clear, unexposed base below the edge code — the only light
          ground on the screen, so the shutter inverts to black here. */}
      <View
        style={[styles.foot, { top: metrics.freshTop, paddingBottom: insets.bottom + space.xs }]}
        pointerEvents="box-none"
      >
        <Cartridges rolls={active} selectedId={roll?.id ?? null} onSelect={load} />

        <Pressable
          onPress={capture}
          disabled={shooting}
          style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
          accessibilityRole="button"
          accessibilityLabel="Take a frame"
        >
          <View style={styles.shutterInner}>
            {shooting && <ActivityIndicator color={colors.filmBase} size="small" />}
          </View>
        </Pressable>
        <Text style={styles.note}>PHOTOS WILL BE HIDDEN UNTIL THE ROLL IS FULL</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.bodyBlack },
  staticBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.filmBase,
  },
  swapWindow: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },

  head: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    // Sat at the foot of the plate rather than centred in it, so the name reads
    // against the film it labels instead of floating under the status bar.
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.bodyBlack,
  },
  // Boxed to the name's line height, not to a tap target, so bottom-aligning
  // the row lines the chevron up with the text rather than 6px above it.
  // hitSlop on the Pressable keeps the touch area honest.
  close: {
    marginLeft: 'auto',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    // The row bottom-aligns to the roll name's line, so the taller box is
    // dropped back onto that line rather than floating above it.
    marginBottom: -5,
  },
  rollName: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.onDark,
    flexShrink: 1,
  },

  // Matched to app/(tabs)/film.tsx — same paper, same measures, same type.
  emptyScreen: { flex: 1, backgroundColor: colors.paper },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  emptyTitle: {
    fontFamily: fonts.serifSemi,
    fontSize: 22,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.sm,
  },
  emptyCta: { alignSelf: 'stretch', marginTop: space.xl, marginBottom: space.sm },
  emptyCtaSecondary: { alignSelf: 'stretch' },

  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    // Sat at the end of the run-out rather than centred in it, so the shutter
    // stays low under the thumb whatever height the frame above resolves to.
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  shutter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: colors.filmBaseInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.6 },
  shutterInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.filmBaseInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.8,
    color: '#7D7A72',
  },

  noCamera: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
    paddingHorizontal: space.xl,
  },
  noCameraText: { fontFamily: fonts.serifSemi, fontSize: 15, color: 'rgba(255,255,255,0.75)' },
  noCameraHint: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: space.xs,
    textAlign: 'center',
  },

  permTitle: {
    fontFamily: fonts.serifSemi,
    fontSize: 22,
    color: colors.onDark,
    textAlign: 'center',
  },
  permBody: {
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: space.sm,
  },
  permCta: { alignSelf: 'stretch', marginTop: space.xl },
});
