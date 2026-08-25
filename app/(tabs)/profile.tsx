import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabPillClearance } from '@/components/TabPill';
import { Avatar, Button, Divider, Label } from '@/components/ui';
import { deleteAccount } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePlus } from '@/lib/purchases';
import { colors, fonts, space } from '@/theme';

/**
 * Where support goes.
 *
 * A form rather than a mailto: it opens whether or not this phone has a mail
 * account set up, which a mailto does not, and it arrives somewhere structured
 * instead of in an inbox.
 */
const SUPPORT_URL = 'https://tally.so/r/VLO84v';

/**
 * Where a subscription is actually cancelled.
 *
 * Not in this app, and there is no API that could do it: a store subscription
 * belongs to the store account, so the only honest thing to offer is the door
 * to it. Apple requires that door to exist somewhere findable, and it is also
 * the first place someone looks when they want to stop paying.
 */
const MANAGE_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

/**
 * Profile, as a tab rather than a sheet pushed from a gear.
 *
 * The gear was the same affordance drawn twice, in a corner, on two of the
 * three screens — findable only if you already knew to look up there. A tab is
 * where a person expects their own account to live, and it costs no chrome on
 * the screens that used to carry the icon.
 */
export default function ProfileTab() {
  const { profile, signOut } = useAuth();
  const { plus } = usePlus();
  const router = useRouter();
  const pillClearance = useTabPillClearance();

  /**
   * Destroying the account, then leaving.
   *
   * `signOut` follows rather than races: the session is what authorises the
   * call, and dropping it first would leave the request unauthenticated. Once
   * the row is gone the token refers to nobody, so signing out is only
   * clearing what is already void.
   */
  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => signOut(),
    onError: (e: any) =>
      Alert.alert("Couldn't delete your account", e?.message ?? 'Please try again.'),
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/* No Done button: a tab is not dismissed, it is left by tapping
          somewhere else on the bar. */}
      <View style={styles.header}>
        <Text style={styles.heading}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: pillClearance }]}>
        <View style={styles.identity}>
          <Avatar username={profile?.username} url={profile?.avatar_url} size={96} />
          <Text style={styles.username}>@{profile?.username}</Text>
        </View>

        {plus ? (
          <>
            <Label style={styles.head}>Subscription</Label>
            <Pressable style={styles.row} onPress={() => Linking.openURL(MANAGE_URL)}>
              <Text style={styles.rowLabel}>Manage or cancel</Text>
              <Text style={styles.action}>
                {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}
              </Text>
            </Pressable>
            <Divider />
          </>
        ) : null}

        <Label style={styles.head}>Support</Label>

        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL(SUPPORT_URL)}
          accessibilityRole="link"
          accessibilityLabel="Contact us, opens a form in your browser"
        >
          <Text style={styles.rowLabel}>Contact us</Text>
          <Text style={styles.action}>Open form</Text>
        </Pressable>

        {/* Agreed to at sign-in, so they have to stay readable afterwards —
            otherwise the only copy is behind a door you can no longer open. */}
        <Pressable
          style={styles.row}
          onPress={() => router.push('/terms')}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Terms & Conditions</Text>
          <Text style={styles.action}>Read</Text>
        </Pressable>

        <Divider />

        <Button title="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: space.xl }} />

        <Pressable
          onPress={() =>
            Alert.alert(
              'Delete account',
              'Your username and photo are removed. Frames you shot into shared rolls stay in ' +
                'those albums — pulling them would leave holes in other people’s finished rolls.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => remove.mutate(),
                },
              ],
            )
          }
          disabled={remove.isPending}
          style={styles.deleteRow}
        >
          <Text style={[styles.delete, remove.isPending && styles.deleteBusy]}>
            {remove.isPending ? 'Deleting…' : 'Delete account'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl },
  // Matched to Film's header so the two tabs' titles sit on the same line.
  header: { paddingTop: space.sm, paddingBottom: space.md },
  heading: {
    fontFamily: fonts.serifSemi,
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  body: { paddingBottom: space.xxl },
  identity: { alignItems: 'center', marginVertical: space.xl },
  username: { fontFamily: fonts.mono, fontSize: 16, color: colors.ink, marginTop: space.md },
  head: { marginTop: space.lg, marginBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  rowLabel: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
  action: { fontFamily: fonts.serifSemi, fontSize: 14, color: colors.accent },
  deleteRow: { alignItems: 'center', paddingVertical: space.xl },
  delete: { fontFamily: fonts.serifSemi, fontSize: 14, color: colors.danger },
  deleteBusy: { color: colors.muted },
});
