import PostHog from 'posthog-react-native';

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

if (__DEV__ && !projectToken) {
  throw new Error(
    'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is configured',
  );
}

if (__DEV__ && !host) {
  throw new Error(
    'EXPO_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_HOST is configured',
  );
}

/**
 * The shared PostHog client. Expo embeds EXPO_PUBLIC_* values at build time.
 * Production builds without configuration leave analytics disabled.
 */
export const posthog =
  projectToken && host
    ? new PostHog(projectToken, {
        host,
        captureAppLifecycleEvents: true,
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
            console: [],
          },
        },
      })
    : undefined;
