# Phase 19, slice 6 — Start the app with no signal; units and Today offline

One slice only. Parent brief: `docs/plans/2026-11-25-phase-19-caretaker-app.md`.
Spec: `docs/specs/2026-11-24-roadmap-features-design.md` §6 ("Offline first"; the open item
"Offline cache of units (and starting the app with no signal)").
Claude reviews the result against this file.

## Rules for this run

1. **Never `git commit` or `git push`.** Leave changes in the working tree.
2. **Build only what is listed under "What to build".** No other features, screens or
   refactors. Ideas go in the Progress note at the bottom.
3. **Before writing code**, reply with:
   - the files you will add or change;
   - exactly what is stored for the offline start, and where;
   - how the app gets back online without signing the person out (step by step).

   Stop if it doesn't match this brief.
4. Every test under "Tests that must exist" is required, including the failure cases.
5. Finish by filling in the **Progress** section at the bottom of this file (built, not built,
   anything done differently and why, each check run and its result).
6. Don't touch `hodi_app/`. Customer-facing text says KodiHQ. **App only: no backend or web
   changes.**

## Why

A caretaker opens the app in a basement or on a rooftop. Today, with no signal at launch,
the app can't restore the session and shows "Can't reach KodiHQ" (`/offline`), so nothing
works, not even the screens that already have saved data (meters, slice 3) or the offline
queues (readings, inspections). And the Units list, a unit's page and the Today list have no
saved copy at all.

## What already exists (use it, don't rebuild)

- Session restore:
  - `SessionController.build()` in `mobile/lib/core/auth/session_controller.dart` refreshes
    with the stored refresh token. A network error rethrows, and `redirectFor` in
    `lib/core/router.dart` then sends the person to `/offline`.
  - `_accept()` stores the new refresh token, sets `ApiClient.accessToken` and registers the
    push device.
  - `effectiveMode(session, chosen)` decides staff/host/tenant/owner/platform.
- Token storage: `TokenStore` / `SecureTokenStore` / `MemoryTokenStore` in
  `lib/core/auth/token_store.dart` (flutter_secure_storage).
- API client: `lib/core/api/api_client.dart`.
  - `401 TOKEN_EXPIRED` → one shared refresh (`onRefresh`) → retry.
  - **Any other 401 calls `onAuthLost`, which clears the refresh token and signs the person
    out.** A request sent with no access token gets such a 401.
- Offline cache:
  - `OfflineCache` in `lib/core/offline/offline_cache.dart` (per owner `"<userId>|<orgId>"`,
    31-day entries, cleared on sign-out and account deletion);
  - the `_fetchOrCached` / `Cached<T>` pattern and `_OfflineCacheBanner` in
    `lib/features/staff/more/meters_data.dart` / `meters_screen.dart`;
  - `queueOwnerOf`, `currentQueueOwner` in `lib/features/staff/more/reading_queue.dart`.
- Providers: `todayProvider`, `unitProvider` in `lib/features/staff/staff_api.dart`.
- The Units list (`UnitsScreen` in `lib/features/staff/units/units_screens.dart`) loads pages
  through `PagedList` → `StaffApi.units(page:, q:, propertyId:, occupancy:)` (20 per page).
- Refresh tokens last 30 days on the server (`REFRESH_TTL_DAYS`).
- Test helpers: `FakeAdapter`, `DropConnection()`, `Reply(...)`, `overridesFor`, `FakeSession`,
  `staffSession(...)` in `test/staff/helpers.dart` and `test/helpers/fake_http.dart`;
  existing tests `test/core/session_test.dart`, `test/core/router_test.dart`,
  `test/core/api_client_test.dart`, `test/staff/offline_meters_test.dart`.

## What to build

### A. Start with no signal (staff only)

**Save a snapshot.** Every time a session is accepted (`_accept`), save the `/auth/refresh`
or `/auth/login` response data **without `accessToken` and `refreshToken`**, plus the time
it was saved. Store it in the **secure** token store, not in `OfflineCache`, since it holds
the person's name, email and phone. Add `readSessionSnapshot` / `writeSessionSnapshot` /
`clearSessionSnapshot` to `TokenStore` and both implementations. Clear it wherever the
refresh token is cleared:

- sign-out;
- account deletion;
- `onAuthLost`;
- a non-network refresh failure.

**Open offline.** In `build()`, when the refresh fails with a **network error**, and only
when all of these hold:

- a refresh token is stored;
- a snapshot is stored and was saved less than **30 days** ago;
- `effectiveMode(snapshot, null)` is `AppMode.staff`;

then return an **offline session** built from the snapshot. Add `Session.offline` (bool,
default false) and leave the access token empty. Otherwise keep today's behaviour (rethrow →
`/offline`).

While the session is offline:

- don't register the push device;
- no server calls for sign-in-only actions (switching organisation, profile and so on);
- those show "You're offline. Try again when you have signal." where they're reached.

**Back online without signing out.** This is the important part.

- While `session.offline` is true, `ApiClient` must not send a request without an access
  token. Before the first request, it runs the shared refresh (`onRefresh`).
  - Refresh succeeds → the session becomes a normal online session (`offline: false`, new
    access token), and the request is sent.
  - Refresh fails with a network error → the request fails with `ApiError.network()`, so
    screens fall back to saved data as they do today. Nothing is cleared.
  - Refresh fails with 401 (token revoked) → sign out as today (clear the token, snapshot
    and cache).
- Also try to reconnect:
  - when the app resumes;
  - every **60 seconds** while the app is in the foreground and the session is offline.
    Stop the timer when online or signed out.
- When it reconnects, refresh the Today screen and flush the reading and inspection queues
  the way their screens already do on resume.

**Banner.** While `session.offline` is true, the staff shell shows a slim banner at the top
of every staff screen (`Key('offline-session-banner')`):

- text: "Offline. Saved readings and inspections upload when you're back online.";
- a **Retry** button that triggers a reconnect.

It disappears when online. The per-screen "Offline — showing data from …" banners stay as
they are.

### B. Saved copies of units and Today

Use the same rule as slice 3: the saved copy is used **only on a network error**, per owner,
written after each successful load (fire-and-forget), cleared with the rest of the cache.
Show the existing "Offline — showing data from …" banner (reuse the banner widget; move it
to a shared place if you need to) when a saved copy is shown.

- **Today:** `todayProvider` → cache key `today|<activePropertyId or all>`.
- **Unit page:** `unitProvider(id)` → `unit|<id>`. Only the main unit card is cached. The
  tabs (invoices, tenancy, meters) keep their own behaviour. If a tab fails offline, it
  shows its normal error state; nothing new.
- **Units list:**
  - each loaded page is cached under `units|<propertyId or all>|<occupancy or all>|<page>`
    when there is **no search text**;
  - offline, a page comes from the cache if present. A missing page ends the list (no error
    tile after the cached pages);
  - offline **with** search text, show "Search needs a connection." instead of results;
  - pull-to-refresh behaves as now.

Cached rows keep the server's JSON. Parse them with the existing `fromJson` functions.

### Not in this slice

- Caching tenants, tenancies, invoices, maintenance, or a unit's tabs.
- Starting offline in host, tenant, owner or platform mode.
- Editing units offline (readiness etc. still needs a connection, slice 5).
- Changing the cache's 31-day limit.
- Backend or web changes.

## Tests that must exist

**Session / API (`test/core/session_test.dart`, `test/core/api_client_test.dart` or a new
`test/core/offline_session_test.dart`):**

1. Online sign-in stores a snapshot without `accessToken` / `refreshToken`. Sign-out clears
   it; account deletion clears it; a 401 refresh at launch clears it.
2. Launch with a stored token and a 2-day-old staff snapshot, refresh → `DropConnection()` →
   the session has a value with `offline == true`, and the router does not go to `/offline`.
3. Same, but the snapshot is 31 days old → `/offline`, as today.
4. Same, but there is no snapshot → `/offline`.
5. Same, but the snapshot's mode is tenant (or host) → `/offline`.
6. Offline session, then the network is back: the first API call refreshes first (one
   `/auth/refresh` call before the request, the request carries the new
   `Authorization: Bearer …`), the session becomes `offline == false`, and the refresh token
   is still stored.
7. Offline session, still no network: an API call fails with a network error, sends **no**
   request without an access token, and clears nothing.
8. Offline session, refresh answers 401: the person is signed out, and the token, snapshot
   and cache are cleared.
9. While offline, the push device is not registered; after reconnecting, it is.

**Screens (widget tests):**

10. Offline session → the staff home shows `Key('offline-session-banner')`. Retry with the
    network back → the banner goes away.
11. Today: loaded once online, then `DropConnection()` → shows the saved list and the
    "Offline — showing data from …" banner. A 500 error does **not** use the saved copy.
12. Unit page: same pattern (saved copy on a network error only), and the banner shows.
13. Units list:
    - pages 1–2 cached, then offline → both pages show and the list ends without an error
      tile;
    - offline with search text → "Search needs a connection.";
    - another owner's cached pages are not shown (`u2|o1`).
14. Start offline → the meter list (slice 3 cache) opens with its saved data, and a reading
    saved there goes to the offline queue with `owner == 'u1|o1'`.

## Checks before handing back

```bash
cd mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test
```

Report any check you could not run and why.

## Progress

### Built
- **Token-free secure session snapshot (`mobile/lib/core/auth/token_store.dart`, `session.dart`):**
  - Added `SessionSnapshot = ({Map<String, dynamic> data, DateTime savedAt})` and `readSessionSnapshot` / `writeSessionSnapshot` / `clearSessionSnapshot` on `TokenStore`, `SecureTokenStore` (under `'hodi.sessionSnapshot'` in `FlutterSecureStorage`), and `MemoryTokenStore`, stripping `'accessToken'`, `'refreshToken'`, and `'accessTokenExpiresAt'`.
  - Added `Session.offline` (`bool`, default `false`), leaving `accessToken` empty when `offline: true`.
- **Offline staff launch & seamless reconnect (`mobile/lib/core/api/api_client.dart`, `mobile/lib/core/auth/session_controller.dart`, `mobile/lib/core/widgets/account_sheet.dart`):**
  - On launch (`SessionController.build()`), only a `401` or `403` from `/auth/refresh` clears the refresh token, session snapshot, and `OfflineCache` and signs the person out. Any network error, timeout, `429`, or `5xx` preserves local auth and, when a `< 30`-day snapshot exists whose `effectiveMode(snapshot, null)` is `AppMode.staff`, opens an offline session (`offline: true`, `api.offlineSession = true`). Non-staff modes (host, tenant, owner, platform) or missing/expired snapshots rethrow to `/offline` with the token preserved.
  - While `api.offlineSession` is `true`, `ApiClient._send` runs single-flight `refreshOnce()` before sending any authenticated request so no tokenless request ever hits the server (preventing spurious `401` sign-outs). If refresh succeeds, `offlineSession` clears, `accessToken` is set, and the request proceeds with `Authorization: Bearer <new>`. If refresh fails transiently (network, `5xx`, `429`), `_send` fails with `ApiError.network()` so screens fall back to cached data and nothing is cleared. Only `401`/`403` signs out and clears token + snapshot + `OfflineCache`.
  - Push device registration (`POST /notifications/devices`) is skipped while offline and runs automatically once `_accept()` promotes the session online.
  - Added foreground reconnect on app resume (`AppLifecycleListener`) and every 60 seconds (`offlineReconnectIntervalProvider`), pausing when backgrounded, stopping once online or signed out, and cleaning up both timer and lifecycle listener in `ref.onDispose`.
  - Guarded sign-in-only actions (`switchOrganization`, `setPlace`, `acceptInvitation`, `switchContext`, `updateProfile`, `changePassword`, `requestStepUp`, `verifyStepUp`, `deleteAccount`, and `AccountSheet` actions) while `session.offline` is `true` with `"You're offline. Try again when you have signal."` and zero server calls.
- **Staff offline session banner & reconnect sync (`mobile/lib/features/staff/staff_widgets.dart`, `sms_banner.dart`, `billing_banner.dart`):**
  - Added `OfflineSessionBanner` (`Key('offline-session-banner')`) at the top of `StaffTabScaffold` with `"Offline. Saved readings and inspections upload when you're back online."` and a **Retry** button calling `reconnect()`.
  - When `session.offline` transitions from `true` to `false` (via Retry, first API call, app resume, or 60s timer), invalidates `todayProvider`, `dashboardProvider`, `propertiesProvider`, bumps `listsVersionProvider`, and flushes `flushPendingReadings` + `flushPendingInspections`.
  - Extracted shared `OfflineCacheBanner` (`"Offline — showing data from …"`) into `staff_widgets.dart` and reused it across meters, Today, unit detail, and units list.
- **Shared offline cache helpers & cached Today / Unit detail / Units list (`mobile/lib/core/offline/cached_data.dart`, `staff_api.dart`, `home_screen.dart`, `units_screens.dart`, `meters_data.dart`, `reading_queue.dart`):**
  - Placed shared `Cached<T>`, `oldestSavedAt`, `cacheOwnerOf`, `cacheOwnerProvider`, `fetchRowsOrCached`, and `fetchObjectOrCached` in `lib/core/offline/cached_data.dart`.
  - Cached `todayProvider` under `today|<activePropertyId or all>` and `unitProvider(id)` under `unit|<id>` (main unit card only; unit tabs keep their existing behaviour), falling back only on `e.isNetworkError`.
  - Cached `UnitsScreen` pages (when `q` is empty) under `units|<propertyId or all>|<occupancy or all>|<page>`; offline, cached pages render seamlessly and a missing next page ends the list cleanly with no error tile, while non-empty search text offline shows `"Search needs a connection."`.
- **Unit & widget tests (`mobile/test/core/offline_session_test.dart`, `mobile/test/staff/offline_units_today_test.dart`):**
  - Covered all 14 required scenarios in the brief plus the two transient-server refresh cases (launch `/auth/refresh` → `503` enters offline mode keeping token; reconnect `/auth/refresh` → `500` stays offline and clears nothing).

### Not built (out of scope per brief)
- Offline caching for tenants, tenancies, invoices, maintenance, or unit detail tabs.
- Offline launch for host, tenant, owner, or platform modes.
- Offline unit edits (e.g. readiness updates).
- Backend or web changes.

### Done differently (per owner instructions before implementation)
- **Transient server failures on `/auth/refresh`:** Only `401` or `403` from `/auth/refresh` clears local auth (`TokenStore` refresh token, session snapshot, and `OfflineCache`) and signs the person out — both at launch and during reconnect. `5xx`, `429`, and timeouts are treated like no signal so a server hiccup never signs a caretaker out or wipes queued/cached work.
- **Shared cache helper module:** Placed `Cached<T>` and the shared cache helpers in `mobile/lib/core/offline/cached_data.dart` instead of keeping them inside `meters_data.dart`, and registered `ref.onDispose` cleanup for both the reconnect timer and `AppLifecycleListener`.

### Ideas / observations
- `UnitDetailScreen`'s Meters tab (`_UnitMetersTab`) currently watches `metersProvider(propertyId)` rather than the cached `meterListProvider(propertyId)` from slice 3; reusing `meterListProvider` in a future slice would let the unit's Meters tab render offline from the existing property meter cache too.

### Checks run
- `cd mobile && dart format --output=none --set-exit-if-changed lib test` — **Passed** (`Formatted 195 files (0 changed)`).
- `cd mobile && flutter analyze --fatal-infos` — **Passed** (`No issues found!`).
- `cd mobile && flutter test` — **Passed** (`314` tests passed, `0` failed).

## Fixed after review (Claude)

- **Sign-out from offline mode left the phone getting the person's pushes.** Device tokens
  belong to the person, not the session, and an offline start never registers the device, so
  the old sign-out (which skipped both server calls when offline) left it registered.
  `signOut()` now tries one reconnect first when the session is offline. Online, the normal path
  unregisters the device and calls `/auth/logout`; with no signal it signs out on the phone only.
  The reconnect is not cut short by a timer, because a refresh landing after the local sign-out
  would sign the person back in. New test in `test/core/offline_session_test.dart`.
- Not changed: the "Offline" banner shows on the five staff tabs, not on screens opened from them
  (those keep their own "Offline — showing data from …" banner).
