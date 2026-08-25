import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { flushFrames } from '@/lib/api';
import { discardStuckFrames, retryStuckFrames, useStuckFrames } from '@/lib/frameQueue';
import { colors, fonts, radius, space } from '@/theme';
import type { RollWithMembers } from '@/lib/types';

/**
 * Frames this phone is holding and cannot deliver.
 *
 * The queue exists so that no photograph is lost to a bad connection, and a
 * frame it has given up on defeats that quietly — the file is still on disk,
 * but nobody is told, and nobody can act. This is the telling.
 *
 * It sits on the Film tab rather than behind a settings screen because it is
 * about photographs someone took minutes ago, and it costs nothing to show
 * when the queue is empty: it renders nothing at all.
 */
export function HeldFrames() {
  const held = useStuckFrames();
  const qc = useQueryClient();

  if (held.length === 0) return null;

  // Named where the name is known. A roll that has since developed may be gone
  // from the active list, and "a roll you were shooting" is more honest than a
  // uuid.
  const active = qc.getQueryData<RollWithMembers[]>(['active-rolls']) ?? [];
  const names = new Set(
    held.map((f) => active.find((r) => r.id === f.rollId)?.name).filter((n): n is string => !!n),
  );

  const what = held.length === 1 ? 'One frame' : `${held.length} frames`;
  const where =
    names.size === 1 ? ` from ${[...names][0]}` : names.size > 1 ? ' from your rolls' : '';

  async function again() {
    Haptics.selectionAsync().catch(() => {});
    await retryStuckFrames();
    flushFrames().catch(() => {});
  }

  function discard() {
    Alert.alert(
      held.length === 1 ? 'Discard this frame?' : `Discard ${held.length} frames?`,
      'The photograph is deleted from this phone. It was never added to the roll, so there is ' +
        'nowhere else it exists.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            discardStuckFrames().catch(() => {});
          },
        },
      ],
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {what}
        {where} couldn&apos;t be added
      </Text>
      {/* Deliberately not the server's own words. What came back here was
          "fetch failed: UnexpectedException … (at ExpoModulesCore/Promise.swift:56)",
          which tells a shooter nothing they can act on and reads as a crash.
          Losing signal no longer reaches this notice at all, so what remains
          really is the roll refusing them. */}
      <Text style={styles.body}>
        The roll stopped accepting frames before these reached it. They are still on this phone.
      </Text>

      <View style={styles.actions}>
        <Pressable onPress={again} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.action}>Try again</Text>
        </Pressable>
        <Pressable onPress={discard} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.action, styles.danger]}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outlined rather than filled: this is a notice, not an error state, and the
  // roll cards below it are the thing the screen is actually for.
  card: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.card,
    padding: space.lg,
    marginBottom: space.md,
  },
  title: { fontFamily: fonts.serifSemi, fontSize: 16, color: colors.ink },
  body: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: space.xs,
  },
  actions: { flexDirection: 'row', gap: space.xl, marginTop: space.md },
  action: { fontFamily: fonts.serifSemi, fontSize: 15, color: colors.ink },
  danger: { color: colors.danger },
});
