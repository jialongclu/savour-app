import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  cancelAnimation,
  cubicBezier,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useIntroSeen } from '@/lib/intro';
import { colors, fonts, space, wordmark } from '@/theme';

/**
 * The argument for a roll that ends, made before sign-in rather than after.
 *
 * Savour asks for commitments that cannot be undone — a fixed length, a baked
 * filter, no frame visible until the last one is gone. Someone who meets those
 * without the argument reads the app as missing features rather than as having
 * a point, so the case has to be made before the account exists (§7.0).
 */

interface Slide {
  n: string;
  eyebrow: string;
  head: string;
  body: string;
  art: 'film' | 'pile' | 'mark' | 'none';
}

const SLIDES: Slide[] = [
  {
    n: '01',
    eyebrow: 'Cost',
    head: 'A photograph used to cost something.',
    body:
      'Film cost money to buy and money to develop. So you thought before you ' +
      'pressed the shutter.',
    art: 'film',
  },
  {
    n: '02',
    eyebrow: 'The Pile',
    head: "Now, you'll have a bunch of photos you'll never look at.",
    body:
      'They make you remember what you did. Not how it felt — which is the ' +
      'part you actually want back.',
    art: 'pile',
  },
  {
    n: '03',
    eyebrow: 'The Idea',
    head: 'We want you to savour the moments that matter most.',
    body:
      'So a roll holds 12, 24 or 36 frames, and not one more. What comes back is ' +
      'an album short enough to actually sit with.',
    art: 'none',
  },
  {
    n: '04',
    eyebrow: 'Savour the Moments',
    head: 'Load your first roll.',
    body: "Choose a length. Invite whoever's coming with you. Then put the phone away until something is worth a frame.",
    art: 'mark',
  },
];

const ART_HEIGHT = 210;
const EASE = cubicBezier(0.23, 1, 0.32, 1);

export default function Intro() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { markSeen } = useIntroSeen();
  const { session } = useAuth();

  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);

  const last = index === SLIDES.length - 1;

  async function leave() {
    await markSeen();
    // Re-read from Profile: there is nothing to sign into, so hand back to
    // wherever they came from rather than throwing them at the door.
    if (session) return router.canGoBack() ? router.back() : router.replace('/(tabs)');
    router.replace('/sign-in');
  }

  function advance() {
    if (last) return leave();
    list.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  // Paging is read off the scroll offset rather than onViewableItemsChanged:
  // the dots have to track a drag that is still in progress, not wait for it
  // to settle on a page.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex((prev) => (prev === next ? prev : next));
    },
    [width],
  );

  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <SafeAreaView edges={['top']}>
        <View style={styles.top}>
          {!last && (
            <Pressable onPress={leave} hitSlop={12} accessibilityRole="button">
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <FlatList
        ref={list}
        data={SLIDES}
        keyExtractor={(s) => s.n}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={getItemLayout}
        // Rows are only re-rendered when data or extraData changes. Without this
        // the `active` flag below is frozen at whatever it was on first render,
        // and the pile never starts drifting.
        extraData={index}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]}>
            {/* The space is held even when nothing fills it, so every headline
                lands on the same line and swiping does not shunt the copy up
                and down. It was briefly collapsed on the artless slide, back
                when that slide had sixty words to fit; at twenty-five it would
                only put the emptiness underneath the copy instead of above it. */}
            <View style={styles.art}>
              {/* Only the visible slide animates — an infinite loop running
                  off-screen is work nobody sees. */}
              {item.art !== 'none' && <Art kind={item.art} active={i === index} />}
            </View>
            <Text style={styles.eyebrow}>
              {item.n} — {item.eyebrow}
            </Text>
            <Text style={styles.head}>{item.head}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <SafeAreaView edges={['bottom']} style={styles.foot}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Animated.View
              key={s.n}
              style={[
                styles.dot,
                i === index && styles.dotOn,
                {
                  transitionProperty: ['width', 'backgroundColor'],
                  transitionDuration: 260,
                  transitionTimingFunction: EASE,
                },
              ]}
            />
          ))}
        </View>

        <Button title={last ? 'Get started' : 'Next'} onPress={advance} />

        {/* Someone arriving on a friend's code already has their reason; this
            lets them out of the pitch without reading it. */}
        {!session && (
          <Button
            title="I have a code"
            variant="text"
            onPress={leave}
            style={{ marginTop: space.xs }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

/* ---------------------------------------------------------------- artwork */

function Art({ kind, active }: { kind: Slide['art']; active: boolean }) {
  if (kind === 'film') return <FilmArt />;
  if (kind === 'pile') return <PileArt active={active} />;
  return <Text style={styles.mark}>Savour</Text>;
}

/** A strip of film with one frame exposed and the rest still to come. */
function FilmArt() {
  const cells = Array.from({ length: 22 }, (_, i) => i);
  return (
    <View style={styles.film}>
      <View style={styles.strip}>
        <View style={styles.perfRow}>
          {cells.map((i) => (
            <View key={i} style={styles.perfCell}>
              <View style={styles.perf} />
            </View>
          ))}
        </View>
        <View style={styles.cellRow}>
          {cells.map((i) => (
            <View key={i} style={[styles.cell, i === 0 && styles.cellShot]} />
          ))}
        </View>
        <View style={styles.perfRow}>
          {cells.map((i) => (
            <View key={i} style={styles.perfCell}>
              <View style={styles.perf} />
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.caption}>One frame = $</Text>
    </View>
  );
}

/** Columns across the pile, and the space between cells. */
const PILE_COLS = 7;
const PILE_GAP = 3;

/**
 * A grid that scrolls and never reaches a bottom — the photographs nobody
 * scrolls back through.
 *
 * This is the one screen where the motion carries the argument rather than
 * decorating it, so it is also the only thing in the intro that moves. One
 * screenful of rows is rendered twice and translated by exactly the height of
 * a copy, so the instant the loop ends it is pixel-identical to its start.
 *
 * Cell sizes are computed rather than expressed as a percentage plus an
 * aspectRatio: that combination collapses to zero height inside a wrapping
 * flex row, which is why the grid did not draw at all.
 */
function PileArt({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();

  const avail = width - space.xl * 2;

  // Floored, and the grid measured back from the floored cell rather than the
  // space it was cut from. A fractional cell width rounds up on the device's
  // pixel grid, so seven of them plus six gaps could total a hair more than the
  // row they sit in — enough for the seventh to wrap, which left every row a
  // cell short and the whole pile sitting off to one side.
  const cellWidth = Math.floor((avail - PILE_GAP * (PILE_COLS - 1)) / PILE_COLS);
  const gridWidth = cellWidth * PILE_COLS + PILE_GAP * (PILE_COLS - 1);
  const cellHeight = cellWidth * (4 / 3);
  const rowHeight = cellHeight + PILE_GAP;

  // Enough rows to overfill the window, so the seam is always off-screen.
  const rows = Math.ceil(ART_HEIGHT / rowHeight) + 2;
  const loop = rows * rowHeight;

  const running = active && !reduced;

  const y = useSharedValue(0);

  useEffect(() => {
    if (!running) {
      cancelAnimation(y);
      y.set(0);
      return;
    }
    y.set(0);
    y.set(
      withRepeat(
        // Linear: any easing would give the drift a pulse, and a pile does
        // not breathe.
        withTiming(-loop, { duration: 16000, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(y);
  }, [running, loop, y]);

  const drift = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  const copy = (key: string) => (
    <View key={key} style={[styles.pileGrid, { width: gridWidth }]}>
      {Array.from({ length: rows * PILE_COLS }, (_, i) => (
        <View
          key={i}
          style={[styles.pileCell, { width: cellWidth, height: cellHeight }]}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.pile}>
      <Animated.View style={drift}>
        {copy('a')}
        {/* The second copy exists only so the wrap is invisible. */}
        {copy('b')}
      </Animated.View>

      <View style={styles.pileTagWrap} pointerEvents="none">
        <Text style={styles.pileTag}>4,812 PHOTOS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },

  top: { height: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: space.xl },
  skip: { fontFamily: fonts.serif, fontSize: 15, color: colors.muted },

  slide: { paddingHorizontal: space.xl, paddingTop: space.lg },
  art: { height: ART_HEIGHT, justifyContent: 'center', marginBottom: space.xl },

  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  head: {
    fontFamily: fonts.serifSemi,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: space.md,
  },
  body: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 26,
    color: colors.muted,
    marginTop: space.md,
  },

  foot: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginBottom: space.lg },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotOn: { width: 18, backgroundColor: colors.ink },

  /* film */
  film: { width: '100%' },
  strip: { backgroundColor: '#161616', paddingVertical: 5, borderRadius: 2 },
  perfRow: { flexDirection: 'row', height: 7, alignItems: 'center' },
  perfCell: { flex: 1, alignItems: 'center' },
  perf: { width: 3, height: 3, borderRadius: 0.5, backgroundColor: colors.paper, opacity: 0.8 },
  cellRow: { flexDirection: 'row', gap: 1, paddingHorizontal: 1, paddingVertical: 3 },
  cell: { flex: 1, height: 54, borderRadius: 1, backgroundColor: '#2E2E2E' },
  cellShot: { backgroundColor: '#C9C9C9' },
  caption: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.md,
  },

  /* pile */
  // Centred, because flooring the cell leaves up to six pixels over. Left to
  // the default that slack all collected on one side and the pile read as
  // slightly off-centre against the copy beneath it.
  pile: { height: ART_HEIGHT, overflow: 'hidden', alignItems: 'center' },
  pileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: PILE_GAP },
  pileCell: { borderRadius: 1, backgroundColor: colors.line },
  pileTagWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  pileTag: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.paper,
    backgroundColor: colors.ink,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 3,
    overflow: 'hidden',
  },


  mark: { ...wordmark, fontSize: 26, color: colors.ink, textAlign: 'center' },
});
