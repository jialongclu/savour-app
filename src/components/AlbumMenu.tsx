import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
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
import { askPhotoAccess, photoAccess, saveAlbumInBackground } from '@/lib/download';
import { colors, fonts, radius, space } from '@/theme';
import type { RollWithMembers } from '@/lib/types';

interface Props {
  roll: RollWithMembers;
  onDelete(): void | Promise<void>;
  /**
   * Whether this menu offers to save the roll to Photos.
   *
   * Only inside an album. On a cover in the list the offer is abstract — it
   * asks someone to commit their phone to a few hundred megabytes of
   * photographs they are not currently looking at, from a menu they most likely
   * opened to do something else. Inside, the frames are on screen, the album's
   * own progress runs under its header, and the request has an obvious subject.
   */
  canSave?: boolean;
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

export function AlbumMenu({ roll, onDelete, canSave = false }: Props) {
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
   * Ask before the system does.
   *
   * iOS gives one photo-library prompt per install. Answer it wrongly — or tap
   * it away while wondering what it is for — and the only route back is
   * Settings, which most people will not find and none should have to. So the
   * reason goes first, in the app's own words, and the system prompt follows a
   * deliberate Continue.
   *
   * Resolves false when there is no point going on.
   */
  async function ensureAccess(): Promise<boolean> {
    const access = await photoAccess();
    if (access === 'granted') return true;

    if (access === 'blocked') {
      return new Promise((resolve) => {
        Alert.alert(
          'Photo access is off',
          'Savour cannot reach your photo library, so there is nowhere to put this roll. ' +
            'You can turn it back on in Settings.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings().catch(() => {});
                resolve(false);
              },
            },
          ],
        );
      });
    }

    const agreed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Save this roll to your photos?',
        `Savour needs access to your photo library to put the frames from “${roll.name}” in it. ` +
          'Choosing “All Photos” also lets it file them into an album named after the roll; ' +
          '“Add Photos Only” saves them loose.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ],
      );
    });

    if (!agreed) return false;
    return askPhotoAccess();
  }

  /**
   * Hand the save off and close.
   *
   * The menu used to stay open over a percentage until the last frame landed.
   * Nothing about the work needed anyone to watch it, so this returns the screen
   * immediately: the film band under the album's header carries the progress,
   * and this speaks up once, at the end.
   *
   * Permission is settled first and on the caller's clock, before any work
   * starts. Asking from inside the save would put a system sheet in front of
   * somebody who had already been told their photographs were on their way.
   *
   * The save itself is deliberately not awaited and holds no component state: it
   * keeps running if this menu unmounts, or if its whole screen does.
   */
  function save() {
    close(async () => {
      if (!(await ensureAccess())) return;

      const started = saveAlbumInBackground(roll.id, {
        onDone: ({ saved, failed, hidden, grouped }) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

          // Facts of different kinds. Frames saved is the outcome; where they
          // ended up depends on a permission the person may not have given;
          // hidden frames are a decision they already made and are owed an
          // account of; failures are the only part worth trying again.
          const lines = [
            grouped
              ? `${saved} ${saved === 1 ? 'frame is' : 'frames are'} in an album called “${roll.name}”.`
              : `${saved} ${saved === 1 ? 'frame is' : 'frames are'} in your library. ` +
                'They could not be put in an album — Savour only has permission to add photos, ' +
                'not to organise them.',
          ];
          if (hidden > 0) {
            lines.push(
              hidden === 1
                ? 'One hidden frame was left out.'
                : `${hidden} hidden frames were left out.`,
            );
          }
          if (failed > 0) {
            lines.push(`${failed} could not be fetched — try again for those.`);
          }

          Alert.alert(
            failed === 0 ? 'Saved to Photos' : 'Saved, with some missing',
            lines.join('\n\n'),
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
            {/* Saving comes first where it appears at all: it is the
                reversible one, and putting a destructive action at the top of a
                two-item menu is how people tap it by accident. */}
            {canSave ? (
              <>
                <Pressable
                  onPress={save}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <Text style={styles.action}>Save to Photos</Text>
                </Pressable>

                <View style={styles.rule} />
              </>
            ) : null}

            {/* One wording either way. What actually happens still differs —
                a solo roll is destroyed — but that belongs in the confirmation
                that follows, not in a menu item read at a glance. */}
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
