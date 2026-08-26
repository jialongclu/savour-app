import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlbumMenu } from '@/components/AlbumMenu';
import { FilmProgress } from '@/components/FilmProgress';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, AvatarStack, Label } from '@/components/ui';
import { hidePhoto, leaveRoll, reportPhoto, unhidePhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSaveProgress } from '@/lib/download';
import { aspectOf, useAlbum, type Frame } from '@/lib/useAlbum';
import { colors, fonts, space } from '@/theme';
import type { Profile } from '@/lib/types';

export default function Album() {
  const { rollId } = useLocalSearchParams<{ rollId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuth();
  const { width } = useWindowDimensions();

  const { data, isLoading } = useAlbum(rollId);

  // Watched here rather than owned by the menu: the save keeps running after
  // the menu closes, and this screen is what stays on to report it.
  const saving = useSaveProgress(rollId);

  // The same action the album's card carries on the Album tab, so it can be
  // reached from inside the album too rather than only from the grid.
  const remove = useMutation({
    mutationFn: () => leaveRoll(rollId!),
    onSuccess: () => {
      qc.setQueryData<{ id: string }[]>(['finished-rolls'], (prev) =>
        (prev ?? []).filter((r) => r.id !== rollId),
      );
      qc.invalidateQueries({ queryKey: ['finished-rolls'] }).catch(() => {});
      // Staying would leave you looking at an album you are no longer in, whose
      // frames are about to stop being readable.
      router.replace('/(tabs)');
    },
    onError: (e: any) =>
      Alert.alert("Couldn't leave that album", e?.message ?? 'Please try again.'),
  });

  // The stored width/height is only a hint — frames shot before the capture
  // pipeline corrected orientation carry it backwards, and older ones carry
  // nothing at all, which is what made every tile the same shape. The decoded
  // image reports the truth, so each print corrects its own aspect on load.
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const onPrintLoad = useCallback((id: string, e: ImageLoadEventData) => {
    const { width: w, height: h } = e.source ?? {};
    if (!w || !h) return;
    setMeasured((prev) => (prev[id] ? prev : { ...prev, [id]: w / h }));
  }, []);

  if (isLoading || !data?.roll) {
    // Header renders here too, so there is always a way back out while loading.
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right']}>
        <ScreenHeader />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </SafeAreaView>
    );
  }

  const { roll, frames } = data;

  function onFrameLongPress(frame: Frame) {
    const mine = frame.user_id === session?.user.id;

    Alert.alert(frame.hidden_at ? 'Hidden frame' : `Frame ${frame.frame_number}`, undefined, [
      frame.hidden_at
        ? {
            text: 'Unhide',
            onPress: async () => {
              try {
                await unhidePhoto(frame.id);
                qc.invalidateQueries({ queryKey: ['album', rollId] });
              } catch (e: any) {
                Alert.alert("Couldn't unhide", e?.message ?? '');
              }
            },
          }
        : {
            text: 'Hide this photo',
            onPress: async () => {
              try {
                await hidePhoto(frame.id);
                qc.invalidateQueries({ queryKey: ['album', rollId] });
              } catch (e: any) {
                Alert.alert("Couldn't hide", e?.message ?? '');
              }
            },
          },
      ...(mine
        ? []
        : [
            {
              text: 'Report photo',
              style: 'destructive' as const,
              onPress: () => promptReport(frame),
            },
          ]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function promptReport(frame: Frame) {
    const reasons = ['nudity', 'violence', 'harassment', 'other'] as const;
    Alert.alert('Report photo', 'Why are you reporting this?', [
      ...reasons.map((reason) => ({
        text: reason[0].toUpperCase() + reason.slice(1),
        onPress: async () => {
          if (!session?.user) return;
          try {
            await reportPhoto({ photoId: frame.id, reporterId: session.user.id, reason });
            await hidePhoto(frame.id).catch(() => {});
            qc.invalidateQueries({ queryKey: ['album', rollId] });
            Alert.alert('Reported', "We'll take a look. The photo is hidden for you now.");
          } catch (e: any) {
            Alert.alert("Couldn't report", e?.message ?? '');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  // Two staggered columns preserving each frame's own shape (§7.5).
  //
  // Frames go to whichever column is currently shortest rather than simply
  // alternating: a tall portrait next to a short landscape otherwise drags one
  // column far past the other and leaves a dead strip down the page.
  const colWidth = (width - space.lg * 2 - space.sm) / 2;
  const aspectFor = (f: Frame) => (f.hidden_at ? 3 / 4 : (measured[f.id] ?? aspectOf(f)));

  const columns: Frame[][] = [[], []];
  const columnHeights = [0, 0];
  frames.forEach((f) => {
    const shortest = columnHeights[0] <= columnHeights[1] ? 0 : 1;
    columns[shortest].push(f);
    columnHeights[shortest] += colWidth / aspectFor(f) + space.sm;
  });

  const people = roll.members
    .map((m) => m.profile)
    .filter((p): p is Profile => !!p);

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <ScreenHeader
        title={roll.name}
        right={<AlbumMenu roll={roll} onDelete={() => remove.mutate()} canSave />}
      />

      {/* Under the header and above the grid, where the rule between them
          already is. Nothing moves to make room for it — the track is always
          the same height and simply has nothing in it most of the time. */}
      <FilmProgress progress={saving} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* One line above the grid: how much is here, and who shot it. */}
        <View style={styles.metaRow}>
          <Label>
            {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
          </Label>
          <AvatarStack people={people} size={28} />
        </View>

        <View style={styles.album}>
          {columns.map((col, ci) => (
            <View key={ci} style={styles.column}>
              {col.map((frame) => (
                <Pressable
                  key={frame.id}
                  onPress={() =>
                    !frame.hidden_at &&
                    router.push(`/photo/${rollId}?frame=${frame.frame_number}`)
                  }
                  onLongPress={() => onFrameLongPress(frame)}
                  delayLongPress={350}
                  accessibilityRole="button"
                  accessibilityLabel={`Frame ${frame.frame_number}, open full size`}
                  style={styles.print}
                >
                  {frame.hidden_at ? (
                    <View style={[styles.photo, styles.hidden, { aspectRatio: 3 / 4 }]}>
                      <Text style={styles.hiddenText}>hidden</Text>
                    </View>
                  ) : (
                    <Image
                      // Keyed on the storage path, not the URL: a signed URL
                      // is a new string every time it is re-signed, and
                      // without a stable key each re-sign would miss the disk
                      // cache and pull every frame down again.
                      source={{ uri: frame.url ?? undefined, cacheKey: frame.storage_path }}
                      // Kept in memory as well as on disk: a grid is scrolled
                      // back and forth, and re-decoding a full-resolution frame
                      // each time it returns is the expensive half.
                      cachePolicy="memory-disk"
                      style={[styles.photo, { aspectRatio: aspectFor(frame) }]}
                      contentFit="cover"
                      transition={160}
                      onLoad={(e) => onPrintLoad(frame.id, e)}
                    />
                  )}

                  {frame.shooter && !frame.hidden_at && (
                    <View style={styles.by}>
                      <Avatar
                        username={frame.shooter.username}
                        url={frame.shooter.avatar_url}
                        size={20}
                        border={colors.surface}
                      />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },

  album: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  column: { flex: 1, gap: space.sm },
  print: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  photo: { width: '100%', backgroundColor: colors.line },
  hidden: { alignItems: 'center', justifyContent: 'center' },
  hiddenText: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  by: { position: 'absolute', right: 8, bottom: 8 },
});
