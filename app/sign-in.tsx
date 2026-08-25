import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { AppleMark, GoogleMark } from '@/components/BrandMarks';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, fonts, space } from '@/theme';

/** The tile, at about the size a large app icon is shown at on a store page. */
const TILE = 116;

/**
 * iOS masks icons with a squircle; a rounded rect at ~22% of the side is the
 * usual approximation, and the one the generated PNG is drawn to sit inside.
 */
const TILE_RADIUS = Math.round(TILE * 0.2237);

export default function SignIn() {
  const { signInWithApple, signInWithGoogle, appleReady, googleReady } = useAuth();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      const cancelled =
        e?.code === 'ERR_REQUEST_CANCELED' || e?.message === 'The user canceled the sign-in.';

      // Dismissing a native sheet is normal and stays quiet in a release build.
      // In development it is shown, because a sign-in that fails by looking
      // like a cancellation is the single hardest kind of bug to track down.
      if (!cancelled) {
        Alert.alert("Couldn't sign in", e?.message ?? 'Please try again.');
      } else if (__DEV__) {
        Alert.alert(
          'Sign-in did not complete',
          'The browser closed without returning a session. If you did finish signing in, the ' +
            'redirect never reached the app — see the redirect URI at the bottom of this screen.',
        );
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          {/* The real app icon, not a re-creation of it. Setting the S as text
              here meant centring it on a line box that reserves descender space
              the glyph never uses, so it always sat high; the PNG is already
              centred on the glyph's own ink by scripts/render-logomark.swift. */}
          <View style={styles.appIconShadow}>
            <View style={styles.appIcon}>
              <Image source={require('../assets/icon.png')} style={styles.appIconImage} />
            </View>
          </View>
          <Text style={styles.tagline}>Taking photos worth savouring.</Text>
        </View>

        <View style={styles.actions}>
              {/* Apple first: it is the provider most people on this platform
                  will reach for, and Apple's own guidelines ask for it to sit
                  no lower than the alternatives it is offered beside. Both are
                  outlined rather than one filled — neither provider is Savour's
                  own action, so neither should wear the primary button. */}
              {appleReady && (
                <Button
                  title="Continue with Apple"
                  variant="ghost"
                  icon={<AppleMark />}
                  loading={busy === 'apple'}
                  disabled={busy !== null}
                  onPress={() => run('apple', signInWithApple)}
                />
              )}
              {/* Hidden rather than disabled when unconfigured — a button that
                  can never work is worse than no button. */}
              {googleReady && (
                <Button
                  title="Continue with Google"
                  variant="ghost"
                  icon={<GoogleMark />}
                  loading={busy === 'google'}
                  disabled={busy !== null}
                  onPress={() => run('google', signInWithGoogle)}
                  style={{ marginTop: space.sm }}
                />
              )}

              {!appleReady && !googleReady && (
                <Text style={styles.noProviders}>
                  No sign-in provider is configured yet.
                </Text>
              )}

              {/* The link is the sentence's own words rather than a separate
                  row of small print — this is the one moment the agreement is
                  actually being made, so the thing being agreed to should be
                  openable from inside the sentence saying so. */}
              <Text style={styles.fine}>
                By continuing you agree to our{' '}
                <Text
                  style={styles.fineLink}
                  onPress={() => router.push('/terms')}
                  accessibilityRole="link"
                >
                  Terms &amp; Conditions
                </Text>
                .
              </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Two views: `overflow: 'hidden'` sets masksToBounds on iOS, which clips a
  // shadow off the same layer. The shadow has to live on a parent that does not
  // clip, and the rounding on the child that does.
  appIconShadow: {
    borderRadius: TILE_RADIUS,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    marginBottom: space.md,
  },
  appIcon: {
    width: TILE,
    height: TILE,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    // The tile and the page are both white, so the shadow carries the edge.
    // The hairline is what keeps it from vanishing on a bright screen.
    borderWidth: 1,
    borderColor: colors.line,
  },
  appIconImage: { width: '100%', height: '100%' },
  tagline: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.muted,
    marginTop: space.sm,
    textAlign: 'center',
  },
  actions: { paddingBottom: space.xl },
  fine: {
    fontFamily: fonts.serif,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.lg,
  },
  // Underlined rather than coloured. The palette is black and white, and a blue
  // link would be the only tinted thing on the screen.
  fineLink: {
    fontFamily: fonts.serifSemi,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  noProviders: {
    fontFamily: fonts.serif,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.lg,
  },
});
