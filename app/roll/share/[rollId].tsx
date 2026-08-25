import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Label } from '@/components/ui';
import { fetchRoll } from '@/lib/api';
import { posthog } from '@/lib/posthog';
import { colors, fonts, radius, space } from '@/theme';

export default function ShareRoll() {
  const { rollId } = useLocalSearchParams<{ rollId: string }>();
  const router = useRouter();

  const { data: roll, isLoading } = useQuery({
    queryKey: ['roll', rollId],
    queryFn: () => fetchRoll(rollId!),
    enabled: !!rollId,
  });

  if (isLoading || !roll) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.navTitle}>Roll created</Text>

      <View style={styles.center}>
        <Text style={styles.name}>{roll.name}</Text>
        <Text style={styles.sub}>
          {roll.max_frames} exposures · {roll.filter === 'none' ? 'no filter' : roll.filter}
        </Text>

        <Pressable
          style={styles.codeBox}
          onPress={async () => {
            await Clipboard.setStringAsync(roll.share_code);
            posthog?.capture('roll_share_code_copied', { max_frames: roll.max_frames });
            Haptics.selectionAsync().catch(() => {});
          }}
          accessibilityRole="button"
          accessibilityLabel={`Copy share code ${roll.share_code}`}
        >
          <Label>Share code</Label>
          <Text style={styles.code}>{roll.share_code}</Text>
        </Pressable>

        <Text style={styles.explain}>
          Anyone with this code can shoot into the roll. Nobody sees a single photo — not even you —
          until all {roll.max_frames} are used.
        </Text>
      </View>

      <Button
        title="Share code"
        variant="ghost"
        onPress={async () => {
          posthog?.capture('roll_share_initiated', { max_frames: roll.max_frames });
          await Share.share({
            message: `Shoot with me on Savour — join "${roll.name}" with code ${roll.share_code}`,
          });
        }}
        style={{ marginBottom: space.sm }}
      />
      <Button
        title="Start shooting"
        onPress={() => router.replace(`/viewfinder/${roll.id}`)}
        style={{ marginBottom: space.lg }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navTitle: {
    fontFamily: fonts.serifSemi,
    fontSize: 17,
    color: colors.ink,
    textAlign: 'center',
    paddingVertical: space.md,
  },
  name: { fontFamily: fonts.serifSemi, fontSize: 26, color: colors.ink, textAlign: 'center' },
  sub: { fontFamily: fonts.serif, fontSize: 13, color: colors.muted, marginTop: space.xs },
  codeBox: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.xl,
    marginTop: space.xl,
  },
  code: {
    fontFamily: fonts.monoBold,
    fontSize: 38,
    letterSpacing: 6,
    color: colors.ink,
    marginTop: space.sm,
  },
  explain: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.lg,
  },
});
