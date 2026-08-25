import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MoreGlyph } from './Aperture';
import { saveAlbumInBackground } from '@/lib/download';
import { colors, fonts, radius, space } from '@/theme';
import type { RollWithMembers } from '@/lib/types';

interface Props {
  roll: RollWithMembers;
  onDelete(): void | Promise<void>;
}

/**
 * The album's own actions, in a bubble anchored to its card.
 *
 * A `Modal` rather than an absolutely-positioned view, because the card sits
 * inside a `FlatList` with `overflow: hidden` on its own surface — a bubble
 * drawn in place would be clipped by the card it belongs to. The modal is
 * transparent and full-screen, so the backdrop is also what dismisses it.
 */
/** Out of the button. Long enough to be a movement rather than a state change. */
const OPEN_MS = 260;
/** Back into it. Quicker — a thing being put away does not need admiring. */
const CLOSE_MS = 150;

/** Arrives and stops. The same curve the tab bar's thumb travels on. */
const OPEN_EASE = Easing.bezier(0.2, 0.9, 0.2, 1);

/**
 * How small it starts, as a share of full size.
 *
 * Near enough the trigger's 32pt against the bubble's ~190pt, so the first
 * frame is the size of the dots it is coming out of rather than a small copy
 * of the finished bubble.
 */
const FROM = 0.16;

export function AlbumMenu({ roll, onDelete }: Props) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number }>({
    top: 0,
    right: space.xl,
  });
  const trigger = useRef<View>(null);
  const { width: screenW } = useWindowDimensions();

  // Grown from its own top-right corner, which is the corner sitting on the
  // dots — so it reads as coming out of the button rather than appearing near
  // it.
  const grow = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    grow.set(0);
    grow.set(withTiming(1, { duration: OPEN_MS, easing: OPEN_EASE }));
  }, [visible, grow]);

  const growStyle = useAnimatedStyle(() => {
    const g = grow.get();
    return {
      // Opacity runs ahead of the scale so the bubble is solid almost at once.
      // Fading at the same rate as it grows makes it look like it is arriving
      // from behind the screen rather than out of the button.
      opacity: Math.min(1, g * 3),
      transform: [{ scale: FROM + (1 - FROM) * g }],
    };
  });

  // Unmounted only once it has finished retracting, or the bubble would vanish
  // mid-animation — which is what the modal's own dismissal used to do.
  const settle = useCallback((after?: () => void) => {
    setVisible(false);
    after?.();
  }, []);

  const close = useCallback(
    (after?: () => void) => {
      grow.set(
        withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
          'worklet';
          if (done) scheduleOnRN(settle, after);
        }),
      );
    },
    [grow, settle],
  );

  const shared = roll.members.length > 1;

  /**
   * Hand the save off and close.
   *
   * The menu used to stay open over a percentage until the last frame landed.
   * Nothing about the work needed anyone to watch it, so this now returns the
   * screen immediately and speaks up once, at the end — the tap is
   * acknowledged by the menu closing and a knock of haptic feedback, and the
   * first run raises the system permission sheet anyway.
   *
   * Deliberately not awaited, and deliberately not holding component state: the
   * save keeps running if this menu unmounts, or if its whole screen does.
   */
  function save() {
    close(() => {
      const started = saveAlbumInBackground(roll.id, {
        onDone: ({ saved, failed }) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Alert.alert(
            failed === 0 ? 'Saved to Photos' : 'Saved, with some missing',
            failed === 0
              ? `${saved} ${saved === 1 ? 'frame is' : 'frames are'} in an album called “${roll.name}”.`
              : `${saved} saved, ${failed} could not be fetched. Try again for the rest.`,
          );
        },
        onFail: (message) => Alert.alert("Couldn't save this album", message),
      });

      if (started) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        Alert.alert(
          'Already saving',
          `“${roll.name}” is still being saved. You will hear when it finishes.`,
        );
      }
    });
  }

  function confirm() {
    close();

    // Two different consequences, so two different warnings. Telling someone
    // their photographs are about to be destroyed when they are not — or
    // failing to when they are — is the only thing this dialog exists for.
    const body = shared
      ? 'This removes the album from your library. The frames you shot stay in it ' +
        'for everyone else, and someone else takes over the roll.'
      : 'You are the only one on this roll, so the album and every frame in it are ' +
        'deleted for good.';

    Alert.alert(shared ? 'Leave this album?' : 'Delete this album?', body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: shared ? 'Leave' : 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          onDelete();
        },
      },
    ]);
  }

  return (
    <>
      <Pressable
        ref={trigger}
        onPress={() => {
          // The button's own corner, not the tap's. A tap lands anywhere inside
          // the disc, so anchoring to it put the bubble in a slightly different
          // place every time — and never quite on the dots.
          trigger.current?.measureInWindow((x, y, w) => {
            setAnchor({ top: y, right: Math.max(space.sm, screenW - (x + w)) });
            setVisible(true);
          });
        }}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${roll.name}`}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <MoreGlyph size={16} color={colors.ink} />
      </Pressable>

      {/* No fade of its own: the bubble does its own growing, and two
          animations on one thing fight each other. */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()}>
        <Pressable style={styles.backdrop} onPress={() => close()}>
          <Animated.View
            // Top-right corner laid exactly over the trigger's, so the bubble
            // covers the dots it came out of.
            style={[styles.bubble, { top: anchor.top, right: anchor.right }, growStyle]}
          >
            {/* One wording either way. What actually happens still differs —
                a solo roll is destroyed — but that belongs in the confirmation
                that follows, not in a menu item read at a glance. */}
            {/* Saving comes first: it is the reversible one, and putting a
                destructive action at the top of a two-item menu is how people
                tap it by accident. */}
            <Pressable
              onPress={save}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text style={styles.action}>Save to Photos</Text>
            </Pressable>

            <View style={styles.rule} />

            <Pressable
              onPress={confirm}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text style={styles.danger}>Leave Album</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 32,
    height: 32,
    borderRadius: 16,
    // A grey disc rather than three dots floating beside the title. On a white
    // card the dots alone read as punctuation; the fill is what says this is a
    // control you can press.
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: '#E0E0E0' },

  backdrop: { flex: 1 },
  bubble: {
    position: 'absolute',
    // The corner pinned to the dots is the corner it grows out of. Without
    // this the scale runs from the middle and the bubble swells in place.
    transformOrigin: 'top right',
    minWidth: 190,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: space.xs,
    // Lifted well clear of the card it opened from.
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginHorizontal: space.md },
  action: { fontFamily: fonts.serifSemi, fontSize: 16, color: colors.ink },
  itemPressed: { opacity: 0.55 },
  // The button face — same as "Open a roll" and every other action in the app.
  danger: { fontFamily: fonts.serifSemi, fontSize: 16, color: colors.danger },
});
