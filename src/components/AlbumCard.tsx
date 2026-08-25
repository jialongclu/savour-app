import { Image, type ImageLoadEventData } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AlbumMenu } from './AlbumMenu';
import { relativeDate } from '@/lib/format';
import { colors, fonts, radius, space } from '@/theme';
import type { Profile, RollWithMembers } from '@/lib/types';

interface Props {
  roll: RollWithMembers;
  /** Leave or delete. Rendered as a bubble anchored to the card. */
  onDelete(): void | Promise<void>;
  /** Cover first, then up to two more for the cards stacked behind it. */
  covers: (string | null)[];
  /**
   * The cover's shape, from its stored dimensions. Only a hint — the image
   * corrects it on load, the same way the album's prints do.
   */
  coverAspect?: number | null;
  onPress: () => void;
}

/** Until a cover's real shape is known, hold the space it most likely wants. */
const FALLBACK_ASPECT = 4 / 5;

const CARD_RADIUS = radius.card;
const PEEK = 9; // How far each card behind the cover shows above it.

/**
 * A developed roll, drawn as a stack of prints rather than a single image:
 * two slivers behind the cover say there is more inside without spending any
 * space on it, and make the card read as something you open.
 */
export function AlbumCard({ roll, covers, coverAspect, onDelete, onPress }: Props) {
  const [cover, second, third] = covers;

  // The stored dimensions are a hint; frames shot before the capture pipeline
  // recorded them have none at all. The decoded image reports the truth.
  const [measured, setMeasured] = useState<number | null>(null);

  const onCoverLoad = useCallback((e: ImageLoadEventData) => {
    const { width, height } = e.source ?? {};
    if (width && height && height > 0) setMeasured(width / height);
  }, []);

  const aspect = measured ?? coverAspect ?? FALLBACK_ASPECT;

  // Both branches read the same clock — developing early changes the wording,
  // not the granularity, so a card never sits next to one measuring time
  // differently.
  const when = relativeDate(roll.finished_at);

  const people = roll.members.map((m) => m.profile).filter((p): p is Profile => !!p);

  const names = people.map((p) => `@${p.username}`).join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${roll.name}, ${roll.photo_count} frames. Open album.`}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      {/* Furthest back, narrowest — drawn first so it sits lowest. */}
      <View style={[styles.behind, styles.behindFar]}>
        {third || second || cover ? (
          <Image
            source={{ uri: (third ?? second ?? cover)! }}
            style={styles.behindImage}
            contentFit="cover"
          />
        ) : null}
      </View>

      <View style={[styles.behind, styles.behindNear]}>
        {second || cover ? (
          <Image
            source={{ uri: (second ?? cover)! }}
            style={styles.behindImage}
            contentFit="cover"
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={[styles.photoWrap, { aspectRatio: aspect }]}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={styles.photo}
              // The box is the photograph's own shape, so `cover` scales it to
              // fit exactly and takes nothing off any edge.
              contentFit="cover"
              onLoad={onCoverLoad}
              transition={180}
            />
          ) : (
            <View style={[styles.photo, styles.photoBlank]} />
          )}

          {/* The photo dissolves into the panel rather than stopping at a hard
              line. Nothing is cropped any more, so this is softening the seam
              between print and card, not hiding a cut. */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.72)', colors.surface]}
            locations={[0, 0.55, 1]}
            style={styles.fade}
            pointerEvents="none"
          />
        </View>

        {/* Top right of the card, over the print. Its grey disc is what keeps
            it legible against whatever photograph is underneath. */}
        <View style={styles.menu}>
          <AlbumMenu roll={roll} onDelete={onDelete} />
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {roll.name}
          </Text>

          {/* Names only — every shooter is spelled out rather than reduced to
              a stack of faces that runs out of room. */}
          <Text style={styles.names} numberOfLines={2}>
            {names}
          </Text>

          <Text style={styles.stamp}>
            {roll.photo_count} {roll.photo_count === 1 ? 'FRAME' : 'FRAMES'} ·{' '}
            {roll.developed_early ? `DEVELOPED ${when}` : when}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.xl, paddingTop: PEEK * 2 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.994 }] },

  behind: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 60,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.line,
    alignSelf: 'center',
    // Matching edge on the slivers, or the stack looks like one bordered card
    // sitting on two unbordered smudges.
    borderWidth: 1,
    borderColor: colors.line,
  },
  // Each sliver casts its own shadow onto the one below, so the stack has
  // depth all the way down instead of only under the top card.
  behindFar: {
    top: 0,
    marginHorizontal: '9%',
    opacity: 0.55,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  behindNear: {
    top: PEEK,
    marginHorizontal: '4.5%',
    opacity: 0.8,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  behindImage: { width: '100%', height: '100%' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    // The card and the page are both white, so without an edge the panel is
    // held apart from the background by its shadow alone.
    borderWidth: 1,
    borderColor: colors.line,
    // The cover sits well clear of the page, so the two slivers behind it read
    // as a stack with real depth rather than as printed edges.
    shadowColor: '#000000',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  photoWrap: { width: '100%', backgroundColor: colors.line },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  photo: { width: '100%', height: '100%' },
  photoBlank: { backgroundColor: colors.line },

  info: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.lg },
  // Above the photograph in stacking order, so it is never behind the print.
  menu: { position: 'absolute', top: space.sm, right: space.sm, zIndex: 2 },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 30,
    // Roll names run to 40 characters, so this one wraps in practice. Left to
    // the default, the second line falls far too far from the first.
    lineHeight: 33,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  names: {
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    // Tucked straight under the title rather than held off it: the two are the
    // album's name and whose it is, which is one idea, not two.
    marginTop: 2,
  },
  stamp: {
    // The serif, like the title and the credit above it — the card is set in
    // one voice now. Caps and the tracking stay: they are what keep this
    // reading as a stamp rather than as a third line of prose.
    fontFamily: fonts.serifSemi,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.muted,
    // Tight to the credit above it. The two belong together — who shot the
    // roll and when it developed are one caption, not two — so the gap that
    // separates them should be smaller than the one holding them off the title.
    marginTop: space.xs,
  },
});
