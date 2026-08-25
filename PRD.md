# Savour — Product Requirements Document

**Status:** Draft v1
**Date:** 2026-08-22
**Platforms:** iOS (primary), Android (secondary)
**Stack:** React Native (Expo), Supabase

---

## 1. Summary

Savour is a mobile app that brings back the intentionality of shooting film. Instead of an infinite camera roll and instant previews, users shoot into shared **rolls** — capped-length photo albums, solo or with friends — and see the results only once the roll is full. It's built to slow people down and make photo-taking feel like an event again, not a reflex.

## 2. Problem & Motivation

Smartphone cameras removed every constraint that used to make photography deliberate: limited exposures, no instant preview, one shot per moment. The result is thousands of near-identical, disposable photos and no ritual around taking or revisiting them.

Savour reintroduces those constraints on purpose:
- A **fixed number of frames** per roll forces a choice about what's worth capturing.
- **Shared rolls** turn a photo album into a group activity (a trip, a party, a weekend) instead of a solo camera roll.
- A clear **finished** state gives photos a moment of arrival, instead of disappearing into an endless stream.

## 3. Goals

- Let a user create a roll, define its size, and invite friends with a single shareable code.
- Let any member of a roll contribute photos through the app's camera until the roll is full.
- Surface completed rolls as albums the user can revisit, on a simple two-tab app.
- Ship an iOS-first MVP that also runs on Android from the same Expo codebase.

### Non-Goals (for this MVP)

- Photo/video editing beyond a single filter slot.
- Importing photos from the system camera roll (capture is in-app only — see §9.1).
- Comments, likes, or reactions on photos.
- Push notifications, activity feeds, or messaging.
- Web app.

## 4. Target Users

- Friend groups who want a shared album for a trip, party, or hangout without setting up a group chat photo dump.
- Individuals who want a "disposable camera" habit for personal moments (solo rolls).

Primary persona: a phone-native user in their late teens to 30s who already uses BeReal/Instagram/Snapchat, drawn to the novelty and nostalgia of film-style constraints.

## 5. Core Concepts (Glossary)

| Term | Definition |
|---|---|
| **Roll** | A capped-length shared album. Has a name, a max frame count, a filter, and a share code. |
| **Frame** | One photo slot in a roll. A roll with `max_frames = 24` has 24 frames. |
| **Member** | A user who has joined a roll (owner or joined via code). Any member can shoot into the roll. |
| **Active roll** | A roll with frames remaining (`photo_count < max_frames`). |
| **Finished roll** | A roll where every frame has been shot, or that the owner developed early (§9.9). Read-only from that point on; appears on Home. |
| **Album** | How a finished roll is presented — its frames laid out for viewing. "Roll" is the thing you shoot into; "album" is the thing you look at afterwards. |
| **Share code** | A short code that lets others join a roll. |

## 6. Information Architecture

Two tabs, available after sign-in:

1. **Home** — grid of the user's finished rolls (albums), newest first.
2. **Camera** — entry point for shooting: join a roll, start a roll, or shoot into an active roll.

No other top-level navigation for MVP. Album detail and the create/join flows are modals/screens pushed from these two tabs.

**One exception:** the viewfinder is presented **full-screen with the tab bar hidden**, exited by a back chevron. Shooting is a mode you enter and leave, not a place you browse from, and a tab bar under a camera is chrome competing with the thing the screen exists for. Back returns to wherever the viewfinder was entered from — Home, or the roll chooser.

## 7. User Flows

### 7.1 Onboarding & Auth
1. App opens to a sign-in screen: **Continue with Apple** (primary button) and **Continue with Google** (secondary button).
2. Supabase Auth handles both via native OAuth (Sign in with Apple on iOS, Google sign-in on both platforms).
3. **First sign-in only:** user is routed to a **Set Up Profile** step before entering the app — choose a **username** (required) and optionally add an **avatar** (§7.1a). This is when the `profiles` row is created.
4. Returning users (a `profiles` row already exists) skip straight past this step on every subsequent sign-in.
5. User lands on **Home** (empty state if no finished rolls yet).

### 7.1a Set Up Profile
- **Username** — required, the identity shown next to a user's photos and in roll member/contributor lists. Validated live against `profiles.username` for uniqueness and character rules (§9.6).
- **Avatar** — optional. Tap the avatar circle to take a new photo or pick one from the photo library. Skipping shows an initials-based placeholder instead. (Choosing from the library is intentionally allowed here — it's a one-time profile photo, not a roll frame, so it isn't covered by the camera-only capture rule in §9.1.)
- "Continue" is disabled until the username is valid and available; the avatar is never required to proceed.

### 7.2 Camera tab — no active roll
- Two large actions: **Shoot a Roll** and **Join a Roll**.
- **Join a Roll** → text field for a 6-character code → validates against `rolls.share_code` → on success, adds the user to `roll_members` and opens the camera for that roll.
- **Shoot a Roll** → Create Roll form (§7.3).

### 7.3 Create Roll
Required fields:
- **Name** (text, required, e.g. "Cabo 2026")
- **Exposures** — a picker with fixed options (12 / 24 / 36, matching real film-roll lengths), required. "Exposures" is the user-facing label; `max_frames` is the column.
- **Filter** — a selector. MVP ships a single enabled option, **None**; additional stocks are shown as dimmed, non-selectable "Soon" tiles so the roadmap reads at a glance without expanding v1 scope (see §9.3).

On submit:
- Creates a `rolls` row with `status = active`, `photo_count = 0`, and a generated **share code**.
- Creator is added to `roll_members` as `role = owner`.
- User lands on a **Share Roll** screen showing the code (and a native share sheet) with a "Start Shooting" button into the viewfinder. The code is **only** shown here and on the roll's overflow menu — never on the Create form, where it would be advertising an ID that doesn't exist yet.

### 7.4 Shooting
- The Camera tab always opens the **roll chooser**, whatever the number of active rolls. An earlier version went straight to the viewfinder when there was exactly one — that saved a tap but hid the share code, the progress, and Develop now behind a screen that is awkward to back out of, and it made the tab's behaviour change shape as rolls came and went.
- Tapping a roll opens its viewfinder; the chooser is where you also join, start a roll, copy a code, or develop early.
- The viewfinder's only readout is a **mechanical frame counter** counting *up* (§9.7). No member count, no percentage, no progress bar.
- Shutter button captures a photo, uploads it to Supabase Storage, and inserts a `photos` row with the next `frame_number`.
- No retake/preview-and-discard step, and no importing existing photos from the library — capture is a single deliberate action (§9.1).
- When the captured photo brings `photo_count` to `max_frames`, the roll's `status` flips to `finished`, `finished_at` is set, and the shooter sees the **Roll Finished** screen (§7.5a). The roll leaves the active set and appears on Home for every member.

### 7.5 Home / viewing a finished roll
- Home shows a grid of finished-roll covers (roll name, exposure count, finished date, contributor avatars — not a single-author byline, since rolls are collaborative).
- Tapping a roll opens the **album**: frames in shooting order, at their **native aspect ratios**, in staggered columns with white print borders, each tagged with a small avatar of whoever shot it.
- Frames are deliberately **not** normalised to a uniform grid. Portrait and landscape are how the photographs were actually composed, and squaring them off crops that decision away — the variety is what makes the album read as a set of prints rather than a feed. (This reverses an earlier contact-sheet spec, which numbered every frame in a rigid grid.)
- Tapping a frame opens it full-bleed.

### 7.5a Roll Finished
The payoff moment of the product, and the most designed screen in the app. Triggered for the shooter who takes the final frame, and reachable from a Home entry for every other member the next time they open the app: the roll's name, "36 of 36 · developed", the contributors, and a single CTA into the album.

## 8. Screen-by-Screen Requirements

### Sign-in
- Continue with Apple, Continue with Google. No email/password path for MVP.
- Must satisfy Apple's guideline that Sign in with Apple be offered wherever another third-party/social login is offered.
- First-time sign-in only: routes into the Set Up Profile screen below before Home is reachable.

### Set Up Profile screen (first sign-in only)
- **Username** field, required. Live availability/format check against `profiles.username`; inline error if taken or invalid.
- **Avatar**, optional. Tap to take a photo or choose one from the library; shows an initials placeholder if skipped.
- "Continue" disabled until username is valid; never blocked on avatar.

### Home tab
- Grid (2 columns) of finished rolls only. Active rolls do **not** appear here.
- Empty state: short copy + a CTA that deep-links to the Camera tab's Shoot/Join actions.
- Pull-to-refresh.

### Camera tab
- **State A** — no active roll: **Shoot a Roll** / **Join a Roll** CTAs.
- **State B** — one or more active rolls: the roll chooser. Each card shows the roll name, count (28 / 36, counting up), contributors, and the roll's **share code with a Copy action** (§9.8), plus **Develop now** past 75% (§9.9). Tapping a card opens that roll's viewfinder. Shoot/Join reachable from the bottom of this screen.
- The viewfinder is a pushed screen, never the tab's landing state — full-screen with the tab bar hidden, exited by the back chevron.
- Camera permission is requested the first time the user reaches a viewfinder.

### Create Roll screen
- Fields: Name, Exposures (picker), Filter (picker, "None" enabled only; others dimmed "Soon").
- Validation: name required (1–40 chars), exposures required from the fixed option set.
- Submit disabled until valid. **No share code on this screen.**

### Share Roll screen
- Shown immediately after creation: roll name, exposure count, the 6-character code, native share sheet, and a plain statement of the hidden-until-full rule.
- Primary CTA "Start shooting".

### Join Roll screen
- Single code input (6 chars, auto-uppercase, no prefix).
- Inline error for invalid code or a roll that's already finished.

### Roll Finished screen
- Fires for the shooter who takes the final frame; every other member gets it on next open.
- Roll name, "N of N · developed", contributor list, single CTA into the album.
- Highest motion-design priority in the app.

### Album (from Home)
- Frames in shot order at their native aspect ratios, in two staggered columns with white print borders — never cropped to a uniform grid.
- Each frame carries a small avatar of whoever shot it.
- Header carries roll name, finished date, contributor avatars, and for a roll developed early, "developed early · N of M".
- Tapping a frame opens it full-bleed.
- **Tapping a frame opens it full-bleed** on a black ground, with the shooter's avatar and username and its frame number. **Swipe left/right to move through the roll** — arriving at one photo and being able to keep going is the point of a roll, so the viewer is a pager, not a single-photo screen. Hidden frames are skipped rather than shown as gaps.
- **Long-press a frame** for an action sheet: *Hide this photo* (any member; soft hide, attributed, reversible) and *Report photo* (reason picker). A hidden frame renders as a placeholder reading "hidden by @user" rather than closing the gap, so the roll's length stays honest. **Tapping a contributor avatar** offers *Block*. See §9.10.

### Profile sheet
- Reached from the Home header avatar: username and avatar editing, **blocked users with an unblock action**, a support contact address, sign out, and account deletion (§14 Q3).

> **Visual reference:** rendered mockups for all ten screens live in the published PRD artifact under §8 Screen Designs.

## 9. Key Product Decisions & Assumptions

These aren't specified by the source brief; each is a reasonable MVP default, called out so it can be confirmed or overridden before build.

### 9.1 Capture is camera-only, no library import
Assumption: to protect the "intentional" premise, users can only add a frame by taking a photo in the moment — no picking an existing photo from their library. This is the single highest-leverage constraint for the product's stated motivation, so it's treated as a requirement, not just a default. Recommend confirming before build since it does remove a familiar capability (posting an existing photo).

### 9.2 Photos are hidden until the roll finishes — **decided, in scope for v1**
No member — *including the shooter who took the frame* — can see any photo in a roll until the roll reaches `max_frames`. This was previously an open question; it is now a v1 requirement, because it is what makes the finish a moment rather than a milestone, and because retrofitting it later is an access-control change on `photos`, not a UI tweak.

No additional artificial "developing" delay after the roll fills — the finish itself is the reveal. A timed delay is a v2 experiment (§15).

Consequences: the viewfinder shows no last-shot thumbnail; active rolls show a progress state and never a preview; `photos` SELECT is gated on `rolls.status = 'finished'` in RLS (§10), so the rule holds even against a tampered client.

### 9.3 Filter architecture, not just a UI stub
Only **None** ships enabled, but `rolls.filter` is a free-text/enum column and the capture pipeline applies filters through a single swappable function, so adding real filters later needs new filter implementations and picker options, not a schema or pipeline change.

**Naming:** filters must **not** be named after real film stocks. "Portra", "Tri-X", "Fuji", and near-misses like "Koda" are Kodak/Fujifilm trademarks; shipping them invites App Store review and legal problems. Use descriptive original names (e.g. Warm 400, Monochrome, Cool Cast).

**Picker behavior:** filter previews must all show the *same* source photo. A picker where each tile shows a different scene makes the filters impossible to compare, which is the picker's only job.

### 9.4 Share code, not a deep link
A 6-character code (uppercase, excludes ambiguous characters `0/O/1/I`) is the primary join mechanism, shareable as plain text via the native share sheet. **No `ROLL-` prefix** — it is five characters a person has to read aloud or type that carry no information. A universal link that pre-fills the code is a cheap v1.1 add-on, not required for MVP.

### 9.5 Three concurrent active rolls; no cap on roll membership — **decided**
A user may be in **3** active rolls at once, switching between them on the Camera tab.

The limit counts **memberships, not owned rolls**: joining and creating draw on the same budget, or someone already in three joined rolls could still start three more. It is enforced server-side in both `create_roll()` and `join_roll_by_code()`, read from a single constant — `max_active_rolls()` — so the number changes in one place and both paths follow.

The cap is set from the product's premise rather than from abuse. A camera holds one roll, and the Roll Finished screen is the payoff (§7.5a); the more rolls a person runs at once, the more often that moment fires and the less it lands. Deterring automated roll-spam is a side benefit, not the reason — that goal would have been met by almost any number.

A roll still has **no member limit** beyond what its `max_frames` naturally constrains: many members simply exhaust the frames faster.

**Known rough edge.** Because joining spends the same budget, a user at the cap who is handed a share code in person is refused outright — a failure they did not cause, at the worst moment. `leaveRoll()` and develop early (§9.9) are both remedies, but neither is offered at the point of failure; the client only says *"You're in as many rolls as Savour allows at once."* Worth resolving before launch.

### 9.6 Username & avatar setup
`display_name` is replaced by a required, unique **username** (3–20 characters, letters/numbers/underscore) collected right after first sign-in, since it's how a user is identified next to their photos and in shared-roll member lists — a provider-supplied display name isn't guaranteed unique or even present (e.g. some Apple sign-ins withhold the real name after the first grant). Avatar is optional and user-supplied only; MVP does not pull a default photo from Apple/Google. Uniqueness and format are enforced both client-side (live check) and with a unique constraint on `profiles.username` server-side.

### 9.7 The counter is mechanical, and it counts up
The viewfinder's frame counter is modeled on a film camera's top-plate counter, and sits top-right where that counter physically lives on a camera body. It counts **up** — exposures taken, not shots remaining — because that is what the real mechanism does. This supersedes the earlier "12 shots left" treatment. Active-roll cards read the same direction (24 / 36) so one mental model holds across the app.

**The dial is machined, not printed:** a knurled ring, a recessed window with an inner shadow, a red index mark at twelve o'clock, and the previous and next frame numbers clipped at the window's edge — that last detail is what makes it read as a turning drum rather than a number in a circle. A flat ink-on-ivory alternative was tried and set aside; the machined version won on comparison.

The roll length is **not** printed on the counter. A real camera doesn't tell you how long the roll is — you know because you loaded it — and the roll length is already stated at creation and on the active-roll card. Everything else is stripped from the viewfinder too: member count, percentage, progress bar. Corner framing marks and a split-image spot stand in for an optical finder. The tactile metaphor is the priority here, ahead of informational density.

**The finder sits low on the body.** A top plate carries the back control and the counter, and the finder opens below it rather than filling the screen edge to edge — the proportions of a camera you hold, not of a phone camera app. It also puts the finder nearer the shutter, where the hand already is.

**Build note:** the counter should advance with a mechanical step on capture — a single-frame rotation with a hard stop, paired with a sharp haptic — not a smooth numeric tween. The advance is the feedback that a frame was consumed.

### 9.8 Share code stays reachable after creation
The code appears on the Share Roll screen at creation **and** on every active-roll card, with a Copy action. Inviting someone to a roll already underway is a common case — a friend shows up halfway through the night — and it shouldn't require an overflow menu. The code is never shown for a finished roll, since joining one is impossible.

### 9.9 Develop early at 75% — **decided**
Once a roll has used **75% of its exposures**, the owner can develop it early. Thresholds: **9 of 12**, **18 of 24**, **27 of 36** — `ceil(max_frames × 0.75)`. Developing early is exactly the normal finish: `status` becomes `finished`, `finished_at` is set, photos unlock for every member, and the roll moves to Home.

**The unused frames are forfeited.** The album header records it — "developed early · 28 of 36" — so the cost of finishing short is visible rather than hidden, and filling a roll properly stays quietly worth doing.

**Owner only, and irreversible.** Any member being able to end a roll everyone else is still shooting into invites griefing; the `owner` role already exists for exactly this kind of call. The action lives on the active-roll card rather than as a button on the viewfinder — developing early is the exception, not the path — and it takes a confirmation naming what is lost: "Develop now? 8 frames will be left unexposed. This can't be undone."

**Enforcement is server-side.** Clients may not write `status` (§10). Early development goes through a `SECURITY DEFINER` function that re-checks caller-is-owner, `status = 'active'`, and `photo_count >= ceil(max_frames * 0.75)`. A client-side check alone would let a tampered client unlock photos at frame one, which is the exact thing §9.2 exists to prevent.

**What this does not solve:** a roll abandoned *below* 75% is still trapped forever. The rule covers rolls that nearly made it, not rolls that died early — see §14.

### 9.10 Safety: reporting, blocking, removal, and join limits — **decided**
Four small pieces, justified by three different things. Only one is about malicious strangers, and it's the least likely to matter in practice.

**Report a frame — App Review compliance.** Long-press any frame in a developed album → reason picker (nudity, violence, harassment, other) → writes a `reports` row. The frame is hidden for the reporter immediately, so the action visibly does something; triage happens by email against the `reports` table. Guideline 1.2 applies to an app on what it *can* host, not on who the developer expects to use it: photos go from one user to another, so it reads as user-generated content regardless of the fact that share codes travel between friends.

**Block a user — App Review compliance.** From any member avatar. A blocked user's attempts to join rolls the blocker owns fail, and rolls they own stop appearing for the blocker. **Blocking is not retroactive** — it does not dissolve existing shared membership or pull frames out of albums already developed, because that would punch holes in other people's finished work. State this in the block confirmation rather than letting it be discovered.

**Request removal — a real product need, not compliance.** The product's own rules create this one. No retakes, no deleting a frame, nothing visible until development — so a friend can shoot an unflattering or private photo of you at frame 6, and you first learn it exists thirty frames later when the album opens for everyone, with no way to remove it. Nobody was malicious; the design did that. "My friend has a photo of me I want gone" is a far more likely support email than anything involving a stranger.

Any member may hide a frame in a developed album. It is a **soft hide** — `photos.hidden_at` is set and the frame renders as a placeholder reading "hidden by @user", with `frame_number` retained so the sequence never breaks. Attribution is deliberate: it is reversible by the person who hid it or by the roll owner, and in a friend group visible attribution is self-policing enough without an approval workflow. If that proves too permissive, the fallback is to require the shooter's or owner's approval, at the cost of a round trip.

**Join rate limiting — needed regardless of any of the above.** Excluding ambiguous characters leaves ~32 symbols, so a 6-character code has ≈1.07 billion combinations. That is only safe until you divide by the number of open rolls: at 100,000 active rolls a random guess lands about **1 in 10,000**, which is trivially scriptable. An attacker never needs a specific code, only *a* code.

Two mitigations, both server-side. Joining moves behind a `join_roll_by_code()` function so clients never hold SELECT on `rolls` by `share_code` — without this the join path is an enumeration oracle that returns roll metadata for any guess. And that function rate-limits: 10 failed attempts per user per hour, then a lockout. **This is the piece to build even if everything else in §9.10 is deferred.**

**Contact.** A support address in App Store Connect and in the profile sheet, alongside a list of blocked users with an unblock action.

**Total scope:** two tables, one nullable column, one RPC, two action sheets, and an inbox. §9.2 keeps it cheap to operate — because nothing is visible until development there is no live feed to police, so every report is necessarily after the fact and can be handled in batches.

## 10. Data Model (Supabase / Postgres)

```
profiles
  id              uuid PK, references auth.users(id)
  username        text not null unique
  avatar_url      text                       -- nullable; optional, user-uploaded
  created_at      timestamptz default now()

rolls
  id              uuid PK default gen_random_uuid()
  name            text not null
  owner_id        uuid not null references profiles(id)
  max_frames      int not null
  filter          text not null default 'none'
  share_code      text not null unique
  status          text not null default 'active'   -- 'active' | 'finished'
  photo_count     int not null default 0
  developed_early bool not null default false      -- finished below max_frames (§9.9)
  created_at      timestamptz default now()
  finished_at     timestamptz

roll_members
  roll_id         uuid references rolls(id)
  user_id         uuid references profiles(id)
  role            text not null default 'member'   -- 'owner' | 'member'
  joined_at       timestamptz default now()
  primary key (roll_id, user_id)

photos
  id              uuid PK default gen_random_uuid()
  roll_id         uuid not null references rolls(id)
  user_id         uuid not null references profiles(id)
  storage_path    text not null
  frame_number    int not null
  taken_at        timestamptz default now()
  hidden_at       timestamptz                      -- soft hide (§9.10); frame_number retained
  hidden_by       uuid references profiles(id)
  unique (roll_id, frame_number)

reports                                            -- §9.10
  id              uuid PK default gen_random_uuid()
  photo_id        uuid not null references photos(id)
  reporter_id     uuid not null references profiles(id)
  reason          text not null                    -- 'nudity'|'violence'|'harassment'|'other'
  note            text
  status          text not null default 'open'     -- 'open'|'actioned'|'dismissed'
  created_at      timestamptz default now()
  unique (photo_id, reporter_id)

blocks                                             -- §9.10
  blocker_id      uuid references profiles(id)
  blocked_id      uuid references profiles(id)
  created_at      timestamptz default now()
  primary key (blocker_id, blocked_id)
  check (blocker_id <> blocked_id)

join_attempts                                      -- §9.10 rate limiting
  user_id         uuid not null references profiles(id)
  attempted_at    timestamptz not null default now()
  succeeded       bool not null
  index (user_id, attempted_at desc)
```

**Storage:** Supabase Storage bucket `roll-photos`, path convention `roll-photos/{roll_id}/{frame_number}.jpg`.

**Row Level Security (high level):**
- `profiles`: readable by any authenticated user (usernames/avatars need to show up in other members' roll/contributor lists); insert/update restricted to the row's own user, and only before that user has set a username for insert.
- `rolls`: readable by members only (join via `roll_members`); insert by any authenticated user (becomes owner); update restricted to server-side triggers (status/photo_count) and owner (name only, pre-first-photo).
- `roll_members`: **no direct client insert.** Joining goes through `join_roll_by_code()` (§9.10) so clients never hold SELECT on `rolls` by `share_code` — a client that can look up a roll by code is an enumeration oracle. Select restricted to members of that roll.
- `reports`: insert by any authenticated user for a photo in a roll they belong to; select restricted to the reporter (triage happens server-side, not in the app).
- `blocks`: insert/delete/select restricted to `blocker_id = auth.uid()`. A user can never see who has blocked them.
- `photos`: insert allowed only by a member of an `active` roll, only for the next sequential `frame_number` (enforced via a Postgres function/trigger, not client-trusted). **Select requires both roll membership and `rolls.status = 'finished'`** — per §9.2, not even the shooter can read back their own frames before the roll fills. Storage bucket policies must mirror this, or signed URLs leak what RLS protects.
- `photo_count`/`status` transition to `finished` handled by a database trigger on `photos` insert, not by client writes, to prevent tampering.

**Early development (§9.9)** is the only other path to `finished`, and it is a `SECURITY DEFINER` function rather than a client UPDATE:

```
develop_roll_early(p_roll_id uuid) returns rolls
  -- asserts, in this order:
  --   auth.uid() = rolls.owner_id             (owner only)
  --   rolls.status = 'active'                 (not already developed)
  --   photo_count >= ceil(max_frames * 0.75)  (75% threshold)
  -- then sets status='finished', finished_at=now(), developed_early=true
```

The threshold must be re-checked here even though the client hides the action below 75% — a client-side check alone would let a tampered client unlock photos at frame one, defeating §9.2 entirely.

**Joining (§9.10)** is likewise a function, not a client query:

```
join_roll_by_code(p_code text) returns rolls
  -- rate limit: >= 10 failed attempts in the last hour -> raise, log, stop
  -- resolve p_code -> roll; not found -> log failure, generic error
  -- reject if status = 'finished'  (joining a developed roll is meaningless)
  -- reject if owner has blocked auth.uid()               (§9.10)
  -- reject if auth.uid() already has 5 active rolls      (§14 Q4)
  -- insert roll_members(roll_id, auth.uid(), 'member'), log success
```

The error for a wrong code and for a blocked user must be **identical**, or the endpoint tells an attacker which codes are real.

## 11. Technical Architecture

- **App:** React Native via Expo (Expo Router for navigation, managed workflow / EAS Build for iOS + Android).
- **Auth:** `expo-apple-authentication` (iOS) + Google OAuth via `expo-auth-session` / `expo-web-browser`, both exchanged for a Supabase session using `supabase.auth.signInWithIdToken`.
- **Camera:** `expo-camera` for the in-app viewfinder and capture (no `expo-image-picker`, per §9.1).
- **Data/Realtime:** `@supabase/supabase-js`; realtime subscription on a roll's `photos`/`photo_count` so all members see frame progress live while shooting.
- **Storage/Images:** Supabase Storage for originals; `expo-image` for cached, performant grid/gallery rendering.
- **State:** React Query (or Supabase's own caching) for server state; minimal local/UI state otherwise.

## 12. Non-Functional Requirements

- **Performance:** camera must open in under ~1s from tab focus; photo upload happens in the background with an optimistic local placeholder in the frame counter.
- **Offline:** a capture taken with no connectivity queues locally and uploads on reconnect; user is not blocked from continuing to shoot up to the local cache limit.
- **Privacy:** a roll's photos are visible only to its members; leaving/removing a member is out of scope for MVP (open question, §14).
- **Platform parity:** feature set is identical on iOS and Android; iOS ships first and is the primary QA target, Android follows before public launch.

## 13. Success Metrics

- Rolls created per week; % of created rolls that reach `finished`.
- Median members per roll (signal for the "shared" premise actually being used).
- Time from roll creation to first photo, and creation to finish (engagement/cadence signal).
- D1/D7 retention for users who finish at least one roll.

## 14. Open Questions

Questions 1, 4 and 5 are **resolved** — develop early at 75% (§9.9), the active-roll cap (§9.5) and safety (§9.10). The rest carry a recommendation each; they need a yes or no, not more analysis.

| Question | Recommendation |
|---|---|
| **1a. Rolls abandoned below 75%** (residue of §9.9) | Auto-develop any roll with no new frame for **60 days**, at whatever count it reached, with a warning notification at day 53. Below-threshold rolls are otherwise trapped forever, and an owner who has lost interest is exactly the owner who won't come back to press a button. Alternative if that feels heavy: let the owner *delete* a sub-threshold roll outright, which frees the clutter but destroys other members' frames. |
| **2. Leaving, removing, deleting** | **Leave:** yes, any member may leave an active roll — their existing frames stay. Pulling them would renumber the sequence and break `unique (roll_id, frame_number)`. **Delete:** owner may delete a roll only while `photo_count = 0`; after the first frame it is partly someone else's object. **Remove a member:** defer past v1 — low value, and it doubles as a griefing tool. |
| **3. Owner deletes their account** | Rolls survive; ownership passes to the earliest-joined remaining member. A roll with no other members is deleted with the account. The profile is tombstoned — username and avatar cleared, attribution becomes "a deleted account" — but **frames already contributed to shared rolls remain**, because pulling them would punch holes in other people's finished albums. Apple requires account deletion to be offered, and this is the standard collaborative-product resolution, but it must be disclosed in the privacy policy and restated in the deletion confirmation. **Worth a lawyer's eye before launch.** |
| **4. Cap on concurrent active rolls** — **RESOLVED → §9.5** | **3**, enforced server-side in `max_active_rolls()` and counted across memberships rather than owned rolls. Set from the premise — a camera holds one roll, and frequent finishes cheapen the payoff — not as anti-spam insurance, which was the original justification for 5. One constant, both call sites, trivially changed later. Not a monetization lever in v1. |
| **5. Moderation & reporting** — **RESOLVED → §9.10** | **Now specified in §9.10** and in scope for v1: report a frame, block a user, hide a frame of yourself, a support contact, and — the piece that matters independently of moderation — server-side rate limiting on the join path, because a 6-character code is an enumeration target once many rolls are open. |
| **6. Should Home show active rolls?** | Yes, as a compact "In progress" strip above the developed grid — name and frame count only, no imagery, tapping goes to the viewfinder. Without it, a user's first days are spent opening onto a permanently empty screen, which is a bad outcome for the one screen meant to reward returning. Keep it visually subordinate so Home still reads as where finished work lives. |

## 15. Out of Scope / Future Roadmap

- Additional filters (the architecture in §9.3 supports adding these incrementally).
- Delayed "developing" reveal (§9.2).
- Comments/reactions on individual photos.
- Push notifications (roll finished, someone joined your roll, frames running low).
- Downloading/exporting a finished roll as a physical-print order or PDF contact sheet.
- Web viewer for finished rolls.
