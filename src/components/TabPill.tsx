import * as Haptics from 'expo-haptics';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
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
import { colors, radius, space } from '@/theme';

/** The pill stands one fifteenth of the screen tall, whatever the device. */
const SCREEN_FRACTION = 1 / 15;

/**
 * Height of the pill: the tab's own height plus the track around it.
 *
 * Taken from the window rather than fixed, so the bar holds the same share of
 * a small phone as a large one instead of dominating the short screen.
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

/**
 * Icon size.
 *
 * Larger now that it stands alone: with a label beside it the glyph was the
 * quieter half, and without one it has to carry the tab by itself.
 */
const ICON = 23;

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
 * from under the pill. A floating bar buys back the full-width tab bar's strip
 * of screen, but only if every list pays this back at the bottom.
 */
export function useTabPillClearance(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, space.lg) + usePillHeight() + space.md;
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

interface PillBarProps extends ViewProps {
  /** Distance from the bottom of the screen, safe area already accounted for. */
  bottom: number;
  /**
   * Take the bar off the screen without unmounting it.
   *
   * It cannot simply not be rendered: `TabList`'s children are what declare the
   * routes, so dropping them drops the tabs themselves. Hidden, the triggers
   * still exist and the navigator still knows about every screen.
   */
  hidden?: boolean;
}

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
 */
export function PillBar({ bottom, hidden, children, style, ...rest }: PillBarProps) {
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
      <View
        {...rest}
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[style, styles.pill, { bottom }, hidden && styles.hidden]}
      >
        {target ? <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" /> : null}
        {children}
      </View>
    </Ctx.Provider>
  );
}

/* --------------------------------------------------------------------- tab */

type PillTabProps = TabTriggerSlotProps & {
  /** Position in the bar. The thumb travels to the focused tab's index. */
  index: number;
  /**
   * The tab's name. Not drawn — the bar is glyphs only — but it is what a
   * screen reader announces, so it is required rather than decorative.
   */
  label: string;
  icon: React.ComponentType<IconProps>;
  /**
   * Take this tab off the bar without unmounting it.
   *
   * The trigger has to stay: `TabList`'s children are what declare the routes,
   * so dropping one drops the screen with it. Hidden, the route still exists
   * and the remaining tabs divide the bar between them.
   */
  hidden?: boolean;
};

export const PillTab = forwardRef<View, PillTabProps>(function PillTab(
  { index, label, icon: Icon, isFocused, onPress, hidden, style: slotStyle, ...rest },
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
    if (isFocused && !hidden) focus?.(index);
  }, [isFocused, hidden, index, focus]);

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
        // A hidden tab measures zero. Reporting that would give the thumb a
        // target with no width to travel to.
        if (hidden) return;
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
        hidden && styles.tabHidden,
        state.pressed && !selected && styles.tabPressed,
      ]}
    >
      <Icon size={ICON} color={selected ? colors.ink : DIM} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    // Full width rather than hugging its contents. A pill sized by its tabs was
    // right at two — two items leave a full-width bar looking sparse — but at
    // three they fill one honestly, and equal thirds stop a long label from
    // deciding how much room its neighbours get.
    left: space.lg,
    right: space.lg,
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
  hidden: { display: 'none' },
  tabHidden: { display: 'none' },
  thumb: {
    position: 'absolute',
    left: 0,
    top: TRACK,
    bottom: TRACK,
    borderRadius: radius.pill,
    backgroundColor: colors.paper,
  },

  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Equal thirds. The thumb takes its width from whichever tab is focused,
    // so tabs sized by their own labels give a thumb that grows and shrinks as
    // it travels — "Camera" is wider than "Film", and it showed.
    //
    // Not shrinkable beyond that: letting a tab compress is what once cropped
    // its own label inside the thumb.
    flex: 1,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
  },
  tabPressed: { opacity: 0.6 },
});
