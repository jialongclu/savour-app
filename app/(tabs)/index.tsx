import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlbumCard } from '@/components/AlbumCard';
import { useTabPillClearance } from '@/components/TabPill';
import { Button } from '@/components/ui';
import { fetchFinishedRolls, fetchPhotos, leaveRoll, signPhotoUrls } from '@/lib/api';
import { aspectOf } from '@/lib/useAlbum';
import { colors, fonts, space } from '@/theme';
import type { RollWithMembers } from '@/lib/types';

interface RollCard extends RollWithMembers {
  /** Cover plus up to two more, for the cards stacked behind it. */
  covers: (string | null)[];
  /** The cover's shape, so the card can take it instead of cropping to a box. */
  coverAspect: number | null;
}

export default function Home() {
  const router = useRouter();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['finished-rolls'],
    queryFn: async (): Promise<RollCard[]> => {
      const rolls = await fetchFinishedRolls();

      // Three frames per roll: the cover, plus two peeking out behind it. The
      // whole photo is kept rather than just its path, because the card now
      // takes its shape from the cover instead of cropping it to a fixed box.
      const perRoll = await Promise.all(
        rolls.map(async (roll) => {
          const photos = await fetchPhotos(roll.id);
          return photos.filter((p) => !p.hidden_at).slice(0, 3);
        }),
      );

      const signed = await signPhotoUrls(perRoll.flat().map((p) => p.storage_path));

      return rolls.map((roll, i) => ({
        ...roll,
        covers: perRoll[i].map((p) => signed[p.storage_path] ?? null),
        coverAspect: perRoll[i][0] ? aspectOf(perRoll[i][0]) : null,
      }));
    },
  });

  const rolls = query.data ?? [];
  const pillClearance = useTabPillClearance();

  const remove = useMutation({
    mutationFn: (rollId: string) => leaveRoll(rollId),
    // Dropped from the cache before the refetch lands, so the card goes the
    // moment it is confirmed rather than a round trip later.
    onSuccess: (_data, rollId) => {
      qc.setQueryData<RollCard[]>(['finished-rolls'], (prev) =>
        (prev ?? []).filter((r) => r.id !== rollId),
      );
      qc.invalidateQueries({ queryKey: ['finished-rolls'] }).catch(() => {});
    },
    onError: (e: any) =>
      Alert.alert("Couldn't remove that album", e?.message ?? 'Please try again.'),
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : rolls.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={styles.listWrap}>
          <FlatList
            data={rolls}
            keyExtractor={(r) => r.id}
            contentContainerStyle={[styles.list, { paddingBottom: pillClearance }]}
            refreshControl={
              <RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />
            }
            renderItem={({ item }) => (
              <AlbumCard
                roll={item}
                covers={item.covers}
                coverAspect={item.coverAspect}
                onDelete={() => remove.mutate(item.id)}
                onPress={() => router.push(`/album/${item.id}`)}
              />
            )}
          />

          {/* The grid runs under the foot of the screen rather than stopping at
              it: a shadow rising off the bottom edge puts the last card behind
              something instead of letting it end on a clean cut. */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.09)']}
            style={styles.listShadow}
            pointerEvents="none"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function EmptyState() {
  const router = useRouter();
  const pillClearance = useTabPillClearance();

  return (
    <View style={[styles.empty, { paddingBottom: pillClearance }]}>
      <Text style={styles.emptyTitle}>Nothing developed yet</Text>
      <Text style={styles.emptyBody}>
        Rolls appear here once every shot is used. Shoot one, or join a friend&apos;s with their
        code.
      </Text>
      <Button title="Open a roll" onPress={() => router.push('/roll/new')} style={styles.cta} />
      {/* Stretched to match the primary above it, same as Film's empty state. */}
      <Button
        title="Join a roll"
        variant="ghost"
        onPress={() => router.push('/roll/join')}
        style={styles.ctaSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listWrap: { flex: 1 },
  list: {
    paddingHorizontal: space.xl,
    // The gear that used to sit above the grid took its header with it, so the
    // air it provided is carried here instead — the first card should not open
    // hard against the safe area.
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  listShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 92,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  emptyTitle: { fontFamily: fonts.serifSemi, fontSize: 22, color: colors.ink },
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
