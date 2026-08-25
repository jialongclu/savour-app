import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft } from './Aperture';
import { colors, fonts, space } from '@/theme';

interface Props {
  title?: string;
  /** Rendered on the right; keeps the title optically centred when absent. */
  right?: React.ReactNode;
  onBack?: () => void;
  dark?: boolean;
}

const TAP = 44; // iOS HIG minimum, and comfortably past Android's 48dp guidance.

/**
 * Android runs edge-to-edge by default, so a header that only uses padding
 * ends up underneath the status bar — where its controls look present but
 * cannot be tapped. The inset is what makes the back button reachable.
 */
export function ScreenHeader({ title, right, onBack, dark = false }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const tint = dark ? colors.onDark : colors.ink;

  function back() {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + (Platform.OS === 'android' ? space.sm : space.xs),
          backgroundColor: dark ? 'transparent' : colors.paper,
        },
      ]}
    >
      <Pressable
        onPress={back}
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ChevronLeft size={22} color={tint} />
      </Pressable>

      {title ? (
        <Text style={[styles.title, { color: tint }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View />
      )}

      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
  },
  side: {
    width: TAP,
    height: TAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.5 },
  title: {
    fontFamily: fonts.serifSemi,
    fontSize: 19,
    letterSpacing: -0.2,
    flex: 1,
    textAlign: 'center',
  },
});
