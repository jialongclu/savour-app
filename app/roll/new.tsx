import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { FREE_ROLLS, usePlus } from '@/lib/purchases';
import { createRoll, fetchMyProfile } from '@/lib/api';
import { filterById } from '@/lib/filters';
import { FILTERS, SWATCH_ASPECT, SWATCH_CROP, type SwatchCrop } from '@/lib/filters';
import { posthog } from '@/lib/posthog';
import { EXPOSURE_OPTIONS } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

export default function NewRoll() {
  const router = useRouter();
  const qc = useQueryClient();

  const { profile, session } = useAuth();
  const { plus } = usePlus();

  /**
   * The allowance, asked for fresh.
   *
   * `useAuth`'s profile is fetched once when the session appears and never
   * again, so `rolls_created` there is whatever it was at sign-in — opening
   * rolls incremented the server's count while the client went on reading a
   * number from hours ago, and the wall never came up. This asks on every open,
   * which is a request per visit to a screen nobody visits often.
   */
  const { data: me } = useQuery({
    queryKey: ['my-profile', session?.user?.id],
    queryFn: () => fetchMyProfile(session!.user.id),
    enabled: !!session?.user?.id,
    staleTime: 0,
  });

  /**
   * Whether this roll is the one past the allowance.
   *
   * Counted from the profile rather than from the rolls that exist, because
   * deleting one must not hand the allowance back. Checked at the moment of
   * opening rather than on mount, so a subscription bought on the paywall
   * takes effect without coming back here.
   */
  const spent = (me?.rolls_created ?? profile?.rolls_created ?? 0) >= FREE_ROLLS;
  const walled = spent && !plus;

  const [name, setName] = useState('');
  const [exposures, setExposures] = useState<number>(36);
  const [filter, setFilter] = useState('none');
  const chosen = filterById(filter);
  const [saving, setSaving] = useState(false);

  const valid = name.trim().length > 0 && name.trim().length <= 40;

  async function submit() {
    if (!valid) return;

    // The wall goes up here, not on the button: someone should be able to name
    // a roll and choose its stock before being asked to pay for it.
    if (walled) return router.push('/paywall');

    setSaving(true);
    try {
      const roll = await createRoll({ name, maxFrames: exposures, filter });
      posthog?.capture('roll_created', {
        max_frames: exposures,
        filter,
        has_plus: plus,
      });
      await qc.invalidateQueries({ queryKey: ['active-rolls'] });
      // The count has moved, and this screen is where that matters.
      qc.invalidateQueries({ queryKey: ['my-profile'] }).catch(() => {});
      router.replace(`/roll/share/${roll.id}`);
    } catch (e: any) {
      // The API layer already turns the roll-cap rejection into a readable
      // sentence, so there is nothing to special-case here.
      Alert.alert("Couldn't create the roll", e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.nav}>
          <Pressable onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.navTitle}>Open a roll</Text>
          <Text style={[styles.cancel, styles.invisible]}>Cancel</Text>
        </View>

        <Label style={styles.label}>Roll name</Label>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Golden hour in Lisbon"
          placeholderTextColor={colors.muted}
          maxLength={40}
          style={styles.input}
          returnKeyType="done"
        />

        <Label style={styles.label}>Exposures</Label>
        <View style={styles.segment}>
          {EXPOSURE_OPTIONS.map((n) => {
            const on = exposures === n;
            return (
              <Pressable
                key={n}
                onPress={() => setExposures(n)}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        <Label style={styles.label}>Filter</Label>

        {/* A contact sheet: every stock at once, on the same photograph, with
            the one you have chosen ringed in grease pencil.

            All three swatches are one frame put through the three looks, which
            is what makes this legible at all — they used to be three different
            photographs, so choosing between them compared subjects rather than
            stocks and the prettiest picture won whatever look it was selling. */}
        <View style={styles.sheet}>
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f.label} filter`}
                style={styles.cell}
              >
                <View style={styles.frame}>
                  <FilterSwatch
                    source={f.swatch}
                    crop={f.crop ?? SWATCH_CROP}
                    selected={false}
                  />
                  {/* Printed on the frame rather than under it, the way a stock
                      name is printed along the edge of the film itself. */}
                  <View style={styles.stockWrap} pointerEvents="none">
                    <Text style={styles.stock} numberOfLines={1}>
                      {f.label}
                    </Text>
                  </View>
                </View>

                {/* The keeper, ringed. Drawn outside the frame so the mark sits
                    on the sheet around the picture, not across it. */}
                {on ? <View style={styles.ring} pointerEvents="none" /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.hint}>
          The filter is part of the roll — it can&apos;t be changed once you start shooting.
        </Text>

        <View style={styles.flex} />
        <Button
          title={walled ? 'Continue' : 'Open a roll'}
          onPress={submit}
          disabled={!valid}
          loading={saving}
          style={{ marginBottom: space.lg }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * One filter tile, cropped by `SWATCH_CROP`.
 *
 * The photograph is laid out larger than the tile and then offset, rather than
 * leaning on `contentFit`/`contentPosition`: those can only pan across whatever
 * overflow the aspect mismatch happens to leave, which here was about 11% of
 * the height. Sizing the image ourselves means the crop can be anything.
 */
function FilterSwatch({
  source,
  crop,
  selected,
}: {
  source: ImageSourcePropType;
  crop: SwatchCrop;
  selected: boolean;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // Below 1 would letterbox the tile, which the picker has no use for.
  const zoom = Math.max(1, crop.zoom);
  const clamp = (n: number) => Math.min(1, Math.max(-1, n));

  const w = box.width * zoom;
  const h = box.height * zoom;
  // Spread the overflow either side of centre, then slide by the pan.
  const left = -((w - box.width) * (clamp(crop.x) + 1)) / 2;
  const top = -((h - box.height) * (clamp(crop.y) + 1)) / 2;

  return (
    <View style={[styles.filterSwatch, selected && styles.filterSwatchSelected]}>
      {/* Measured inside the border, so the crop maths is not two pixels out. */}
      <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
        {box.width > 0 ? (
          <Image
            source={source}
            style={{ position: 'absolute', left, top, width: w, height: h }}
            contentFit="cover"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl },
  flex: { flex: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  navTitle: { fontFamily: fonts.serifSemi, fontSize: 17, color: colors.ink },
  // A way out, not a peer of the title: grey, so the eye reaches the
  // forward action first.
  cancel: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted },
  invisible: { opacity: 0 },

  label: { marginTop: space.lg, marginBottom: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    height: 48,
    // Mono, like the other two fields in the app.
    //
    // This was the one TextInput set in `fonts.serif`, and the one rendering at
    // roughly double the advance width it should — the placeholder came out
    // tracked so wide it overflowed the field. Inter was the workaround; with
    // Inter gone, going back to the serif would bring the bug back with it.
    //
    // Mono is not a dodge. The username and share-code fields are already set
    // in it, so all three inputs now agree, and a field is the one place in the
    // app where a person is handing something to the machine rather than
    // reading what it has to say.
    fontFamily: fonts.mono,
    fontSize: 16,
    // Stated rather than left to default, so nothing can inherit tracking into
    // a field whose whole problem was tracking.
    letterSpacing: 0,
    color: colors.ink,
  },

  segment: { flexDirection: 'row', gap: space.sm },
  segmentItem: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Filled rather than tinted. With accent and ink both black there was no
  // colour left to change, and a roll's length can never be altered once set —
  // so the selected state borrows the primary button's inverted fill.
  segmentItemOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segmentLabel: { fontFamily: fonts.mono, fontSize: 16, color: colors.ink },
  segmentLabelOn: { color: colors.onDark, fontFamily: fonts.monoBold },

  // Three frames across, with room around each for the pencil ring to sit in
  // without touching its neighbour.
  sheet: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs },
  cell: { flex: 1 },
  frame: { position: 'relative' },

  stockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  stock: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: colors.onDark,
    // Nothing behind the name now, so the shadow is what keeps it off the
    // photograph — a soft dark halo reads on a bright sky where plain white
    // would dissolve, without putting a band across the bottom of the frame.
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },

  // Grease pencil. The uneven radii are the point — a ring drawn by hand does
  // not close on itself, and a perfect ellipse reads as a UI ring.
  ring: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderWidth: 2.5,
    borderColor: colors.danger,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 23,
    transform: [{ rotate: '-1.5deg' }],
    opacity: 0.9,
  },
  filterSwatch: {
    width: '100%',
    // The swatch files' own shape, so a zoom of 1 crops nothing.
    aspectRatio: SWATCH_ASPECT,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.line,
  },
  // Grey rather than ink. A black ring reads as a heavy frame around the
  // swatch and competes with the photograph it is meant to be showing off;
  // grey separates the chosen tile from the others without shouting.
  filterSwatchSelected: { borderColor: colors.muted },

  hint: { fontFamily: fonts.serif, fontSize: 13, color: colors.muted, marginTop: space.sm },
});
