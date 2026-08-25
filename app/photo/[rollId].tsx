import { Image, type ImageLoadEventData } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft } from '@/components/Aperture';
import { Avatar } from '@/components/ui';
import { aspectOf, useAlbum, type Frame } from '@/lib/useAlbum';
import { colors, fonts, space } from '@/theme';

/** Chrome reserved above and below the print, so the photo is never under it. */
const HEADER = 56;
const FOOTER = 64;
/** The white margin the print sits in — the mat around a mounted photograph. */
const MAT = space.lg;

export default function PhotoViewer() {
  const { rollId, frame } = useLocalSearchParams<{ rollId: string; frame?: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useAlbum(rollId);

  // Hidden frames are placeholders in the grid; there is nothing to show here.
  const frames = (data?.frames ?? []).filter((f) => !f.hidden_at && f.url);

  const startIndex = Math.max(
    0,
    frames.findIndex((f) => f.frame_number === Number(frame)),
  );
  const [current, setCurrent] = useState(startIndex);
  const listRef = useRef<FlatList<Frame>>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const next = viewableItems[0]?.index;
      if (typeof next === 'number') setCurrent(next);
    },
  ).current;

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );

  if (isLoading || !data?.roll) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const showing = frames[current];

  // The area a print may occupy once the chrome has taken its share.
  const boxW = width - MAT * 2;
  const boxH = height - insets.top - insets.bottom - HEADER - FOOTER;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.top, { paddingTop: insets.top, height: insets.top + HEADER }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {data.roll.name}
        </Text>
        <View style={styles.back} />
      </View>

      <FlatList
        ref={listRef}
        data={frames}
        keyExtractor={(f) => f.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={{ width, height: boxH, justifyContent: 'center', alignItems: 'center' }}>
            <Print frame={item} boxW={boxW} boxH={boxH} />
          </View>
        )}
      />

      <View style={[styles.bottom, { height: FOOTER + insets.bottom, paddingBottom: insets.bottom }]}>
        {showing && (
          <View style={styles.credit}>
            <Avatar
              username={showing.shooter?.username}
              url={showing.shooter?.avatar_url ?? null}
              size={20}
            />
            <Text style={styles.creditText} numberOfLines={1}>
              {showing.shooter ? `@${showing.shooter.username}` : 'Unknown'}
            </Text>
          </View>
        )}
        <Text style={styles.counter}>
          {frames.length > 0 ? `${current + 1} / ${frames.length}` : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * One print, sized to its own shape.
 *
 * The stored width/height is only a hint — frames shot before the capture
 * pipeline corrected orientation have it backwards, which sized portrait
 * prints as though they were landscape and left them floating small in the
 * middle of the screen. The decoded image reports the truth, so the box
 * re-fits itself once the photo has loaded.
 */
function Print({ frame, boxW, boxH }: { frame: Frame; boxW: number; boxH: number }) {
  const [loaded, setLoaded] = useState<number | null>(null);
  const ratio = loaded ?? aspectOf(frame);

  // Fit to width, and fall back to fitting height when that would overflow —
  // so a portrait frame runs the full height rather than being letterboxed.
  let w = boxW;
  let h = boxW / ratio;
  if (h > boxH) {
    h = boxH;
    w = boxH * ratio;
  }

  const onLoad = useCallback((e: ImageLoadEventData) => {
    if (e.source?.width && e.source?.height) setLoaded(e.source.width / e.source.height);
  }, []);

  return (
    <Image
      // Stable across re-signing, so opening a frame full size reuses the
      // bytes the grid already downloaded instead of fetching them again.
      source={{ uri: frame.url!, cacheKey: frame.storage_path }}
      style={[styles.print, { width: w, height: h }]}
      contentFit="cover"
      transition={140}
      onLoad={onLoad}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: 'center', justifyContent: 'center' },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.serifSemi,
    fontSize: 19,
    color: colors.ink,
  },

  /** Square corners: a photographic print has no rounded edge. */
  print: { backgroundColor: colors.line, borderRadius: 0 },

  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  credit: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  creditText: { fontFamily: fonts.serif, fontSize: 13, color: colors.ink },
  counter: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1.2,
  },
});
