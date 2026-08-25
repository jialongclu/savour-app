import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EdgePrint } from '@/components/EdgePrint';
import { HeldFrames } from '@/components/HeldFrames';
import { useQueuedByRoll } from '@/lib/frameQueue';
import { useSteadyCounts } from '@/lib/steadyCount';
import { useLoadedRoll } from '@/lib/loadedRoll';
import { useTabPillClearance } from '@/components/TabPill';
import { AvatarStack, Button, Label } from '@/components/ui';
import { fetchActiveRolls } from '@/lib/api';
import { colors, fonts, radius, space } from '@/theme';

export default function FilmTab() {
  const router = useRouter();

  const query = useQuery({
    queryKey: ['active-rolls'],
    queryFn: fetchActiveRolls,
  });
  const pillClearance = useTabPillClearance();
  const { load } = useLoadedRoll();
  const queued = useQueuedByRoll();

  /**
   * Every roll the server still calls active, including the ones this phone has
   * already filled.
   *
   * Those were briefly hidden here, on the reasoning that a roll you have
   * finished is not one you can shoot into. That was true and it stranded them:
   * the server has not marked them finished either — the frames proving it are
   * still queued — so they vanished from Film without arriving in Album, and
   * offline that is permanent. A filled roll stays on this list until it really
   * develops; it just stops being somewhere you can shoot.
   */
  const rolls = query.data ?? [];

  // Held at their high-water mark, so a frame leaving the queue before the
  // server's count catches up cannot walk the edge print backwards.
  const shotByRoll = useSteadyCounts(
    Object.fromEntries(rolls.map((r) => [r.id, r.photo_count + (queued[r.id] ?? 0)])),
  );

  // The header is outside the branches so the title block sits in the same
  // place whether the tab is loading, empty, or listing rolls.
  const shell = (body: React.ReactNode, title?: React.ReactNode) => (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>{title}</View>
      </View>
      {/* Above the rolls and outside the branches: frames this phone is
          holding are worth saying whether or not there is anything else on
          the screen. Renders nothing when the queue is clear. */}
      <View style={styles.notice}>
        <HeldFrames />
      </View>
      {body}
    </SafeAreaView>
  );

  if (query.isLoading) {
    return shell(
      <View style={styles.center}>
        <ActivityIndicator color={colors.muted} />
      </View>,
    );
  }

  // Outside the shell, unlike every other branch. The shell's header is 20pt of
  // padding around a title this branch does not have, and the camera's matching
  // empty state has no header at all — so routing this through it centred the
  // two screens ten points apart. Held frames still show, since those are real
  // and worth the space they take.
  if (rolls.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.notice}>
          <HeldFrames />
        </View>
        <View style={[styles.empty, { paddingBottom: pillClearance }]}>
          <Text style={styles.emptyTitle}>No rolls</Text>
          <Text style={styles.emptyBody}>
            Open a roll, or join one a friend has already created.
          </Text>
          <Button title="Open a roll" onPress={() => router.push('/roll/new')} style={styles.cta} />
          {/* Stretched to match the primary above it: two pills of different
              widths in a centred column read as a mistake, not a hierarchy. */}
          <Button
            title="Join a roll"
            variant="ghost"
            onPress={() => router.push('/roll/join')}
            style={styles.ctaSecondary}
          />
        </View>
      </SafeAreaView>
    );
  }

  return shell(
    <ScrollView contentContainerStyle={[styles.list, { paddingBottom: pillClearance }]}>
      {rolls.map((roll) => {
        // The same local truth the cartridges show: what this phone has shot,
        // whether or not the server has heard about it yet.
        const shot = shotByRoll[roll.id] ?? roll.photo_count;
        const full = shot >= roll.max_frames;
        const waiting = queued[roll.id] ?? 0;
        const people = roll.members
          .map((m) => m.profile)
          .filter((p): p is NonNullable<typeof p> => !!p);

        return (
          <View key={roll.id} style={styles.card}>
            <Pressable
              // Nothing to open. A filled roll has no frames left to shoot and
              // no album to read until it develops, so the card states where it
              // is rather than pretending to lead somewhere.
              disabled={full}
              onPress={() => {
                load(roll.id);
                router.push('/camera');
              }}
              accessibilityRole={full ? 'text' : 'button'}
              accessibilityLabel={
                full
                  ? `${roll.name}, full and waiting to develop`
                  : `Shoot into ${roll.name}, ${shot} of ${roll.max_frames} frames`
              }
            >
              <View style={styles.cardTop}>
                <Text style={styles.rollName} numberOfLines={1}>
                  {roll.name}
                </Text>
                <Text style={styles.count}>
                  {shot} / {roll.max_frames}
                </Text>
              </View>

              <EdgePrint exposed={shot} total={roll.max_frames} />
            </Pressable>

            {/* Code on the left, who is shooting on the right. Only the code
                  is pressable — the avatars aren't a copy target. */}
            <View style={styles.codeRow}>
              {full ? (
                <Text style={styles.waiting}>
                  {waiting > 0 ? 'Developing when connected to internet' : 'Developing…'}
                </Text>
              ) : (
              <Pressable
                style={styles.codeLeft}
                onPress={async () => {
                  await Clipboard.setStringAsync(roll.share_code);
                  Haptics.selectionAsync().catch(() => {});
                  Alert.alert('Copied', `Share code ${roll.share_code}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Copy share code ${roll.share_code}`}
              >
                <Label>Code</Label>
                <Text style={styles.code}>{roll.share_code}</Text>
              </Pressable>
              )}

              <AvatarStack people={people} size={28} />
            </View>
          </View>
        );
      })}

      <Button
        title="Open a roll"
        onPress={() => router.push('/roll/new')}
        style={{ marginTop: space.sm }}
      />
      <Button
        title="Join a roll"
        variant="ghost"
        onPress={() => router.push('/roll/join')}
        style={{ marginTop: space.sm }}
      />
    </ScrollView>,
    <>
      <Text style={styles.heading}>Active Films</Text>
      <Label>
        {rolls.length} {rolls.length === 1 ? 'roll' : 'rolls'} in progress
      </Label>
    </>,
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerTitle: { flex: 1 },
  notice: { paddingHorizontal: space.xl },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  heading: {
    fontFamily: fonts.serifSemi,
    fontSize: 30,
    // Matched to the gear's 34pt box so the two sit on the same optical line.
    lineHeight: 34,
    color: colors.ink,
    letterSpacing: -0.4,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.md,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rollName: {
    fontFamily: fonts.serifSemi,
    fontSize: 18,
    color: colors.ink,
    flex: 1,
  },
  waiting: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.muted,
    flexShrink: 1,
  },
  count: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.accent,
    marginLeft: space.sm,
  },

  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Split evenly around the divider so margin-plus-padding totals the same
    // gap the strip keeps from the title above it, not double it.
    marginTop: space.xs,
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: 'dashed',
  },
  codeLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  code: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: 2,
  },

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
  cta: { alignSelf: 'stretch', marginTop: space.xl, marginBottom: space.sm },
  ctaSecondary: { alignSelf: 'stretch' },
});
