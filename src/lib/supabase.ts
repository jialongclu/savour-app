import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase credentials. Copy .env.example to .env and fill in ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart ' +
      'the dev server with `npx expo start --clear`.',
  );
}

// In demo mode nothing here is ever called; the placeholder only keeps the
// module importable so screens don't need to know which mode they're in.
export const supabase = createClient(url ?? 'http://demo.invalid', anonKey ?? 'demo', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no OAuth redirect landing in a browser tab to parse on native;
    // the app catches the redirect itself (see auth.tsx).
    detectSessionInUrl: false,

    // Implicit rather than PKCE, because React Native has no WebCrypto:
    // supabase-js downgrades the code challenge to `plain` and warns about it,
    // and PKCE additionally depends on stashing a code verifier and finding it
    // again during the exchange. Implicit returns the tokens in the redirect
    // itself, removing all three of those failure points. Worth revisiting for
    // a production build, where PKCE is the stronger choice.
    flowType: 'implicit',
  },
});

// Supabase only refreshes tokens while the app is awake; without this a session
// can go stale in the background and the next request 401s.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/**
 * Start it now as well, because the listener above only hears *changes*.
 *
 * A cold launch is already `active`, so no change is ever announced and the
 * refresh loop never began — in an app that stayed in the foreground the whole
 * time, the access token was simply left to expire. Offline that is unrecoverable
 * without a restart: the token dies, `getSession()` cannot renew it without a
 * network, and every queued frame is then refused for having no session even
 * after the signal comes back. Quitting and reopening re-read the session from
 * storage, which is why that appeared to be the only cure.
 */
if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
