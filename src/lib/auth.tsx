import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { fetchMyProfile } from './api';
import { logOutOfPurchases } from './purchases';
import { supabase } from './supabase';
import type { Profile } from './types';

WebBrowser.maybeCompleteAuthSession();

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  /** True until we know both the session and whether a profile exists. */
  loading: boolean;
  appleReady: boolean;
  googleReady: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** Email/password, for testing against a real project without OAuth set up. */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const GOOGLE_IDS = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

/**
 * Google's hook throws outright if the client id for the current platform is
 * missing, so it can only be mounted once we know one exists.
 */
const GOOGLE_CONFIGURED =
  !!(Platform.OS === 'ios'
    ? GOOGLE_IDS.iosClientId
    : Platform.OS === 'android'
      ? GOOGLE_IDS.androidClientId
      : GOOGLE_IDS.clientId);

/**
 * Isolates that hook behind a conditionally rendered component. Hooks can't be
 * called conditionally, but a component holding one can go unmounted.
 */
function GoogleBridge({
  onReady,
  onToken,
}: {
  onReady: (prompt: (() => Promise<void>) | null) => void;
  onToken: (idToken: string) => void;
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(GOOGLE_IDS);

  useEffect(() => {
    onReady(
      request
        ? async () => {
            await promptAsync();
          }
        : null,
    );
  }, [request, promptAsync, onReady]);

  useEffect(() => {
    if (response?.type === 'success' && response.params?.id_token) {
      onToken(response.params.id_token);
    }
  }, [response, onToken]);

  return null;
}

/** Where the OAuth provider sends the browser back to. Must be listed in
 *  Supabase → Authentication → URL Configuration → Redirect URLs. */
export const OAUTH_REDIRECT = AuthSession.makeRedirectUri({ scheme: 'savour', path: 'auth' });

/** Reads a query or fragment parameter out of a redirect URL. */
function paramFromUrl(url: string, key: string): string | null {
  const match = url.match(new RegExp(`[?#&]${key}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Native Google Sign-In: a system account sheet, an ID token handed straight to
 * Supabase. No browser, no redirect, no deep link — which matters on Android,
 * where Chrome blocks redirects to custom schemes and the browser flow dies on
 * a blank page with nothing ever reaching the app.
 *
 * Required setup:
 *  - An **Android** OAuth client whose package name and SHA-1 match the build's
 *    signing keystore (`eas credentials`). Never referenced in code; Google
 *    matches it by signature.
 *  - The **Web** client ID passed as `webClientId` below — it is what decides
 *    the ID token's audience, so Supabase can validate it.
 *  - Both client IDs listed under Supabase → Providers → Google → Authorized
 *    Client IDs, or the token is rejected as having the wrong audience.
 *
 * Required lazily: the native module is absent in Expo Go, and a top-level
 * import would take the whole app down there rather than just this one path.
 */
async function signInWithNativeGoogle() {
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } =
    require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: ['profile', 'email'],
  });

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      const cancelled: any = new Error('The user canceled the sign-in.');
      cancelled.code = 'ERR_REQUEST_CANCELED';
      throw cancelled;
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error(
        'Google signed in but returned no ID token. That usually means ' +
          'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing or is not the Web client ID.',
      );
    }

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
  } catch (e: any) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      const cancelled: any = new Error('The user canceled the sign-in.');
      cancelled.code = 'ERR_REQUEST_CANCELED';
      throw cancelled;
    }

    // These codes each mean something specific and unrelated. Passing the raw
    // one through turns "it won't sign in" into a single actionable cause.
    if (isErrorWithCode(e)) {
      if (String(e.code) === 'DEVELOPER_ERROR') {
        throw new Error(
          'DEVELOPER_ERROR — Google does not recognise this app.\n\n' +
            'The Android OAuth client must have package com.savour.app and SHA-1 ' +
            'E5:5E:07:E6:59:B7:13:87:EE:71:5F:BF:46:84:65:BE:A5:AF:99:4C, and it must live in the ' +
            'SAME Google Cloud project as the Web client — its ID has to start with 66793472402-.',
        );
      }
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('This device has no usable Google Play Services.');
      }
      throw new Error(`Google sign-in failed (${e.code}): ${e.message}`);
    }

    // A Supabase rejection at this point is almost always the audience check.
    if (typeof e?.message === 'string' && /audience|aud|token/i.test(e.message)) {
      throw new Error(
        `Supabase rejected the Google token: ${e.message}\n\n` +
          'Add BOTH the Web and Android client IDs to Authentication → Providers → ' +
          'Google → Authorized Client IDs.',
      );
    }
    throw e;
  }
}

/** Present only in a build that includes the native module — never in Expo Go. */
function nativeGoogleAvailable(): boolean {
  try {
    const mod = require('@react-native-google-signin/google-signin');
    return !!mod?.GoogleSignin?.signIn;
  } catch {
    return false;
  }
}

/**
 * Closes the auth browser, where that is a thing the platform can do.
 *
 * `dismissAuthSession` is iOS-only — on Android the function exists but throws,
 * so optional chaining is no guard. Android's Custom Tab closes itself once the
 * deep link is delivered, making this a no-op there rather than a missing step.
 */
function closeAuthBrowser() {
  if (Platform.OS !== 'ios') return;
  try {
    WebBrowser.dismissAuthSession();
  } catch {
    // Nothing to dismiss; never worth failing a completed sign-in over.
  }
}

/**
 * Turns the redirect URL into a session.
 *
 * Handles both shapes: PKCE returns `?code=`, while a project on the implicit
 * flow returns `#access_token=`. Getting only one of these right looks exactly
 * like a hung browser, so both are handled.
 */
async function completeFromRedirect(url: string) {
  const oauthError = paramFromUrl(url, 'error_description') ?? paramFromUrl(url, 'error');
  if (oauthError) throw new Error(oauthError);

  const code = paramFromUrl(url, 'code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const access_token = paramFromUrl(url, 'access_token');
  const refresh_token = paramFromUrl(url, 'refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }

  throw new Error(`The provider came back without a session.\n\nURL: ${url}`);
}

/**
 * Browser-based OAuth via Supabase. Preferred on Android: it needs only the
 * Web client ID configured in the Supabase dashboard, not a native Android
 * OAuth client bound to the signing certificate's SHA-1 fingerprint.
 */
async function signInWithSupabaseOAuth(provider: 'google' | 'apple') {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase returned no authorization URL.');

  // The deep link can arrive *before* openAuthSessionAsync resolves, so the
  // listener has to be live before the browser opens.
  let deepLinkUrl: string | null = null;
  let onDeepLink: ((url: string) => void) | null = null;

  const sub = Linking.addEventListener('url', ({ url }) => {
    deepLinkUrl = url;
    onDeepLink?.(url);
  });

  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);

    let url: string | null = result.type === 'success' ? result.url : null;

    // Android routinely reports `dismiss` for a *successful* sign-in: the deep
    // link foregrounds the app, which closes the Custom Tab, and the dismissal
    // is what gets reported. Treating that as a cancellation aborts a sign-in
    // that actually worked — and silently, since cancels are not surfaced.
    // So give the redirect a moment to land before believing the dismissal.
    if (!url) {
      url =
        deepLinkUrl ??
        (await new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 2500);
          onDeepLink = (deepLink) => {
            clearTimeout(timer);
            resolve(deepLink);
          };
        }));
    }

    if (!url) {
      const cancelled: any = new Error('The user canceled the sign-in.');
      cancelled.code = 'ERR_REQUEST_CANCELED';
      throw cancelled;
    }

    closeAuthBrowser();
    await completeFromRedirect(url);
  } finally {
    onDeepLink = null;
    sub.remove();
  }
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  /**
   * Which user the value in `profile` was actually resolved for.
   *
   * A plain `loadingProfile` boolean could not answer the question the router
   * needs answered. It starts false, and a new session lands one render before
   * the effect that would set it true — so for that render the app looked
   * signed in with no profile, which is precisely the state that means "go and
   * pick a username". Comparing against the session's user id has no such gap:
   * the instant the session changes, the profile is by definition unresolved.
   */
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const [promptGoogle, setPromptGoogle] = useState<(() => Promise<void>) | null>(null);

  // Stored as a value, so setState's updater form is needed to avoid React
  // treating the function itself as an updater.
  const handleGoogleReady = useCallback((prompt: (() => Promise<void>) | null) => {
    setPromptGoogle(() => prompt);
  }, []);

  const handleGoogleToken = useCallback((idToken: string) => {
    supabase.auth
      .signInWithIdToken({ provider: 'google', token: idToken })
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch((e) => console.warn('[auth] google sign-in failed', e));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));

    return () => sub.subscription.unsubscribe();
  }, []);

  // Whether a profile exists is what decides between the app and the
  // Set Up Profile step, so it has to be resolved before we route (§7.1).
  useEffect(() => {
    let cancelled = false;

    if (!session?.user) {
      setProfile(null);
      setProfileFor(null);
      return;
    }

    const uid = session.user.id;

    fetchMyProfile(uid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      // Marked resolved even when the fetch failed: a network error must not
      // strand the router on a spinner forever. A missing profile then routes
      // to Set Up Profile, which is recoverable; hanging is not.
      .finally(() => {
        if (!cancelled) setProfileFor(uid);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      // Still loading until the profile has been resolved *for this session*.
      loading: loadingSession || (!!session?.user && profileFor !== session.user.id),
      // Offerable wherever Google is. Native Sign in with Apple needs the
      // app's own entitlement — which only a development or production build
      // carries, never Expo Go — so when that is missing the button falls back
      // to the same hosted browser flow rather than disappearing.
      appleReady: true,
      // Always offerable: native when client IDs exist, otherwise Supabase's
      // hosted browser flow.
      googleReady: true,


      async signInWithEmail(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) return;

        const message = error.message.toLowerCase();

        if (message.includes('email not confirmed')) {
          throw new Error(
            'That account exists but is not confirmed. Turn off "Confirm email" in ' +
              'Supabase → Authentication → Providers → Email, then try again.',
          );
        }

        // No account yet is the common case on a fresh test project.
        if (message.includes('invalid login credentials')) {
          const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

          if (signUpError) {
            if (/rate limit|too many/i.test(signUpError.message)) {
              throw new Error(
                'Supabase’s built-in email service allows only a couple of messages an hour, ' +
                  'and confirmation is on, so every sign-up sends one.\n\n' +
                  'Turn off "Confirm email" in Authentication → Providers → Email. Sign-up then ' +
                  'sends no mail at all and signs you straight in.',
              );
            }
            throw signUpError;
          }

          // With confirmation on, sign-up succeeds but returns no session. The
          // old code treated that as success, so the screen simply sat there.
          if (!data.session) {
            throw new Error(
              'Account created, but it needs email confirmation before you can sign in.\n\n' +
                'For testing, turn off "Confirm email" in Supabase → Authentication → ' +
                'Providers → Email and sign in again.',
            );
          }
          return;
        }
        throw error;
      },

      async signInWithApple() {
        // No entitlement (Expo Go, Android, a simulator without iCloud): take
        // the browser route. It needs only the Apple provider configured in
        // Supabase, exactly as Google's hosted flow does.
        if (!appleAvailable || Platform.OS !== 'ios') {
          return signInWithSupabaseOAuth('apple');
        }

        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          throw new Error('Apple did not return an identity token.');
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) throw error;
      },

      async signInWithGoogle() {
        // The right path differs by platform, and not for cosmetic reasons.
        //
        // Android: Chrome refuses to launch a custom-scheme intent from a
        // server redirect, so the browser flow dies on a blank page. Native is
        // the only reliable option — at the cost of an Android OAuth client
        // registered against the signing certificate's SHA-1.
        //
        // iOS: ASWebAuthenticationSession exists precisely to catch that
        // redirect, and does it reliably. The browser flow needs only the Web
        // client that Supabase already has — no iOS OAuth client, no reversed
        // URL scheme in Info.plist, and so no native rebuild to change it.
        if (Platform.OS === 'android' && nativeGoogleAvailable()) {
          await signInWithNativeGoogle();
          return;
        }
        await signInWithSupabaseOAuth('google');
      },

      async signOut() {
        // Before the session goes, so the next account on this handset does
        // not inherit this one's entitlement.
        await logOutOfPurchases();
        await supabase.auth.signOut();
        setProfile(null);
        setProfileFor(null);
      },

      async refreshProfile() {
        if (!session?.user) return;
        setProfile(await fetchMyProfile(session.user.id));
        setProfileFor(session.user.id);
      },
    }),
    [session, profile, loadingSession, profileFor, appleAvailable, promptGoogle],
  );

  return (
    <AuthContext.Provider value={value}>
      {GOOGLE_CONFIGURED && (
        <GoogleBridge onReady={handleGoogleReady} onToken={handleGoogleToken} />
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
