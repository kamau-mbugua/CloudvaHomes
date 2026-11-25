# Phase 19, slice 3 — Meter list and reading sheet available offline

One slice only. Parent brief: `docs/plans/2026-11-25-phase-19-caretaker-app.md` (Slice 3; the
inspection queue part is already done). Spec: `docs/specs/2026-11-24-roadmap-features-design.md`
§6. Claude reviews the result against this file.

## Rules for this run

1. **Never `git commit` or `git push`.** Leave changes in the working tree.
2. **Build only what is listed under "What to build".** No other features, screens or
   refactors. Ideas go in the Progress note at the bottom.
3. **Before writing code**, reply with the list of files you will change or add. Stop if it
   doesn't match this brief.
4. Every test under "Tests that must exist" is required, including the failure cases.
5. Finish by filling in the **Progress** section at the bottom of this file (built, not built,
   anything done differently and why, each check run and its result).
6. Don't touch `hodi_app/`. Customer-facing text says KodiHQ. **App only: no backend or web
   changes in this slice.**

## Why

A caretaker opens the app at the gate (signal), walks into a basement or up to a rooftop tank
(no signal), and the meters screen shows an error, so they can't pick the next meter. Saving
already works offline (`ReadingQueue`); **loading** doesn't. We keep the last good copy of
the property list, the meter list and the reading sheet on the phone and show it, clearly
marked, when there is no connection.

Not covered (out of scope): starting the app with no signal. Session restore needs the
network (`SessionController.build` → `/offline` screen). This slice helps when the signal
drops while the app is already signed in.

## What exists (read these first)

- Meters screen: `mobile/lib/features/staff/more/meters_screen.dart`.
  - `MetersScreen` watches `propertiesProvider`.
  - `_MeterList` watches `metersProvider(propertyId)`.
  - `ReadingScreen` watches `sheetProvider(_sheetKey)`, keyed by property, charge type and
    Nairobi period.
  - `flushPendingReadings` and `ReadingScreen._save` invalidate these providers.
- Providers and API in `mobile/lib/features/staff/staff_api.dart`:
  - `propertiesProvider` merges the session's properties with `StaffApi.properties()`.
  - `metersProvider` and `sheetProvider` wrap `StaffApi.meters` and `StaffApi.readingSheet`.
  - `metersProvider` is also used by `parity_screens.dart` and `units_screens.dart`. **Leave
    those screens and `propertiesProvider` as they are.**
- Offline file pattern to copy: `mobile/lib/features/staff/more/reading_queue.dart`. It keeps
  JSON in the app support dir `offline/`, writes atomically (`.tmp` then rename), and is
  provided through `readingQueueProvider`.
- Network errors: `ApiError.isNetworkError` (`mobile/lib/core/api/api_error.dart`).
- Session: `sessionProvider`; `Session.user.id`, `Session.activeOrganization?.id`;
  `signOut()` and account deletion in `mobile/lib/core/auth/session_controller.dart`.
- Date helpers: `mobile/lib/core/dates.dart` (`formatTimestamp`).
- Tests to model on: `mobile/test/staff/offline_reading_test.dart`,
  `mobile/test/staff/reading_checks_test.dart`, `mobile/test/staff/reading_queue_test.dart`,
  `mobile/test/staff/helpers.dart` (`FakeAdapter`, `DropConnection()`, `Reply(status, body)`,
  `overridesFor`, `phoneSize`).

## What to build

### 1. `OfflineCache` — `mobile/lib/core/offline/offline_cache.dart` (new)

It lives in `core/` because sign-out must clear it. It's a small keyed store of raw API rows:

- File `<app support>/offline/offline_cache.json`:
  `{ "owner": "<userId>|<orgId>", "entries": { "<key>": { "savedAt": "<ISO>", "rows": [ … ] } } }`.
- `Future<CachedRows?> read(String owner, String key)` returns `(rows, savedAt)`, or `null`
  when:
  - there's no file or no entry;
  - the file's `owner` differs from the caller's;
  - the file is unreadable or corrupt. **Never throw**: a bad file is the same as no file.
- `Future<void> write(String owner, String key, List<Map<String, dynamic>> rows, {DateTime? now})`:
  - Writes atomically, like `ReadingQueue._write`.
  - If the stored owner differs, it drops every old entry first.
  - It drops entries older than 31 days.
- `Future<void> clear()` deletes the file.
- Provide it with `offlineCacheProvider` (a `FutureProvider`, like `readingQueueProvider`) so
  tests can override it with a temp directory.
- **Clear it on sign-out and on account deletion** in `session_controller.dart`. A failure to
  clear must not stop the sign-out (catch and ignore).

### 2. Raw rows from `StaffApi`

Add three methods that return the API's raw row maps:

- `propertyRows()`
- `meterRows(propertyId)`
- `sheetRows(propertyId:, chargeTypeId:, period:)`

Make the existing `properties()`, `meters()` and `readingSheet()` call them and map the rows
as they do now, with the same queries and behaviour. Move the session-merge logic out of
`propertiesProvider` into a function `mergeSessionProperties(sessionProps, fetched)`.
`propertiesProvider` keeps returning the same list.

### 3. Cached providers for the meters screens

These go in `meters_screen.dart`, or in a new `meters_data.dart` next to it.

- `class Cached<T> { final T value; final DateTime? savedAt; }`: `savedAt == null` means live
  data.
- Three providers:
  - `meterPropertiesProvider` → `Cached<List<PropertyOption>>`, merged with the session like
    `propertiesProvider`;
  - `meterListProvider(propertyId)` → `Cached<List<Meter>>`;
  - `readingSheetProvider(key)` → `Cached<List<SheetRow>>`, with the same key record as
    `sheetProvider`.
- Each one works like this:
  1. Fetch the raw rows live. On success, write them to the cache under `properties`,
     `meters|<propertyId>` or `sheet|<propertyId>|<chargeTypeId>|<period>`, then return
     `Cached(parsed, null)`. **A cache write failure must not fail the load.**
  2. On an `ApiError` with `isNetworkError`, read the cache. On a hit, return
     `Cached(parsed, savedAt)`; otherwise rethrow the original error.
  3. **Any other error** (401, 403, 404, 500) is rethrown and **never** answered from the
     cache.
  4. The owner key is the one the offline queues already use: `currentQueueOwner(ref)` /
     `queueOwnerOf(session)` in `reading_queue.dart` (`"<userId>|<orgId>"`). Don't write a
     second version of it. With no session, don't read or write the cache.
- Switch `MetersScreen`, `_MeterList` and `ReadingScreen` to these providers. Update every
  invalidation in `meters_screen.dart` to match (`_save`, `flushPendingReadings`, the retry
  and refresh handlers).
- `sheetProvider` is then unused, so remove it. Keep `metersProvider` for the other screens.

### 4. What the caretaker sees

- If any data on screen came from the cache, show a banner above the content (`Key('meter-offline-banner')`):
  **"Offline — showing data from <time>"**. `<time>` is the oldest `savedAt` in view,
  formatted with the existing `formatTimestamp` in `core/dates.dart` (no new date helper).
  Show it on the meters list and on the reading screen.
- Pull to refresh tries the network again. When it succeeds the banner goes away.
- On the reading screen with a cached sheet:
  - the existing checks work on the cached row (below-previous, unusual use);
  - saving takes the existing path: the PUT fails with a network error, so the reading goes
    to `ReadingQueue`.
- No connection and nothing cached: the existing error state with Retry, exactly as today.

## Tests that must exist

Unit (`mobile/test/core/offline_cache_test.dart`):
- write then read returns the same rows and `savedAt`;
- reading with a different owner returns `null`; writing with a different owner removes the
  previous owner's entries;
- a corrupt file (e.g. `"{not json"`) reads as `null` and a later write succeeds;
- an entry older than 31 days is dropped on the next write;
- `clear()` removes everything.

Widget (`mobile/test/staff/offline_meters_test.dart`):
- **cached list while offline:**
  - load the meters screen online (properties, meters), then switch the adapter to
    `DropConnection()` and open the screen again;
  - the same meters show, along with the offline banner;
- **nothing cached + offline** shows the existing error state with Retry and no banner;
- **a 500 (or 403) with cache present** shows the error, not the cached data;
- **reading screen offline with a cached sheet:**
  - an unusual reading still shows "Check this reading" (it uses the cached `averageUse`);
  - Save anyway puts it in `ReadingQueue`;
- **a cache saved by another user or org is not shown** (offline → error state);
- **refresh online after offline:** the banner disappears.

Sign-out: a test that `signOut()` clears the cache, including when the logout call itself
fails with a network error.

## Out of scope

- Starting the app with no signal (offline session restore).
- Offline caching for any other screen (tenants, units, maintenance, inspections list).
- Showing pending (queued) readings inside the cached sheet. The existing
  `PendingReadingsBanner` stays as is.
- Any backend, web, or OCR change.

## Checks before handing back

```bash
cd mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test
```

## Progress

- **Files added or changed:**
  - `mobile/lib/core/offline/offline_cache.dart` *(new)*
  - `mobile/lib/core/auth/session_controller.dart`
  - `mobile/lib/features/staff/staff_api.dart`
  - `mobile/lib/features/staff/more/meters_data.dart` *(new)*
  - `mobile/lib/features/staff/more/meters_screen.dart`
  - `mobile/test/core/offline_cache_test.dart` *(new)*
  - `mobile/test/staff/offline_meters_test.dart` *(new)*
- **Built:**
  - Added `OfflineCache` and `offlineCacheProvider` (`<app support>/offline/offline_cache.json`) with owner-keyed entries, atomic `.tmp` rename writes, 31-day expiry pruning on write, owner replacement on owner change, silent `null` return on missing/mismatched/corrupt files, and `clear()`.
  - Cleared `OfflineCache` on both `signOut()` (even when `POST /auth/logout` fails with a network error) and `deleteAccount()` in `SessionController`, swallowing any disk error so sign-out is never blocked.
  - Added `propertyRows()`, `meterRows(propertyId)`, and `sheetRows(...)` on `StaffApi`, refactored `properties()`, `meters()`, and `readingSheet()` to use them, extracted `mergeSessionProperties(sessionProps, fetched)` for `propertiesProvider`, and removed the unused `sheetProvider` while keeping `metersProvider` and `propertiesProvider` intact for other screens.
  - Added `Cached<T>`, `oldestSavedAt`, and `autoDispose` providers `meterPropertiesProvider`, `meterListProvider(propertyId)`, and `readingSheetProvider(key)` in `meters_data.dart`: writes raw rows to `OfflineCache` on live success (ignoring write failures), falls back to `OfflineCache` only on `ApiError` with `isNetworkError`, rethrows all non-network errors (401/403/404/500), and resolves the owner via `ref.watch(queueOwnerProvider)` (falling back once to `await ref.read(sessionProvider.future)` + `queueOwnerOf` only when `null` while `sessionProvider.isLoading`, without watching `sessionProvider` so token refreshes do not refetch lists).
  - Updated `MetersScreen`, `_MeterList`, `ReadingScreen`, and `flushPendingReadings` to use and invalidate the cached providers, added pull-to-refresh on both the meter list and reading screen, and displayed `Key('meter-offline-banner')` (`"Offline — showing data from <time>"` via `formatTimestamp` on the oldest `savedAt` in view) whenever cached data is shown.
  - Added unit tests (`offline_cache_test.dart`, including sign-out offline/throwing and account deletion) and widget tests (`offline_meters_test.dart`, including cached list + banner offline, online pull-to-refresh clearing banner, uncached offline error + Try again, 500/403 ignoring cache, standalone `ReadingScreen` pushed/mounted on its own offline with unusual-use warning + queue save, and cross-user/org cache isolation).
- **Not built / done differently (and why):**
  - None. Note: `ErrorState` in `core/widgets/common.dart` labels its retry button `'Try again'`, which is what the uncached-offline widget tests assert; also noted a minor pre-existing layout tightness in `CurvedHeroCard`'s header row at 360dp logical width under the test `Ahem` fallback font when 2+ meters are pending (`UP NEXT · 2 REMAINING THIS MONTH` + `Water` chip).
- **Checks run and results:**
  - `cd mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test` — **passed** (188 files formatted with 0 changes, 0 analyzer issues, 275/275 tests passed).
