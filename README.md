# Savour

Shared, capped-length photo rolls. Shoot into a roll with friends; nobody sees a
frame — not even the person who took it — until the roll is full.

Built from [`PRD.md`](./PRD.md). Section references in the code (`§9.2`, `§9.9`)
point back into it.

- **App:** Expo SDK 57, React Native 0.86, expo-router, TypeScript
- **Backend:** Supabase (Postgres + Auth + Storage)

---

## Two modes, one dev server

Demo mode is a **runtime** switch, not a build-time one, so a single
`npx expo start` serves both at once:

| Where | Mode | How |
|---|---|---|
| Android phone | Real Supabase, Google sign-in, uploads | Sign in normally |
| iOS simulator | Fixtures, no backend | Tap **Explore in demo mode** on the sign-in screen |

`EXPO_PUBLIC_DEMO=1` in `.env` only changes which mode the app *starts* in.

**The iOS simulator has no camera.** The viewfinder says so and the shutter
still works, standing in a frame, so the whole flow — shoot, fill, develop,
album — stays walkable there.

## Demo mode

Runs the entire app with **no Supabase project, no OAuth and no migrations**.

```bash
npm install
npx expo start --go     # --go forces Expo Go; expo-dev-client is installed
```

Sign-in becomes two buttons:

- **Enter with sample rolls** — a developed album to browse, plus two rolls in
  progress (the chooser only appears with two or more; with one the Camera tab
  goes straight to the viewfinder).
- **Start from sign-up** — empty account: Set Up Profile, then the empty Home.

The camera is real in demo mode, so the full loop works on a device: shoot →
counter steps → roll fills → the finished screen → the album, with your own
photos in it. `"Summer Solstice '26"` is seeded at 8 of 12, one frame short of
its 75% gate, so a single shot makes **Develop now** appear on the chooser.

Data is in memory and resets when the app reloads. Seed images come from
picsum.photos, so that part needs a network; everything else works offline.

To leave demo mode, delete `EXPO_PUBLIC_DEMO` from `.env` and restart with
`npx expo start --clear`.

### On a real phone

**Expo Go — iPhone and Android, nothing to build.** Install Expo Go from the App
Store or Play Store, run `npx expo start`, and scan the QR code (Camera app on
iOS, the Expo Go app on Android). Phone and computer must be on the same
network; add `--tunnel` if they aren't, or if you're on locked-down office wifi.

Everything in demo mode works there, camera included. Apple sign-in is the only
thing Expo Go can't do — which demo mode never needs.

**Development build — needed only for a real backend or native sign-in.**

```bash
npx expo run:ios --device        # macOS + Xcode; a free Apple ID works, 7-day cert
eas build -p android --profile development   # cloud build, returns an APK to sideload
eas build -p ios --profile development       # needs a paid Apple Developer account
```

Android needs no Apple account and no local Android SDK if you use the cloud
build. `eas.json` is already set up to emit an APK rather than an AAB, so the
result installs straight onto a phone.

### Google sign-in on Android (native)

Android uses **native Google Sign-In**, not a browser. Chrome blocks redirects
to custom schemes (`exp://`, `savour://`) that arrive via a server redirect with
no user gesture — it shows a blank page and never fires the intent, so the
browser flow dies with nothing reaching the app. The native sheet returns an ID
token directly and sidesteps all of it.

It needs a **development build**; the native module does not exist in Expo Go.

1. **Get the signing fingerprint** (interactive):

   ```bash
   eas credentials --platform android
   ```

   Choose the `development` profile → Keystore → **Set up a new keystore** if
   prompted, then copy the **SHA-1 Fingerprint**.

2. **Google Cloud Console** → Credentials → Create OAuth client ID →
   **Android**:
   - Package name: `com.savour.app`
   - SHA-1: from step 1

   This client is never named in code — Google matches it by package and
   signature. Keep the **Web** client too; it is still what the code sends.

3. **`.env`** → set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the **Web** client ID.
   It decides the ID token's audience, so Supabase can validate it. The Android
   client ID is not referenced anywhere.

4. **Supabase** → Authentication → Providers → Google → **Authorized Client
   IDs** → add **both** the Web and Android client IDs, comma-separated.
   Skipping this rejects the token for having the wrong audience.

5. Build and install:

   ```bash
   eas build -p android --profile development
   ```

The `@react-native-google-signin/google-signin` **config plugin is deliberately
not registered** in `app.json`: it only patches iOS (adding a URL scheme) and
throws unless given `iosUrlScheme`. Android needs nothing from it. Add it with a
real `iosUrlScheme` only if iOS ever uses Google rather than Apple.

### Full real flow on Android, in Expo Go

Everything except Apple sign-in works in Expo Go against the real backend —
Google sign-in, the camera, and uploads to Supabase Storage. No build required.

`expo-dev-client` is installed, so `expo start` defaults to dev-build mode.
**Force Expo Go:**

```bash
npx expo start --go
```

One-time setup:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth
   client ID → **Web application**. Copy the client ID and secret. (A *Web*
   client, not Android — the browser flow needs no SHA-1 fingerprint.)
2. **Supabase** → Authentication → Providers → **Google** → paste both, enable.
3. **Supabase** → Authentication → URL Configuration → **Redirect URLs** → add
   the value printed at the bottom of the sign-in screen in dev builds. Tap it
   to copy. It looks like `exp://192.168.x.x:8081/--/auth` in Expo Go and
   `savour://auth` in a built app — **add both**, or sign-in fails with a
   redirect mismatch.

Then sign in, shoot a frame, and check Supabase → Storage → `roll-photos`. The
upload happens per shot, so a single frame is enough to confirm it — you do not
have to fill the roll.

### Can't use Apple sign-in but want a real backend?

The sign-in screen has a **"Use email instead"** link. It signs in with
email/password against your Supabase project and creates the account if it
doesn't exist — no Apple Developer account or Google OAuth setup needed. Enable
Authentication → Providers → Email in the dashboard, and turn off "Confirm
email" while testing.

---

## Setup

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com), then apply the schema:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

Or paste the three files in `supabase/migrations/` into the SQL editor **in
filename order** — schema, then functions, then RLS.

The migrations create the `roll-photos` (private) and `avatars` (public) storage
buckets themselves; you do not need to add them by hand.

### 2. Auth providers

**Apple** — Supabase Dashboard → Authentication → Providers → Apple. Needs an
Apple Developer account, a Services ID, and a signing key. Sign in with Apple
only works in a development build or TestFlight, never in Expo Go.

**Google** — create three OAuth client IDs (iOS, Android, Web) in the Google
Cloud Console, then enable the Google provider in Supabase and give it the
**Web** client ID and secret.

### 3. Environment

```bash
cp .env.example .env   # then fill it in
```

### 4. Run

```bash
npm install
npx expo start
```

The camera and Apple sign-in need a **development build** — neither works in
Expo Go:

```bash
npx expo run:ios      # or: npx expo run:android
```

---

## How it's laid out

```
app/                       expo-router routes
  _layout.tsx              providers + the session/profile routing gate
  sign-in.tsx              Apple / Google
  setup-profile.tsx        username (required) + avatar (optional)
  (tabs)/index.tsx         Home — developed rolls
  (tabs)/camera.tsx        roll chooser, or a redirect straight to the finder
  viewfinder/[rollId].tsx  full-screen camera, no tab bar
  roll/new.tsx             create
  roll/join.tsx            join by code
  roll/share/[rollId].tsx  the share code's only home
  roll/finished/[rollId]   the payoff screen
  album/[rollId].tsx       staggered album, native aspect ratios
  profile.tsx              blocks, support, sign out

src/
  lib/api.ts               every query and RPC call
  lib/auth.tsx             session + profile context
  lib/supabase.ts          client
  components/FrameCounter  the mechanical counter (§9.7)
  theme.ts                 design tokens

supabase/migrations/       schema → functions → RLS
```

## Where the rules actually live

The client is not trusted with anything that matters. Every state transition is
a `SECURITY DEFINER` function:

| Function | Enforces |
|---|---|
| `create_roll` | share-code generation, active-roll cap |
| `join_roll_by_code` | rate limit, blocks, one identical error for every rejection |
| `shoot_frame` | membership, roll still active, frame numbering under a row lock |
| `develop_roll_early` | owner-only, the 75% threshold (§9.9) |
| `hide_photo` / `unhide_photo` | membership; reversible by the hider or the owner |

Two RLS policies carry the product's central promise, and they have to agree:
`photos` SELECT requires `rolls.status = 'finished'`, and the matching
`storage.objects` policy requires the same. **If they ever diverge, a signed URL
hands out exactly what the other policy protects.**

---

## Status

Written and verified to compile — `npx tsc --noEmit` is clean and both iOS and
Android bundle via `npx expo export`.

**Not verified, because this machine had neither Docker nor a local Postgres:**
the migrations have never been executed. Run `supabase db push` against a scratch
project before trusting them; expect to fix a typo or two, not a design flaw.

**Not verified, because it needs a device:** the camera, both sign-in providers,
photo upload, and the counter's step-and-haptic.

### Known gaps

- **Account deletion** is a stub. It needs a server-side routine that tombstones
  the profile while leaving contributed frames in other people's albums (§14 Q3).
- **Abandoned rolls below 75%** are still trapped forever — §9.9 covers rolls
  that nearly made it. The 60-day auto-develop backstop is unimplemented.
- **Home's cover query is N+1** — one `fetchPhotos` per developed roll. Fine at
  ten rolls, not at a hundred; collapse it into one query when it bites.
- **No offline capture queue.** §12 wants a frame taken without connectivity to
  upload on reconnect; today it just fails.
- **No realtime.** Frame progress updates on refetch, not live.
- **Filters** — only `none`, per §9.3. The picker shows disabled tiles.

### One deliberate deviation from the PRD

§10 specifies the storage path `{roll_id}/{frame_number}.jpg`. The app writes
`{roll_id}/{uuid}.jpg` instead: the frame number is not known until
`shoot_frame` takes its row lock, and two people shooting at the same instant
would otherwise race for the same filename. The frame number lives in the
`photos` row, which is the only place it needs to be authoritative.
