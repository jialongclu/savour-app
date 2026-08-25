import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { SharedGlyph } from './Aperture';
import { useQueuedByRoll } from '@/lib/frameQueue';
import { useSteadyCounts } from '@/lib/steadyCount';
import { colors, fonts, radius, space } from '@/theme';
import { MAX_ACTIVE_ROLLS, type RollWithMembers } from '@/lib/types';

/**
 * The loaded rolls, as canisters on the viewfinder's clear base.
 *
 * One tap changes what is in the gate, and every roll stays readable without
 * opening anything. That only works because active rolls are capped at three
 * (§9.5) — the cap is what makes this viable rather than a restriction it has
 * to work around. Past four these labels stop being legible, so if the cap ever
 * rises this control has to give way to a sheet.
 *
 * Each tab is drawn as the end of a 35mm canister: a brushed metal body, the
 * spool stub poking out of the top, and the stock's label band printed across
 * it. Selecting inverts the metal to black and the band to bare — the canister
 * currently in the camera, rather than a chip that happens to be highlighted.
 */

/* ------------------------------------------------------------------ metrics */

const GAP = space.sm;

/**
 * Base showing either side of the row.
 *
 * Small on purpose: the cartridges take the width, and this is only enough of a
 * margin to keep them off the screen edges.
 */
const INSET = space.md;

const CARTRIDGE_HEIGHT = 57;

/** Air above the row, so it sits on the base rather than against the edge code. */
const PAD_TOP = space.md;

/**
 * What the row occupies in total.
 *
 * Exported because the viewfinder reserves exactly this much of the base before
 * deciding how tall the frame can be — derived rather than repeated, so padding
 * this row can never quietly push the shutter off the bottom.
 */
export const CARTRIDGE_ROW_HEIGHT = CARTRIDGE_HEIGHT + PAD_TOP;


/* -------------------------------------------------------------------- parts */

interface Props {
  rolls: RollWithMembers[];
  selectedId: string | null;
  onSelect(rollId: string): void;
}

export function Cartridges({ rolls, selectedId, onSelect }: Props) {
  const { width } = useWindowDimensions();

  // `photo_count` is the server's tally, and the server cannot see this phone's
  // queue. Shooting without signal left the label frozen at whatever it read
  // when the connection went — and online it still lagged, because the upload
  // now lands after the shutter rather than during it. Adding the queue back is
  // what makes the number match the film.
  const queued = useQueuedByRoll();

  // Held at their high-water mark — see useSteadyCounts. Without it the label
  // ticks down and back up once per frame as the queue drains.
  const shotByRoll = useSteadyCounts(
    Object.fromEntries(rolls.map((r) => [r.id, r.photo_count + (queued[r.id] ?? 0)])),
  );

  // The width, less the margins and the two gaps between them, split three
  // ways. Sized rather than flexed so a lone roll keeps the same cartridge as
  // one of three, with empty chambers beside it rather than a stretched slot.
  const cartW = Math.floor((width - INSET * 2 - GAP * 2) / 3);

  if (rolls.length === 0) return null;

  // One slot per roll the account is allowed, in the order the Film tab lists
  // them. The empties are not padding: they are the chambers still free, so the
  // base says how much room is left without a word of copy.
  const empties = Math.max(0, MAX_ACTIVE_ROLLS - rolls.length);

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {rolls.map((roll) => {
        const on = roll.id === selectedId;
        const shared = roll.members.length > 1;

        return (
          <Pressable
            key={roll.id}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync().catch(() => {});
              onSelect(roll.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              `${roll.name}, ${shotByRoll[roll.id] ?? roll.photo_count} of ${roll.max_frames} frames` +
              (shared ? `, shared with ${roll.members.length - 1} others` : '')
            }
            style={({ pressed }) => [
              styles.cart,
              on && styles.cartOn,
              { width: cartW },
              pressed && !on && styles.pressed,
            ]}
          >
            {/* Flat rectangles. The brushed-metal shell, its lit and shaded
                edges and the spool stub are gone: at a third of the screen's
                width none of it read as metal, and the label is the only part
                anyone was looking at. */}
            <View style={[styles.band, { backgroundColor: 'transparent' }]}>
              <Text
                style={[styles.name, on && styles.nameOn]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                {roll.name}
              </Text>
              {shared ? <SharedGlyph size={10} color={on ? colors.ink : colors.onDark} /> : null}
            </View>

            {/* Spelled out rather than just the exposures taken: on a control
                for choosing between rolls, how much is left is the thing you
                are actually comparing. */}
            <Text style={[styles.count, on && styles.countOn]} maxFontSizeMultiplier={1.1}>
              {shotByRoll[roll.id] ?? roll.photo_count} / {roll.max_frames}
            </Text>
          </Pressable>
        );
      })}

      {Array.from({ length: empties }, (_, i) => (
        <View
          key={`empty-${i}`}
          style={[styles.cart, styles.cartEmpty, { width: cartW }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: GAP,
    alignSelf: 'stretch',
    paddingHorizontal: INSET,
    // Air above the row, so the cartridges sit on the base rather than against
    // the edge code printed directly over them.
    paddingTop: PAD_TOP,
    // Centred. The row is always the full set of slots now — rolls first, then
    // the empty chambers — so it no longer changes width as rolls come and go,
    // and centring cannot make it shuffle sideways.
    justifyContent: 'center',
  },

  cart: {
    height: CARTRIDGE_HEIGHT,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    backgroundColor: colors.ink,
  },
  // The one in the gate inverts: white shell, black print. The inversion is
  // what says it is loaded; the hairline is only there to sit it on the base —
  // white on tan is a smaller step than black on tan, and without an edge the
  // tab reads as floating above the film rather than lying on it.
  cartOn: {
    backgroundColor: colors.onDark,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22,21,15,0.35)',
  },
  nameOn: { color: colors.ink },
  countOn: { color: colors.ink },
  pressed: { opacity: 0.7 },
  // A chamber with nothing in it: the same rectangle, drawn rather than filled.
  cartEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(22,21,15,0.28)',
  },

  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  name: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.onDark,
    flexShrink: 1,
  },
  count: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.onDark,
  },
});
