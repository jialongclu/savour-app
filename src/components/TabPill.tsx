import * as Haptics from 'expo-haptics';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import React, {
  Children,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewProps,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { IconProps } from './Aperture';
import { colors, fonts, radius, space } from '@/theme';

/** The dock stands one twelfth of the screen tall, whatever the device. */
const SCREEN_FRACTION = 1 / 13;

/**
 * Height of the dock: a tab's own height plus the track around it.
 *
 * Taken from the window rather than fixed, so the bar holds the same share of
 * a small phone as a large one instead of dominating the short screen. Bigger
 * than it was when the pill carried icons alone — a caption now sits under
 * each glyph, and the row needs the extra headroom to set it without cramping.
 */
export function usePillHeight(): number {
  const { height } = useWindowDimensions();
  return Math.round(height * SCREEN_FRACTION);
}

/**
 * The black showing around the thumb, on all four sides.
 *
 * Kept at a real, visible width on purpose. The thumb is made larger by growing
 * the pill, not by squeezing this to nothing — pare the track away and the
 * selected tab gets bigger only by taking the bar's own presence with it.
 *
 * Both capsules take `radius.pill`, so this margin stays even around the
 * rounded ends as well as the flat sides.
 */
const TRACK = 6;

/** Icon size. Sized to sit above a caption rather than to carry the tab alone. */
const ICON = 20;

/** The camera button's glyph. A touch larger: it has no caption to share the eye with. */
const KNOB_ICON = 23;

/** Inactive ink: the pill's white, turned down. Never a second colour. */
const DIM = 'rgba(255,255,255,0.62)';

/**
 * Timed, not sprung — and the reason is the hand-over.
 *
 * The old spring (damping 20, stiffness 240, mass 0.9) was under-damped enough
 * to need about 360ms to settle inside its rest threshold, but it *looked*
 * arrived after roughly half of that. Nobody sees the tail. That was fine while
 * navigation fired at 75% of the travel; now that it waits for the stop, every
 * millisecond of invisible settling is a millisecond of nothing happening.
 *
 * A timing curve ends when it looks like it ends, so the hand-over lands on the
 * same instant the eye calls it arrived.
 */
const TRAVEL_MS = 240;
const TRAVEL_EASE = Easing.bezier(0.2, 0.9, 0.2, 1);

/**
 * How far the thumb travels before the screen changes.
 *
 * Measured in distance, not time — a spring does not cover its ground evenly.
 * At 1 the hand-over waits for the stop, which is what lets the incoming screen
 * grow out of the tab the thumb has just settled on; anything less and the
 * screen starts arriving while the bar is still moving under it.
 */
const HAND_OVER_AT = 1;

/**
 * How much bottom padding a scrollable screen needs to read its last row out
 * from under the dock. A floating bar buys back the full-width tab bar's strip
 * of screen, but only if every list pays this back at the bottom.
 */
export function useTabPillClearance(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, space.lg) + usePillHeight() + space.md;
}

/**
 * Where the camera knob's centre sits on screen.
 *
 * Lives here rather than in the screen that opens from it, because it is the
 * dock's own geometry: the knob is the last child of a row inset by `space.lg`
 * on both sides, so its right edge is the dock's right edge and it is as wide
 * as the dock is tall. A screen recomputing that from its own constants goes
 * quietly wrong the moment the dock is rearranged — which is exactly what
 * happened when the camera stopped being the middle tab and moved out of the
 * pill, leaving the viewfinder growing from the bottom centre of the screen
 * where nothing had been for some time.
 */
export function useCameraKnobOrigin(): { x: number; y: number } {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pillH = usePillHeight();
  const bottom = Math.max(insets.bottom, space.lg);

  return useMemo(
    () => ({ x: width - space.lg - pillH / 2, y: height - bottom - pillH / 2 }),
    [width, height, bottom, pillH],
  );
}

/* ------------------------------------------------------------------ context */

interface Metrics {
  x: number;
  width: number;
}

interface PillContext {
  /**
   * Which tab the thumb is on or heading to.
   *
   * Set the instant a tab is pressed, so it leads navigation rather than
   * following it. A tab that coloured itself from `isFocused` would still be
   * dim when the white arrived under it and still dark after the white had
   * left — white on white, then black on black, for the length of the travel.
   */
  active: number;
  report(index: number, metrics: Metrics): void;
  /**
   * Move the thumb to `index`, and run `onArrive` when it lands.
   *
   * A tab hands its navigation in here rather than running it on press, so the
   * white leads and the screen follows. Interrupting the travel drops the
   * pending move — the last tab tapped is the one you get.
   */
  focus(index: number, onArrive?: () => void): void;
}

const Ctx = createContext<PillContext | null>(null);

/* ---------------------------------------------------------------- container */

/**
 * The floating pill, and the thumb that travels between its tabs.
 *
 * The thumb is one view that slides and resizes rather than a background on
 * each tab that cross-fades: the tabs are different widths, and a fade would
 * lose the thing that makes the control feel mechanical, which is that the
 * white part *moves*.
 *
 * Tabs report their own geometry through context because a `TabList` will only
 * accept `TabTrigger`s as its children — the thumb is a sibling of the tabs,
 * not a parent, so it cannot measure them directly.
 *
 * The tabs sit flush, with no black between them, so the thumb's trailing edge
 * on one tab is exactly its leading edge on the next. The white travels as one
 * continuous move rather than crossing a gap and landing again.
 *
 * Not exported: it only ever appears as `TabDock`'s inner group, which is what
 * gives it its width and its place on screen.
 */
function PillBar({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  const [metrics, setMetrics] = useState<Record<number, Metrics>>({});
  const [active, setActive] = useState(0);

  const report = useCallback((index: number, next: Metrics) => {
    setMetrics((prev) => {
      const cur = prev[index];
      // Layout fires on every re-render; bail unless the geometry actually
      // moved, or this sets state in a loop.
      if (cur && cur.x === next.x && cur.width === next.width) return prev;
      return { ...prev, [index]: next };
    });
  }, []);

  // What to do once the thumb stops. Held in a ref rather than state: changing
  // it must not re-run the animation that is going to fire it.
  const pending = useRef<(() => void) | null>(null);

  const focus = useCallback((index: number, onArrive?: () => void) => {
    if (onArrive) pending.current = onArrive;
    setActive(index);
  }, []);

  const runPending = useCallback(() => {
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);

  const value = useMemo<PillContext>(() => ({ active, report, focus }), [active, report, focus]);

  const target = metrics[active];

  const x = useSharedValue(0);
  const width = useSharedValue(0);
  // The first measurement is not a tab change. Without this the thumb would
  // fly in from the left edge every time the bar mounts.
  const settled = useRef(false);

  // Where along the travel to hand over, which way the thumb is going, and
  // whether there is still something waiting to run.
  const handOver = useSharedValue(0);
  const forward = useSharedValue(true);
  const armed = useSharedValue(false);

  useAnimatedReaction(
    () => x.get(),
    (current) => {
      'worklet';
      if (!armed.get()) return;
      const reached = forward.get() ? current >= handOver.get() : current <= handOver.get();
      if (!reached) return;
      armed.set(false);
      scheduleOnRN(runPending);
    },
  );

  useEffect(() => {
    if (!target) return;

    // Nothing to watch — the first paint, or motion turned off. Hand over at
    // once rather than making the tap wait on an animation that never runs.
    if (!settled.current || reduced) {
      settled.current = true;
      armed.set(false);
      x.set(target.x);
      width.set(target.width);
      runPending();
      return;
    }

    const from = x.get();
    const to = target.x;

    handOver.set(from + (to - from) * HAND_OVER_AT);
    forward.set(to >= from);
    // At a full hand-over there is no crossing to watch for — a spring
    // approaches its target without arriving, so the reaction would never fire.
    // The completion callback below is the trigger instead.
    armed.set(HAND_OVER_AT < 1 && pending.current !== null);

    x.set(
      withTiming(to, { duration: TRAVEL_MS, easing: TRAVEL_EASE }, (done) => {
        'worklet';
        // The stop. Also the backstop for a partial hand-over whose threshold
        // was already behind the starting position.
        if (done) {
          armed.set(false);
          scheduleOnRN(runPending);
        }
      }),
    );
    width.set(withTiming(target.width, { duration: TRAVEL_MS, easing: TRAVEL_EASE }));
  }, [target?.x, target?.width, reduced, x, width, runPending, handOver, forward, armed]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    width: width.get(),
  }));

  return (
    <Ctx.Provider value={value}>
      <View style={styles.pill}>
        {target ? <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" /> : null}
        {children}
      </View>
    </Ctx.Provider>
  );
}

/* --------------------------------------------------------------------- dock */

interface TabDockProps extends ViewProps {
  /** Distance from the bottom of the screen, safe area already accounted for. */
  bottom: number;
  /**
   * Take the dock off the screen without unmounting it.
   *
   * It cannot simply not be rendered: `TabList`'s children are what declare the
   * routes, so dropping them drops the tabs themselves. Hidden, the triggers
   * still exist and the navigator still knows about every screen.
   */
  hidden?: boolean;
  /**
   * How many of the leading children ride in the pill together. The rest — in
   * practice, one — stand apart as their own circle.
   *
   * A count rather than a marker on the odd child out, because the thing the
   * parser needs from this component is its `children` prop left untouched as
   * a flat, ordered list: `TabList` reads that list straight off this
   * component to learn what routes exist, before this ever renders. Splitting
   * children out into named props (a `pill` group and a `detached` one) would
   * hide the detached trigger from that reading — the route would exist for
   * navigation but never surface as a tab.
   */
  groupSize: number;
}

/**
 * The pill, and the camera's own circle standing apart from it.
 *
 * The Action Button's target is one link, not a tab, and the two things it
 * ever chooses between — a viewfinder, a shelf of rolls — already have their
 * places in the pill. Giving the shutter a fifth slot inside that row would
 * make it look like a destination among equals; standing alone is what says
 * *this one just fires*.
 */
export function TabDock({ bottom, hidden, groupSize, children, style, ...rest }: TabDockProps) {
  const items = Children.toArray(children);
  const grouped = items.slice(0, groupSize);
  const detached = items.slice(groupSize);

  return (
    <View
      {...rest}
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[style, styles.dock, { bottom }, hidden && styles.hidden]}
    >
      <PillBar>{grouped}</PillBar>
      {detached}
    </View>
  );
}

/* --------------------------------------------------------------------- tab */

type PillTabProps = TabTriggerSlotProps & {
  /** Position in the pill. The thumb travels to the focused tab's index. */
  index: number;
  label: string;
  icon: React.ComponentType<IconProps>;
};

export const PillTab = forwardRef<View, PillTabProps>(function PillTab(
  { index, label, icon: Icon, isFocused, onPress, style: slotStyle, ...rest },
  ref,
) {
  const ctx = useContext(Ctx);
  const pillH = usePillHeight();

  // What the bar shows, which runs ahead of what the router has done. Falls
  // back to the router's own answer if this ever renders outside the bar.
  const selected = ctx ? ctx.active === index : !!isFocused;

  // The stable half of the context. Depending on `ctx` itself would re-run this
  // every time the active tab changed — and since the router lags the bar, the
  // tab still holding `isFocused` would immediately claim the thumb back and
  // the press would go nowhere.
  const focus = ctx?.focus;

  useEffect(() => {
    if (isFocused) focus?.(index);
  }, [isFocused, index, focus]);

  const tint = selected ? colors.ink : DIM;

  return (
    <Pressable
      // Spread first, never last: everything below is meant to win over what
      // the trigger passes down.
      {...rest}
      ref={ref}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onLayout={(event) => {
        const { x, width } = event.nativeEvent.layout;
        ctx?.report(index, { x, width });
      }}
      onPress={(event) => {
        // Re-tapping the tab you are already on is not navigation: no tick, and
        // nothing to wait for.
        if (selected) {
          onPress?.(event);
          return;
        }

        Haptics.selectionAsync().catch(() => {});
        // Move the thumb now and navigate when it lands, so the bar leads the
        // change rather than catching up with it.
        ctx?.focus(index, () => onPress?.(event));
      }}
      style={(state) => [
        // `TabTrigger asChild` hands this component its own style. It has to be
        // laid down first and then overridden — spreading it after ours, as
        // this did, silently discarded every dimension in `styles.tab` and left
        // the bar sizing itself to the icon.
        typeof slotStyle === 'function' ? slotStyle(state) : slotStyle,
        styles.tab,
        { minHeight: pillH - TRACK * 2 },
        state.pressed && !selected && styles.tabPressed,
      ]}
    >
      <Icon size={ICON} color={tint} />
      <Text style={[styles.tabLabel, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

/* -------------------------------------------------------------------- knob */

type CameraKnobProps = TabTriggerSlotProps & {
  label: string;
  icon: React.ComponentType<IconProps>;
  /**
   * Take the circle off the dock without unmounting it.
   *
   * With no film to shoot into, the shortcut has nowhere useful to send you —
   * `shoot.tsx` already sends the Action Button to the shelf instead, and a
   * circle that opens an empty viewfinder here would just be a second, worse
   * way to reach the same dead end. Hidden rather than absent so the trigger
   * still declares the route; the pill fills the width this leaves behind.
   */
  hidden?: boolean;
};

/**
 * The shutter, standing apart from the pill as its own black circle.
 *
 * No caption under this one and no dimming when it is not the focused route —
 * it is not a member of the set the thumb travels between, so it never reads
 * as unselected. It is a button, not a tab, and looks like one.
 */
export const CameraKnob = forwardRef<View, CameraKnobProps>(function CameraKnob(
  { label, icon: Icon, hidden, onPress, style: slotStyle, ...rest },
  ref,
) {
  const pillH = usePillHeight();

  return (
    <Pressable
      {...rest}
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(event);
      }}
      style={(state) => [
        typeof slotStyle === 'function' ? slotStyle(state) : slotStyle,
        styles.knob,
        { width: pillH, height: pillH, borderRadius: pillH / 2 },
        hidden && styles.hidden,
        state.pressed && styles.tabPressed,
      ]}
    >
      <Icon size={KNOB_ICON} color={colors.paper} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  hidden: { display: 'none' },

  pill: {
    flex: 1,
    flexDirection: 'row',
    padding: TRACK,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    // It has to read as sitting above the page, not printed on it — otherwise a
    // black capsule over a white list looks like a hole cut in the screen.
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  // Left stays 0: translateX carries the position, and a tab's reported x is
  // already relative to this same padding box.
  thumb: {
    position: 'absolute',
    left: 0,
    top: TRACK,
    bottom: TRACK,
    borderRadius: radius.pill,
    backgroundColor: colors.paper,
  },

  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // Equal thirds. The thumb takes its width from whichever tab is focused,
    // so tabs sized by their own labels give a thumb that grows and shrinks as
    // it travels — "Profile" is wider than "Film", and it showed.
    //
    // Not shrinkable beyond that: letting a tab compress is what once cropped
    // its own label inside the thumb.
    flex: 1,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
  },
  tabLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  tabPressed: { opacity: 0.6 },

  knob: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});
