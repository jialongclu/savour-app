# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Savour is a solo-developer iOS-first (Android-secondary) app built with Expo Router
+ TypeScript, backed by Supabase (Postgres, Auth, Storage, Realtime). Users shoot
into shared, capped-length photo **rolls**; nobody — including the shooter — sees a
frame until the roll fills. The product spec is [`PRD.md`](./PRD.md); code comments
cite it by section (`§9.2`, `§9.9`), and those references are load-bearing — read
the cited section before changing behavior it points to. `README.md` covers setup
and day-to-day running instructions in more detail than this file duplicates.

There is no company behind this app — it's one independent developer. Copy and
comments should never imply a team.

## Commands

```bash
npm install
npx expo start                # dev server; --go forces Expo Go, --tunnel for cross-network
npx expo start --clear        # after changing .env
npx tsc --noEmit              # typecheck — the only check in CI-less setup; run before calling anything done
npx expo export               # confirms both platforms still bundle
npx expo run:ios --device     # native build (camera + Apple sign-in need this or a dev client)
eas build -p android --profile development   # cloud-built APK, sideloadable, no local Android SDK needed
eas credentials --platform android           # get the SHA-1 fingerprint for Google sign-in setup
```

There is no test runner, linter, or lint script configured in this repo — `tsc
--noEmit` is the only automated gate. Don't invent a `npm test`/`npm run lint`
invocation; if you add tests, wire the script up first.

Supabase (schema lives in `supabase/migrations/`, applied in filename order):

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
npm run storage:ls            # list roll-photos bucket contents
npm run storage:avatars       # list avatars bucket contents
```

## Architecture

### The client is not trusted with anything that matters

Every state transition that matters is a `SECURITY DEFINER` Postgres function,
not client-side logic — this is the central architectural fact of the codebase.
`src/lib/api.real.ts` (re-exported as `src/lib/api.ts`) is a thin wrapper around
RPC calls; it does not itself decide whether a shot is legal, a join is allowed,
or a roll is full. Current authority functions (across `supabase/migrations/*.sql`,
newest wins when a name repeats — e.g. `shoot_frame`, `create_roll`,
`generate_share_code` were each redefined later):

| Function | Enforces |
|---|---|
| `create_roll` | share-code generation, active-roll cap, free-roll allowance |
| `join_roll_by_code` | rate limit (`max_join_failures`), blocks, one identical error for every rejection |
| `shoot_frame` | membership, `can_shoot_into` (roll still active), frame numbering under a row lock |
| `develop_roll_early` | owner-only, the 75% threshold (§9.9) |
| `hide_photo` / `unhide_photo` | membership; reversible by the hider or the owner |
| `leave_roll` | membership cleanup without deleting the member's frames |
| `delete_account` | tombstones the profile; frames stay in other members' albums with `user_id` nulled |
| `can_read_roll` / `can_shoot_into` / `roll_id_from_object` | shared predicates that RLS policies and storage policies both call, so the two never have to independently reimplement the same rule |

Two RLS policies carry the product's central promise and **must agree**: the
`photos` table's SELECT policy requires `rolls.status = 'finished'`, and the
matching `storage.objects` policy (on the private `roll-photos` bucket) requires
the same thing. If they ever diverge, a signed URL hands out exactly what the
other policy is supposed to protect. When touching either, check both.

When adding a new mutation, put the rule in a migration function, not in
`api.real.ts` — the client only orchestrates calls and shapes results for the UI.

### No demo/fixture mode

`src/lib/api.ts` used to switch between a real backend and in-memory fixtures so
the iOS simulator (which has no camera) could be walked without Supabase. That
mode has been deliberately removed — every screen now depends on things a
fixture can't honestly fake (a queue that survives relaunches, storage policies,
Realtime, a subscription). Don't reintroduce a fixture/demo branch in `api.ts`;
the simulator path is that the viewfinder says there's no camera and the shutter
still works standing in a frame, not that the app talks to fake data.

### Client-side systems worth knowing before touching them

- **`src/lib/frameQueue.ts`** — an offline capture queue. A shutter press must
  always succeed even with no signal, so image bytes go to
  `Paths.document` (never `Paths.cache`, which the OS can evict) and metadata to
  one AsyncStorage JSON blob. Drain order is strict FIFO — a stuck frame blocks
  the rest so frames reach the server in shot order. `PermanentFrameError` marks
  failures retrying can't fix (roll closed, no longer a member); anything else
  retries up to `MAX_ATTEMPTS`.
- **`src/lib/useRollSync.ts`** — subscribes to Postgres changes on `rolls` and
  invalidates the `active-rolls`/`finished-rolls`/`roll` queries rather than
  patching the cache from the payload, since the payload doesn't reflect
  RLS/membership/blocks the way a refetch does. Also invalidates when a queued
  frame drains, since the visible count is "server count + still-queued."
- **`app/_layout.tsx`** — `RouteGuard` is the single source of routing truth,
  gating on three facts: intro seen, session present, profile present (§7.1).
  It also boots the frame-sync queue (only once signed in) and RevenueCat
  (keyed to the Supabase user id, so a subscription follows the account, not
  the handset). React Query is persisted to AsyncStorage, but only
  `active-rolls` and `finished-rolls` — see the comment above `PERSISTED` in
  that file before persisting anything else; finished-roll cover URLs are
  short-lived signed URLs and rely on `expo-image`'s on-disk cache keyed by
  storage path to still show something once the signature has expired.
- **`src/lib/purchases.ts`** — RevenueCat wrapper. `FREE_ROLLS` (3) mirrors the
  server's `free_roll_allowance()`, and `MAX_ACTIVE_ROLLS` (3, in
  `src/lib/types.ts`) mirrors `max_active_rolls()` — these pairs must be changed
  together, client copy exists only so screens can name the number. Missing
  RevenueCat keys degrade to "paywall never gates," not a crash.
- **`src/lib/filters.ts`** — a roll's filter is chosen at creation and baked
  into each frame at capture time (Skia color matrix + grain), not reapplied at
  view time, so the album and anything shared stay in agreement.
- **`app/shoot.tsx`** — the `savour://shoot` deep link target (for the iPhone
  Action Button, which can only fire a URL). It decides between the viewfinder
  and the roll shelf based on active rolls minus what's already queued, then
  `router.replace`s — it must never appear in the back stack or take a visible
  transition.

### Routing / IA

Two main tabs plus a detached camera trigger (`app/(tabs)/_layout.tsx`,
`TabList`/`TabTrigger` from `expo-router/ui`): **Album** (`index.tsx`, developed
rolls), **Film** (`film.tsx`, rolls in progress), and **Profile** — Camera sits
outside that pill as its own knob since it's an action, not a destination. Other
top-level routes under `app/`: `sign-in`, `setup-profile`, `intro`, `viewfinder/
[rollId]` (full-screen, no tab bar), `roll/new`, `roll/join`, `roll/share/
[rollId]`, `roll/finished/[rollId]` (the payoff screen), `album/[rollId]`,
`photo/[rollId]` (full-screen modal), `profile`, `paywall`, `terms`, and `shoot`
(see above). `src/lib/api.real.ts` holds every query/RPC call; `src/lib/auth.tsx`
holds session + profile state and all three sign-in paths (Apple native, Google
native-on-Android/browser-on-iOS, email/password fallback) — the platform split
there is deliberate (see its file-level comments) and not something to simplify
toward one flow.

## Product rules that constrain the code

These come from `PRD.md` and are also captured as this developer's standing
preferences — worth checking before UI or data-model changes even when nothing
above names the specific function involved:

- A photo the user has taken is never discarded, even past a roll's nominal
  frame count — see the offline queue's retry/permanent-failure split above.
- A photo's container takes the photo's shape; images are never cropped to fit
  a fixed box (the album is described in README as "native aspect ratios").
- The palette is black and white (`src/theme.ts`); photographs are the only
  color allowed on screen.
- Empty/supporting states are a simple icon above short text, not an elaborate
  illustrated scene.
- Design direction favors mechanical film-camera skeuomorphism (the frame
  counter, the viewfinder's film strip, the "developing" language) over
  conventional mobile UI idioms.
