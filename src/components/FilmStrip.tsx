import * as Haptics from 'expo-haptics';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts } from '@/theme';

/** 35mm carries eight perforations per frame, so an advance travels exactly eight. */
const PERFS_PER_FRAME = 8;

/** The advance itself. Long for a UI animation because it travels a whole frame. */
const ADVANCE_MS = 280;
/** How long the blocker takes to swipe up and fully cover the viewfinder.
 *  A full frame's height is a lot of ground — anything shorter outruns the
 *  eased curve and reads as a snap no matter how gentle the easing is. */
const BLOCK_MS = 320;
/** The blocker continuing up and off, uncovering the live camera behind it. */
const REVEAL_MS = 220;

/** A wound spring stopping against a pawl: fast away, hard stop, no settle.
 *  Used only for the reel — it's mechanical film, not a screen transition. */
const HARD_STOP = Easing.bezier(0.15, 0.85, 0.25, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Gentle at both ends. The blocker is a mask, not a mechanism — it should
 *  glide, not clunk to a stop the way the film itself does. */
const SMOOTH = Easing.bezier(0.4, 0, 0.2, 1);

export interface FilmMetrics {
  perfW: number;
  coreW: number;
  frameH: number;
  rebateH: number;
  /** The top plate carrying back and the roll name. Not film. */
  headerH: number;
  /** Distance between the same point on consecutive frames — one advance. */
  pitch: number;
  /** Y of the live frame's top edge, and the bottom of the header. */
  windowTop: number;
  /** Y where unexposed base begins, below the live frame's edge code. */
  freshTop: number;
}

/**
 * Derived from the screen rather than fixed, because the frame has to keep a
 * sane shape on a small phone without pushing the shutter off the bottom.
 */
export function useFilmMetrics(extraFoot = 0): FilmMetrics {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const perfW = Math.round(width * 0.068);
    const coreW = width - perfW * 2;
    const rebateH = 30;
    const headerH = 64;
    // The film's leader: a run of black between the plate and the first
    // perforation, so the window sits off the header rather than butted up
    // against it.
    const lead = 20;
    // The clear base below the strip. Sized to what the shutter and its note
    // actually need, so the frame keeps the rest rather than leaving a field of
    // grey above the button.
    //
    // `extraFoot` is whatever floats over the bottom of this screen — the tab
    // bar, when the viewfinder is a tab. Reserved here rather than padded on
    // afterwards, so the frame shrinks to make room instead of the shutter
    // sliding underneath the bar.
    const foot = 84 + insets.bottom + extraFoot;

    const plate = insets.top + headerH;
    const room = height - plate - lead - rebateH - foot;

    // The frame takes the room it is given. The cap is a guard against a very
    // tall, narrow screen stretching it past a shape you would ever compose in,
    // not a target — on a phone the frame reaches the shutter first.
    const frameH = Math.round(Math.min(coreW * 1.8, Math.max(room, 240)));

    // Anything the cap leaves over is split above and below rather than dumped
    // into the base, so the window stays centred in what is left of the screen.
    const windowTop = plate + lead + Math.round(Math.max(0, room - frameH) / 2);

    return {
      perfW,
      coreW,
      rebateH,
      headerH,
      frameH,
      pitch: frameH + rebateH,
      windowTop,
      freshTop: windowTop + frameH + rebateH,
    };
  }, [width, height, insets.top, insets.bottom, extraFoot]);
}

export interface FilmStripHandle {
  /**
   * Block the viewfinder, wind the strip behind it, and reveal live film
   * again. Resolves once the camera is visible.
   */
  advance(): Promise<void>;
}

interface Props {
  metrics: FilmMetrics;
  /** Exposures already taken. The frame being composed is this plus one. */
  exposed: number;
  /** Called at the hard stop, so the caller can commit the new count. */
  onAdvanced(): void;
  stock?: string;
  /** The live camera, sat behind the strip and seen through the frame window. */
  children: React.ReactNode;
}

/**
 * The viewfinder as a length of film rather than a camera holding one.
 *
 * The strip carries three frames at once, and that is the whole design: the
 * exposed frame above is black, the frame below is clear base, and the boundary
 * between them is the roll's progress. Nothing here reports a number twice —
 * the count lives in the edge code printed in the rebate, where a real strip
 * carries it.
 */
export const FilmStrip = forwardRef<FilmStripHandle, Props>(function FilmStrip(
  { metrics, exposed, onAdvanced, stock = 'SAVOUR 400', children },
  ref,
) {
  const { perfW, coreW, frameH, rebateH, pitch, windowTop, freshTop } = metrics;

  const reduced = useReducedMotion();

  // Travel of the film itself. Perforations ride the same value so the holes
  // move with the strip they are punched in. Nothing photographic rides
  // along with it any more, so nothing in the reel can flash sideways while
  // an orientation tag it was shot with is still catching up (§ orientation).
  const ty = useSharedValue(0);
  // The blocker's own translateY: starts a frame-height below the window
  // (out of the way), swipes up to 0 (fully covering it), then continues up
  // to a frame-height above (fully clear) to reveal the live camera.
  const block = useSharedValue(frameH);
  // Parked off past the window is still `frameH` tall — enough to sit right
  // on top of the fixed count/stock readout just below it. Opacity keeps it
  // truly invisible at rest, wherever its resting translateY happens to put
  // its box, rather than relying on position alone to clear every neighbour.
  const blockOn = useSharedValue(0);

  const resetPending = useRef(false);

  // The count is a readout, not a mark on the film: it holds its screen
  // position and ticks over on change, rather than departing with the frame
  // it used to belong to. Starts settled so opening the screen doesn't pulse.
  const countTick = useSharedValue(1);
  const countMounted = useRef(false);
  useEffect(() => {
    if (!countMounted.current) {
      countMounted.current = true;
      return;
    }
    countTick.set(0);
    countTick.set(withTiming(1, { duration: 180, easing: EASE_OUT }));
  }, [exposed, countTick]);
  const countStyle = useAnimatedStyle(() => ({
    opacity: countTick.get(),
    transform: [{ translateY: (1 - countTick.get()) * 6 }],
  }));

  // The reel is reset only once React has committed the new frame number, or
  // the edge codes would tear for a frame between the strip snapping back and
  // the numbers catching up. The blocker isn't gated here — it carries no
  // text of its own, so its own timing in `advance` is free to handle it.
  useEffect(() => {
    if (!resetPending.current) return;
    resetPending.current = false;
    ty.set(0);
  }, [exposed, ty]);

  const advance = useCallback(async () => {
    // Only visible for the swipe itself — see blockOn above.
    blockOn.set(1);

    if (reduced) {
      block.set(0);
    } else {
      // The reel winds on its own clock — it's just colour now, nothing that
      // can be caught mid-rotation.
      ty.set(withTiming(-pitch, { duration: ADVANCE_MS, easing: HARD_STOP }));

      await new Promise<void>((resolve) => {
        block.set(
          withTiming(0, { duration: BLOCK_MS, easing: SMOOTH }, (done) => {
            'worklet';
            if (done) scheduleOnRN(resolve);
          }),
        );
      });
    }

    // The stop is what tells you a frame was spent, so the haptic lands here
    // rather than when the camera comes back.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});

    resetPending.current = true;
    onAdvanced();

    if (reduced) {
      block.set(frameH);
      blockOn.set(0);
    } else {
      await new Promise<void>((resolve) => {
        block.set(
          withTiming(-frameH, { duration: REVEAL_MS, easing: SMOOTH }, (done) => {
            'worklet';
            if (done) scheduleOnRN(resolve);
          }),
        );
      });
      // Hidden before it's repositioned, so landing back on the readout's
      // spot for next time's swipe-in never shows.
      blockOn.set(0);
      block.set(frameH);
    }
  }, [reduced, pitch, frameH, ty, block, blockOn, onAdvanced]);

  useImperativeHandle(ref, () => ({ advance }), [advance]);

  const reelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.get() }] }));
  const blockStyle = useAnimatedStyle(() => ({
    opacity: blockOn.get(),
    transform: [{ translateY: block.get() }],
  }));

  // Four frames: the one just spent, the live window, and two of clear base so
  // nothing runs out from under the strip mid-advance.
  const slots = [0, 1, 2, 3];
  const reelTop = windowTop - frameH - rebateH;

  // The punched edge runs alongside the frame and its rebate and stops there,
  // so the sprocket holes read as belonging to the window rather than as a
  // border drawn down the whole screen.
  const edgeH = frameH + rebateH;

  const perfPitch = pitch / PERFS_PER_FRAME;
  const holes = useMemo(() => {
    const count = Math.ceil((edgeH + pitch * 2) / perfPitch) + 2;
    return Array.from({ length: count }, (_, i) => i * perfPitch - pitch);
  }, [edgeH, pitch, perfPitch]);

  const perfs = (
    <Animated.View style={[StyleSheet.absoluteFill, reelStyle]} pointerEvents="none">
      {holes.map((top) => (
        <View
          key={top}
          style={{
            position: 'absolute',
            top,
            alignSelf: 'center',
            width: Math.round(perfW * 0.52),
            height: Math.round(perfPitch * 0.42),
            borderRadius: 2.5,
            backgroundColor: colors.perf,
          }}
        />
      ))}
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      {/* Unexposed base, run the full width of the phone rather than the width
          of the strip: below the last edge code there is no film left to have
          an edge, and a grey band that stops short of the bezel reads as a
          mistake rather than as material. */}
      <View style={[styles.base, { top: freshTop }]} />

      {/* The camera sits behind the film and is seen through the frame window,
          which is the only part of the strip that is not opaque. */}
      <View
        style={[
          styles.window,
          { top: windowTop, left: perfW, width: coreW, height: frameH },
        ]}
      >
        {children}
      </View>

      <Animated.View
        style={[
          styles.reel,
          { top: reelTop, left: perfW, width: coreW },
          reelStyle,
        ]}
        pointerEvents="none"
      >
        {slots.map((i) => {
          // Zero-based, to agree with the cartridge on the base: it reads
          // "8 / 12" for eight frames spent, so the frame in the gate is index
          // 8, not the ninth. Slot 1 is the window, hence the offset.
          const number = exposed + i - 1;
          const isWindow = i === 1;
          return (
            <View key={i}>
              <View
                style={{
                  width: coreW,
                  height: frameH,
                  backgroundColor: isWindow
                    ? 'transparent'
                    : i === 0
                      ? colors.filmSpent
                      : colors.filmBase,
                }}
              />
              {/* The window's own edge code moved to a fixed overlay below —
                  this slot leaves its rebate blank so nothing doubles up. */}
              {isWindow ? (
                <View style={{ width: coreW, height: rebateH }} />
              ) : (
                <EdgeCode width={coreW} height={rebateH} number={number} stock={stock} prominent={false} />
              )}
            </View>
          );
        })}
      </Animated.View>

      {/* The live frame's count and stock, fixed in place while the strip
          winds underneath it — see countTick above. Opaque so whatever is
          transiting past this rect stays hidden until it settles here. */}
      <View
        style={[
          styles.rebateFixed,
          { top: windowTop + frameH, left: perfW, width: coreW, height: rebateH },
        ]}
      >
        <Animated.View style={countStyle}>
          <EdgeCode width={coreW} height={rebateH} number={exposed} stock={stock} prominent />
        </Animated.View>
      </View>

      {/* A plain shutter, not the shot itself: swipes up to black out the
          viewfinder opening — the one place a freshly captured photo used to
          flash while its orientation was still being sorted out — then
          keeps going, clearing off the top to hand back to the live camera. */}
      <Animated.View
        style={[
          styles.window,
          { top: windowTop, left: perfW, width: coreW, height: frameH },
          styles.block,
          blockStyle,
        ]}
        pointerEvents="none"
      />

      <View style={[styles.perfCol, { left: 0, width: perfW, top: windowTop, height: edgeH }]}>
        {perfs}
      </View>
      <View style={[styles.perfCol, { right: 0, width: perfW, top: windowTop, height: edgeH }]}>
        {perfs}
      </View>
    </View>
  );
});

/**
 * The frame number as it is actually carried on film: printed in the rebate
 * between frames, alongside the stock name. This is the counter — there is no
 * dial anywhere in this viewfinder.
 */
function EdgeCode({
  width,
  height,
  number,
  stock,
  prominent,
}: {
  width: number;
  height: number;
  number: number;
  stock: string;
  prominent: boolean;
}) {
  // Zero is a real frame now — an unshot roll sits at 0 — so only the slot
  // before the first one is blank.
  if (number < 0) return <View style={{ width, height }} />;

  return (
    <View style={[styles.rebate, { width, height, opacity: prominent ? 1 : 0.34 }]}>
      <Text style={[styles.code, prominent && styles.codeBig]}>{number}</Text>
      <View style={styles.tri} />
      <Text style={[styles.code, styles.codeDim]}>{number}A</Text>
      {prominent ? <Text style={styles.stock}>{stock}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bodyBlack,
  },
  window: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.bodyBlack },
  base: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.filmBase },
  block: { backgroundColor: colors.bodyBlack },
  reel: { position: 'absolute' },
  rebateFixed: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.filmEdge },

  perfCol: {
    position: 'absolute',
    backgroundColor: colors.filmEdge,
    overflow: 'hidden',
  },

  rebate: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4 },
  code: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.9,
    color: colors.onDark,
  },
  codeBig: { fontFamily: fonts.monoBold, fontSize: 15, letterSpacing: 1 },
  codeDim: { opacity: 0.36 },
  stock: {
    marginLeft: 'auto',
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.7,
    color: colors.onDark,
    opacity: 0.5,
  },
  tri: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.onDark,
  },
});
