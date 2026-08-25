import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TERMS, TERMS_UPDATED, type Block } from '@/lib/legal';
import { colors, fonts, space } from '@/theme';

/**
 * The terms, set rather than embedded.
 *
 * A WebView would have been the short way to do this, and it would have looked
 * like a web page dropped into the app — Arial, blue links, its own scroll
 * physics — as well as costing a native dependency and another build. The
 * clauses live in `lib/legal.ts` as structure instead, so this screen is only
 * concerned with how they read: the same serif as everything else, a measure
 * narrow enough to follow, and headings that can be found while scrolling
 * quickly.
 *
 * Presented as a modal from sign-in, which is the one place it must be reachable
 * before the account exists.
 */
export default function Terms() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <Text style={styles.barTitle}>Terms & Conditions</Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        // The terms are long and nobody reads them in one sitting; letting the
        // scroll position survive a dismissal is not worth the state.
      >
        <Text style={styles.updated}>Last updated {TERMS_UPDATED}</Text>

        {TERMS.map((block, i) => (
          <Chunk key={i} block={block} />
        ))}

        <View style={styles.tail} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Chunk({ block }: { block: Block }) {
  switch (block.kind) {
    case 'h2':
      return <Text style={styles.h2}>{block.text}</Text>;
    case 'h3':
      return <Text style={styles.h3}>{block.text}</Text>;
    case 'p':
      return <Text style={styles.p}>{block.text}</Text>;
    case 'ul':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.li}>
              {/* An em dash rather than a bullet: the rest of the app marks a
                  list this way, and a round bullet in a serif column reads as
                  borrowed from somewhere else. */}
              <Text style={styles.liMark}>—</Text>
              <Text style={styles.liText}>{item}</Text>
            </View>
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  barTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  close: { fontFamily: fonts.serifSemi, fontSize: 16, color: colors.ink },
  pressed: { opacity: 0.55 },

  body: { paddingHorizontal: space.xl, paddingTop: space.lg },

  updated: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: space.lg,
  },

  h2: {
    fontFamily: fonts.serifSemi,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.ink,
    marginTop: space.xl,
    marginBottom: space.xs,
  },
  h3: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  // 16/26 is the app's reading setting, and this is the longest read in it.
  p: {
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 25,
    color: colors.muted,
    marginTop: space.sm,
  },

  list: { marginTop: space.sm, gap: space.xs },
  li: { flexDirection: 'row', gap: space.sm },
  liMark: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 25, color: colors.line },
  liText: { flex: 1, fontFamily: fonts.serif, fontSize: 15, lineHeight: 25, color: colors.muted },

  // Room to scroll the last clause clear of the home indicator.
  tail: { height: space.xxl },
});
