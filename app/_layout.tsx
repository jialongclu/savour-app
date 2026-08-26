import {
  SourceSerif4_400Regular,
  SourceSerif4_600SemiBold,
  SourceSerif4_700Bold,
} from '@expo-google-fonts/source-serif-4';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PostHogErrorBoundary, PostHogProvider, usePostHog } from 'posthog-react-native';
import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { startFrameSync } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useIntroSeen } from '@/lib/intro';
import { configurePurchases } from '@/lib/purchases';
import { posthog } from '@/lib/posthog';
import { useRollSync } from '@/lib/useRollSync';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** How long a written-down answer is worth reading back. */
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Short, because a roll is shared: someone else's frame can land at any
      // moment, and thirty seconds of "fresh" was thirty seconds of wrong.
      // Realtime does the pushing; this is what makes a remount ask again.
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      // Outlives the app being closed, so a cold start has something to show
      // before the network answers — or when it never does. Without this the
      // cache is only as old as the process.
      gcTime: PERSIST_MAX_AGE,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'savour.query-cache.v1',
});

/**
 * Which answers are worth keeping on disk.
 *
 * Only the two roll lists. They are small, they change slowly, and they are
 * what a screen needs to describe a roll when there is no connection — the
 * name, who is on it, how long it is, what stock it carries. The docket shown
 * after a roll fills offline is built entirely from this.
 *
 * `finished-rolls` carries cover URLs, and those are signatures that die within
 * the hour — which used to make persisting it a way of restoring broken images.
 * It works now because every cover is drawn with its storage path as the image
 * cache key, so a dead URL falls through to the copy expo-image already holds
 * on disk and the covers are simply there on a cold start, connection or not.
 * The refetch replaces the signatures behind them.
 *
 * That is a dependency worth stating plainly: drop the `cacheKey` from a cover
 * and this line quietly becomes a bug again.
 *
 * The album query is still not persisted. It is per-roll, unbounded in number,
 * and holds every frame of every album — the wrong shape for AsyncStorage.
 */
const PERSISTED = new Set(['active-rolls', 'finished-rolls']);

// React Query watches the browser's focus events, which do not exist here. This
// is the equivalent: coming back from the background counts as focus, so the
// app catches up on anything it missed while asleep — including a subscription
// that dropped.
AppState.addEventListener('change', (state) => {
  focusManager.setFocused(state === 'active');
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SourceSerif: SourceSerif4_400Regular,
    SourceSerifSemi: SourceSerif4_600SemiBold,
    SourceSerifBold: SourceSerif4_700Bold,
    SpaceMono: SpaceMono_400Regular,
    SpaceMonoBold: SpaceMono_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: PERSIST_MAX_AGE,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => {
                const key = query.queryKey[0];
                return typeof key === 'string' && PERSISTED.has(key);
              },
            },
          }}
        >
          {posthog ? (
            <PostHogProvider client={posthog}>
              <PostHogErrorBoundary fallback={null}>
                <AppContent identifyUsers />
              </PostHogErrorBoundary>
            </PostHogProvider>
          ) : (
            <AppContent />
          )}
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent({ identifyUsers = false }: { identifyUsers?: boolean }) {
  return (
    <AuthProvider>
      {identifyUsers && <PostHogIdentity />}
      <StatusBar style="dark" />
      <RouteGuard />
    </AuthProvider>
  );
}

/**
 * Binds the persisted PostHog client to the Supabase user when authentication
 * resolves. The Supabase UUID is the app's stable distinct id; email is kept
 * only as a person property. Resetting at sign-out prevents account switching
 * on a shared device from retaining the prior identity.
 */
function PostHogIdentity() {
  const { session } = useAuth();
  const posthogClient = usePostHog();
  const previousDistinctId = useRef<string | null>(null);

  useEffect(() => {
    const user = session?.user;
    const distinctId = user?.id ?? null;

    if (!distinctId) {
      if (previousDistinctId.current) posthogClient.reset();
      previousDistinctId.current = null;
      return;
    }

    if (previousDistinctId.current === distinctId) return;

    // Do not merge two accounts if the authenticated session changes directly.
    if (previousDistinctId.current) posthogClient.reset();

    /**
     * `signed_up_at` is what a retention cohort is built from: PostHog measures
     * one-week retention as "signed up in this week, came back N days later",
     * and `captureAppLifecycleEvents` already supplies the coming back.
     * Sent every identify, but it only ever describes a fact that cannot change.
     */
    posthogClient.identify(distinctId, {
      ...(user?.email ? { email: user.email } : {}),
      ...(user?.created_at ? { signed_up_at: user.created_at } : {}),
    });
    previousDistinctId.current = distinctId;
  }, [posthogClient, session?.user]);

  return null;
}

/**
 * Routes on three facts: has the intro been seen, is there a session, and does
 * a profile exist. A signed-in user without a profile has not finished sign-up
 * (§7.1), so the app is not reachable until they pick a username.
 */
function RouteGuard() {
  const { session, profile, loading } = useAuth();
  useRollSync();
  const { state: intro } = useIntroSeen();
  const segments = useSegments();
  const router = useRouter();

  // Frames taken without signal wait on disk until there is some. Started only
  // once there is a session, since every send needs one, and torn down on sign
  // out so a queue is never drained against the wrong account.
  useEffect(() => {
    if (!session) return;
    return startFrameSync();
  }, [session]);

  // The Supabase user id is RevenueCat's app user id, so a subscription follows
  // the account rather than the handset.
  useEffect(() => {
    const id = session?.user?.id;
    if (id) configurePurchases(id).catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading || intro === 'loading') return;

    const group = segments[0];
    const onIntro = group === 'intro';
    const onSignIn = group === 'sign-in';
    const onSetup = group === 'setup-profile';

    // Exempt from every rule below. The terms are opened from the sign-in
    // screen, so they are read precisely when there is no session — and the
    // signed-out rule would otherwise close the modal the instant it appeared.
    if (group === 'terms') {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }

    // The intro only gates a signed-out first launch. Someone returning with a
    // session has already made the argument's case by staying, and someone
    // re-reading it from Profile must not be bounced straight back out.
    if (!session && intro === 'unseen') {
      if (!onIntro) router.replace('/intro');
    } else if (!session) {
      if (!onSignIn && !onIntro) router.replace('/sign-in');
    } else if (!profile) {
      if (!onSetup) router.replace('/setup-profile');
    } else if (onSignIn || onSetup) {
      router.replace('/(tabs)');
    }

    SplashScreen.hideAsync().catch(() => {});
  }, [session, profile, loading, intro, segments]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="intro" options={{ animation: 'fade' }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="setup-profile" />
      <Stack.Screen name="viewfinder/[rollId]" options={{ animation: 'fade' }} />
      <Stack.Screen name="roll/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="roll/join" options={{ presentation: 'modal' }} />
      <Stack.Screen name="roll/share/[rollId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="roll/finished/[rollId]" options={{ animation: 'fade' }} />
      <Stack.Screen name="album/[rollId]" />
      <Stack.Screen
        name="photo/[rollId]"
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      {/* Reachable before there is an account, which is the whole point of it. */}
      <Stack.Screen name="terms" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
