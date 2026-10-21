# Firebase design (v2)

The app keeps its vanilla-ES-modules, no-build architecture. Firestore
replaces IndexedDB as the source of truth for events/images/calendars;
Google sign-in replaces "implicit local user". All security lives in
`firestore.rules` (default deny). The service worker still precaches the
whole shell, now including the pinned Firebase SDK files, so the app
opens offline on previously loaded data.

## Runtime dependency

Single allowed third-party runtime dependency:

- Firebase JS SDK **12.19.0** (exact pin; released 2026-09-09, well over
  the required two-week age). Loaded as pinned ES modules from
  `https://www.gstatic.com/firebasejs/12.19.0/firebase-*.js`, wrapped
  exclusively in `js/firebase/sdk.js` (no other module imports the SDK).
  The service worker precaches these three files (`firebase-app.js`,
  `firebase-auth.js`, `firebase-firestore.js`) — gstatic serves them
  with `access-control-allow-origin: *` and 1-year immutable caching.
- Dev-only: `firebase-tools` + `@firebase/rules-unit-testing` (npm
  i-gnore; the app itself needs no install). The Firestore emulator
  requires Java 11+ only when *running tests locally*.

## Data model

- `users/{uid}`
  `{ displayName, email, photoURL, username, createdAt, settings }`
  with `settings = { weekStartsOn: 0|1, lastView, activeCalendarId }`.
  `email` is private (readable only by its owner). `username` is
  set once and immutable afterwards.
- `usernames/{username}` (doc id *is* the username)
  `{ uid, displayName, photoURL, createdAt }`. Listing is denied; only
  exact `get()` is allowed (availability check + invite lookup).
- `calendars/{calendarId}`
  `{ name (1-60), ownerUid, memberUids: [uid] (max 20, owner included),
  members: { [uid]: { role: "owner"|"member", displayName, username,
  photoURL, joinedAt } }, createdAt, updatedAt }`
- `calendars/{calendarId}/events/{eventId}`
  All existing event fields (title, color, date, time, timezone,
  locationLink, recurrence {freq, interval, until, exceptions},
  imageStatus) plus `createdBy`, `isRecurring` (always
  `recurrence != null`), `imageUpdatedAt`, `createdAt`, `updatedAt`
  (server timestamps). Client timestamps inside app state are mapped to
  epoch ms.
- `calendars/{calendarId}/images/{eventId}`
  `{ bytes (Firestore Bytes, WebP, <=256 KB), mime: "image/webp",
  width, height, createdBy, updatedAt }`
- `invites/{calendarId}__{inviteeUid}` (doc id encodes the pair)
  `{ calendarId, calendarName, inviteeUid, inviteeUsername,
  inviterName, createdAt }` (the inviteeUid field backs invite-only
  reads). Immutable (no updates); deleted on accept/decline/revoke.

## Queries and indexes

Per active calendar exactly two event listeners:

1. `isRecurring == false` + `date` in `[visibleStart - 1, visibleEnd + 1]`
   (+ one period of prefetch), ordered by `date`. The 1-day buffer
   covers viewer-timezone day shifts of timed events.
2. `isRecurring == true` (any date), recurrence filtered client-side by
   `until` and expanded lazily for the visible range only.

Composite index required: `events(isRecurring, date)` — see
`firestore.indexes.json`. The images collection is never listened to;
images are fetched lazily per rendered event (exact `get()`), cached
in memory (Map -> object URL), URLs revoked when evicted.

Invites inbox: one realtime listener per signed-in user on
`invites` where `inviteeUid == uid` (single-field, automatic). The
calendar list query `calendars where memberUids array-contains uid` is
automatic too.

Firestore persistent local cache (IndexedDB) is enabled with
`localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})`,
so reviewed data works offline and writes queue until reconnection. A
small header pill shows offline/syncing state derived from snapshot
`metadata.fromCache` + `hasPendingWrites`.

## Rules summary (source of truth; the UI mirrors them)

Helpers: `isSignedIn()`, `isMember(calId)`, `isOwner(calId)` via the
calendar doc's `memberUids` + `ownerUid`.

- **users**: each user reads/writes only their own doc. `username` can
  be written exactly once, must match the `usernames/{name}` doc
  claimed in the same batch (verified with `getAfter`), and only during
  creation of that username claim. Other fields validated.
- **usernames**: `get` for any signed-in user; `list` denied. Create
  only if: id matches `^[a-z0-9_]{3,20}$`, `data.uid ==
  request.auth.uid`, exact key set, not already a member of the batch
  path, `getAfter` confirms `users/{uid}.username == doc id` (atomic
  pair), and the caller has no username yet. Update: owner may change
  `displayName`/`photoURL` only. Delete denied.
- **calendars**: create = signed-in owner with `memberUids == [uid]`,
  members map containing only self as "owner", valid name. Read =
  member or owner (satisfies `array-contains` queries). Update:
  (1) owner — may rename and manage members; `ownerUid` immutable, the
  owner can never be removed from `memberUids`, `memberUids` stays
  <= 20 (members-map uid counts must stay in sync with it; rules
  cannot verify the exact CONTENT of other members' entries during a
  leave, an accepted limitation since entries only carry display
  data); (2) invitee accepting — requires the matching
  `invites/{cal}__{caller}` doc to exist pre-batch and be consumed by
  the same batch (`!existsAfter`) and the diff to touch only
  `memberUids`/`members`/`updatedAt` while adding exactly the caller as
  role "member" with their own stored username; (3) member leaving —
  removes exactly their own uid and entry (never the owner's). Delete
  = owner only. An invitee cannot READ the calendar before joining:
  the invite card renders from the invite's own snapshot. In batched
  writes `get()`/`exists()` see pre-batch state while `getAfter()`/
  `existsAfter()` see post-batch state — nested-read permission checks
  always evaluate pre-batch, so invitee-vs-owner branches avoid nesting
  protected calendar reads where possible.
- **events**: read = member. Create = member + `createdBy == uid` +
  full field validation (title 1-80, color key from the 8 palette
  colors in `js/config.js`, date `YYYY-MM-DD`, time `HH:mm` or null,
  timezone shape-checked <=64 chars, locationLink null or http(s),
  `isRecurring == (recurrence != null)`, recurrence interval 1-365,
  imageStatus enum with pending/ready/failed requiring an
  `imageRequestedAt` timestamp, timestamps are serverTimestamp).
  Update/delete = creator or owner; `createdBy` immutable.
- **images**: read = member (direct get only, no listing); write =
  event creator only; `{ bytes (Firestore Bytes <= 256 KB), updatedAt
  (serverTimestamp) }`. Delete = creator or owner.
- **invites**: doc id must equal `calendarId + "__" + inviteeUid`;
  create = calendar owner only + exact `usernames/{inviteeUsername}`
  exists with matching uid + invitee not already a member + calendar
  not full (20). Read/list = invitee (`inviteeUid == uid`) or calendar
  owner. Delete = invitee or owner. No updates.

## Auth flow

Google provider only, `signInWithRedirect` (Option 1: `authDomain` of
the serving domain — Firebase Hosting domain in production,
`localhost` + emulator in dev) with `getRedirectResult()` on boot. A
skeleton renders until auth resolves; a sign-in screen with a single
"Continue with Google" button renders for signed-out users.

First sign-in (or whenever the Firestore user doc lacks a username)
forces a blocking onboarding screen: slugified suggestion from the
Google displayName (never email), debounced exact `usernames/{name}`
availability checks, live states (available / taken / invalid), an
idempotent profile + default calendar ("My calendar") creation, then an
atomic claim: one batched write of `usernames/{name}` +
`users/{uid}.username`. If the batch fails with permission-denied
(someone took the name between check and write) the UI shows "taken or
invalid" and lets the user retry. Reserved words are rejected
client-side (list in `js/config.js`).

Account menu: avatar, name, (own) email, `@username` with copy button,
sign out. Sign-out detaches every Firestore listener, terminates
Firestore and clears its persistent cache, clears memory state, and
returns to the sign-in screen so shared data never lingers.

## Image pipeline (Firestore Bytes, no paid plan)

Generator is still the user's own device-local Gemini/Cloudflare key
(stored in IndexedDB, never exported, never in Firestore). Creator flow
writes the event `imageStatus: "pending"` + `imageRequestedAt`, then
generates, compresses to WebP stepping down 512/q0.8 -> 384/q0.6 until
<= 256 KB, and writes in one batch `images/{eventId}` +
`events/{eventId}.imageStatus = "ready"` (+ `imageUpdatedAt`). Failure
-> `"failed"`. Shimmer for pending; `>= 5 min` pending decays to a
failed/retry affordance locally. Remove/regenerate require the same
permission as editing (creator or owner); regenerate prompts members
without a local key to add one in Settings.

## Sharing / invites

Header calendar switcher sheet (list, active, create, rename/delete/
leave via a calendar settings sheet) + invites badge. Share sheet:
member list + pending invites (Revoke) + "Add person" by exact
`@username` lookup with confirmation card — never list/search users.
Accept = one batched write (calendar memberUids/members + delete
invite), then "Open calendar".

## Migration (one-time)

After first successful sign-in, if the legacy IndexedDB `calendar` DB
has events, offer a sheet: "Import N events from this device into My
calendar?" (Import / Not now / Discard). Import writes in batches
(<= 500), stamps `createdBy = uid`, then deletes the local copy after
user-confirmed success. "Not now" keeps the prompt for next sign-in.
The device-only settings store (Gemini bridge URL/secret etc.) is not
migrated — it stays local by design.

## Offline / errors

- Everything except image generation works offline (cached events,
  queued writes). The shell precache makes cold starts work too.
- Write errors surface as toasts (`permission-denied` maps to a
  friendly "not allowed" message; the UI hides controls the user
  cannot use, and rules remain the backstop).
- Undo delete keeps working: hide locally, commit delete after the
  6-second toast, restore on undo.

## App Check

Optional hardening, not enforced in v1; documented in the README for a
later milestone.
