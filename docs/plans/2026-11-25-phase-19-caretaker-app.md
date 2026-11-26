# Phase 19 — Caretaker mobile app: implementation brief

Spec: `docs/specs/2026-11-24-roadmap-features-design.md` §6 (Phase 19). This brief is for the
implementer (Gemini CLI); Claude reviews the result against it. Read `GEMINI.md` first.

## Ground rules

- **Never `git commit` or `git push`.** Leave all changes in the working tree.
- Stay inside this repo. Don't touch `hodi_app/` (legacy).
- Customer-facing text says **KodiHQ**. Plain, short English in the UI.
- Backend: org-scoped rows (`orgId`), a permission on every route, `AuditLog` for writes that
  touch people or access, `AppError` for errors, `ok()` / `paginated()` for responses. Respect
  staff property limits with `allowedPropertyIds()` / `propertyScope()`
  (`backend/src/modules/portfolio/property-scope.ts`).
- Migrations are hand-written SQL folders in `backend/prisma/migrations/` (name them
  `20261125xxxxxx_<what>`), plus the matching `schema.prisma` change.
- Mobile: Riverpod + GoRouter, reuse `lib/core/widgets/common.dart` (`showMessage`,
  `EmptyState`, `StatusChip`), `can(ref, '<permission>')` for gating, `pickPhoto` from
  `lib/features/staff/more/photo.dart`.
- Each slice ends with its tests passing. Don't start the next slice with a failing one.
- When done, add a "Progress" note at the bottom of this file: per slice, the files changed and
  anything left out or done differently, with the reason.

## What already exists (don't rebuild)

- Caretaker role: `backend/src/modules/roles/permissions.ts` (landlord org: properties, units
  view/update, tenants, tenancies, meters, maintenance; no `reports:view`).
- Meter readings with photo: `mobile/lib/features/staff/more/meters_screen.dart`; server
  `backend/src/modules/billing/meters/` (`GET /meter-readings/sheet`, `POST /meter-readings`,
  one reading per meter and month, refuses a reading below the previous one).
- Offline reading queue: `mobile/lib/features/staff/more/reading_queue.dart` (JSON file + photos,
  flushed on screen open and app resume).
- Inspections: `mobile/lib/features/staff/tenants/inspection_screen.dart`,
  `mobile/lib/features/staff/inspections.dart`.
- Push: `mobile/lib/core/notifications/push_service.dart` (`mobileRouteForActionUrl`),
  backend `NotificationsService.notifyUser` / `notifyOrgStaff`.
- Dashboard item maths: `backend/src/modules/reports/report-math.ts`.

## Slice 1 — Caretaker "Today" screen

Today a caretaker's home says "Figures aren't available for your role"
(`mobile/lib/features/staff/home/home_screen.dart`).

Backend:
- `GET /staff/today` (new controller in `backend/src/modules/reports/` or a small `today`
  module). Allowed for any staff member who has at least one of `meters:view`,
  `tenancies:view`, `maintenance:view`; each section is included only if they have that
  permission. Limited to their allowed properties.
- Response: `{ readingsDue: { period, due, done, byProperty: [{ propertyId, name, due, done }] },
  moveOuts: [{ tenancyId, tenantName, unitLabel, propertyName, moveOutOn }] (next 7 days, NOTICE
  tenancies), maintenance: { open, late, items: [{ id, title, priority, unitLabel, late }] (top 10,
  late first) } }`. "Late" uses `backend/src/modules/maintenance/sla.ts`.
- Pure counting helpers in a `*.ts` file with a unit `*.spec.ts`; one e2e test in
  `backend/test/` covering a caretaker limited to one property (sees only that property) and a
  role without `maintenance:view` (no maintenance section).

Mobile:
- When the person lacks `reports:view`, the home shows the Today list instead of the empty
  state: "Readings: 12 of 30 done this month" (taps to Meters for that property), move-outs this
  week (taps to the tenancy/unit), maintenance with a Late chip (taps to the request). Pull to
  refresh. Empty state "Nothing to do today" when all are zero.
- Widget test with the existing fake API helpers (`mobile/test/staff/helpers.dart`).

## Slice 2 — Reading checks and OCR fields

Backend:
- `MeterReading`: add `ocrUsed Boolean @default(false)`, `ocrEdited Boolean @default(false)`.
  Accept both on `POST /meter-readings` (optional, default false).
- The sheet row (`GET /meter-readings/sheet`) gains `averageUse` (string, the mean use of the
  meter's last up-to-6 readings, null if fewer than 2).

Mobile:
- On save, if `current - previous > 3 × averageUse`, ask "This is more than 3 times the usual
  use (about X). Save it anyway?" before saving. Same check for offline saves.
- Keep the server's below-previous refusal as is.
- Queue entries carry `ocrUsed` / `ocrEdited` (add to `PendingReading`, old JSON without them
  must still load).

## Slice 3 — Offline cache and inspection queue

- Cache the last successful meter list and reading sheet per property (JSON file in the app
  support directory, like `ReadingQueue`). When offline, the meters screen shows the cached
  sheet with a banner "Offline — showing data from <time>" and saving goes to the queue.
- Inspection queue: an inspection saved offline is stored with its photos and a
  client-generated id (UUID). The server's inspection create accepts an optional `clientId`
  (new unique column, per org) and returns the existing inspection when it has seen that id
  (so a retry never duplicates). Photos upload first on flush, then the inspection.
- Tests: queue round-trip (including an old file format), flush stopping on network error,
  server idempotency e2e (same `clientId` twice → one inspection).

## Slice 4 — Meter OCR

- Add `google_mlkit_text_recognition` (latest stable; on-device, Latin script). Android and iOS
  only; the app must still build and run tests without it doing anything on other platforms.
- On the reading screen, after a photo is taken, run recognition and suggest the most likely
  reading: the longest run of digits (allowing one decimal point), preferring one that is ≥ the
  previous reading. Show "Suggested from photo: 01234.5 — Use / Ignore". Using it sets
  `ocrUsed = true`; changing the number afterwards sets `ocrEdited = true`.
- Put the digit-picking logic in a pure function with unit tests (several sample OCR strings).
- The photo and recognised text never leave the phone. ML Kit itself does send Google
  diagnostics (device model and OS, app package and version), per Google's ML Kit Android
  data disclosure, so the Play Data safety form must be reviewed before release (owner's
  call, with Compliance). Detailed brief: `2026-11-25-phase-19-slice-4-meter-ocr.md`.

## Slice 5 — Unit readiness and task pushes

- `Unit.readiness` enum `READY | NEEDS_CLEANING | UNDER_REPAIR` (nullable, default null = not
  set), editable with `units:update` (audited), shown and editable on the mobile unit screen and
  shown on the web units list as a chip.
- Pushes (via `NotificationsService.notifyUser`, to staff with the permission and access to
  the property):
  - 1st of the month 08:00 Nairobi: "Meter readings for <month> are due" (to `meters:create`).
  - On a tenancy's move-out day 08:00: "Take the final meter reading for <unit>" (to
    `meters:create`).
  - When a maintenance request becomes late (once per request): "<title> is late"
    (to `maintenance:update`).
  Use the existing jobs module (`backend/src/modules/jobs/`) for the schedule. Each `actionUrl`
  must map to a mobile route in `mobileRouteForActionUrl` (add cases + tests in
  `mobile/test/core/push_routes_test.dart`).

## Out of scope

- Tenant signing the inspection on the device (waits for phase 17).
- Sharing vacancy photos (phase 15), viewings, gate approvals (phase 27).
- SQLite/drift: JSON files are enough for this phase.

## Checks before handing back

```bash
cd backend  && npx prettier --check "src/**/*.ts" "test/**/*.ts" && npx tsc --noEmit && npm run lint && npm run test && npm run test:e2e
cd frontend && npx tsc -b && npm run lint && npm run test
cd mobile   && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test
```

Report any check you could not run and why.

## Progress (2026-11-25, after review)

| Slice | State |
|---|---|
| 1. Today screen | **Done**, at `GET /reports/today` (not `/staff/today`). It lists each unread meter rather than "N of M done" per property; move-in inspections were added. |
| 2. Reading checks and OCR fields | **Done** (Antigravity, brief `2026-11-25-phase-19-slice-2-reading-checks.md`). The sheet returns `averageUse`; app and web ask "Check this reading" above 3×; migration `20261126090000_reading_ocr_fields`. The web confirmation got a Cancel button and a non-red Save after review. |
| 3. Offline | **Inspection queue done** (`mobile/lib/features/staff/more/inspection_queue.dart`). Instead of `clientId`, a save carries `baseVersion` (the inspection's `updatedAt`, or `"none"`); the server refuses a stale one with 409 `INSPECTION_CHANGED`. Photos are recorded one by one, so a dropped connection loses none. **Meter screens cache done** (Antigravity, brief `2026-11-25-phase-19-slice-3-offline-meters.md`): properties, meters and the month's sheet, used only when the network is unreachable, per user and organisation, cleared on sign-out. Units are not cached; starting the app with no signal still needs a connection. |
| 4. OCR | **Done** (Antigravity, brief `2026-11-25-phase-19-slice-4-meter-ocr.md`). On-device ML Kit (Latin), `google_mlkit_text_recognition` 0.16.0 (newer needs Flutter 3.44). The photo suggests the number; the caretaker taps Use or Ignore. iOS minimum raised to 15.5; Android release bundle +14.1 MB. Play Data safety review still needed before release. |
| 5. Unit readiness and pushes | **Done** (Antigravity, brief `2026-11-25-phase-19-slice-5-readiness-pushes.md`). `Unit.readiness` (Ready / Needs cleaning / Under repair), set on the app's unit screen, shown on the web units list. Pushes: readings due (1st, 08:00), final meter reading on move-out day, repair late (within 24 h of its target), to staff with the permission and the property; sent once (`task_pushes`); suspended and closed organisations skipped. Migration `20261127090000_unit_readiness`; jobs `caretaker-daily`, `maintenance-late` (cron image needs a rebuild). |
| 6. Offline start, units and Today | **Done** (Antigravity, brief `2026-11-25-phase-19-slice-6-offline-start-units.md`). With no signal at launch, staff open the app from a saved session (secure storage, no tokens, under 30 days) with an "Offline" banner and Retry. Back online without signing out: the app refreshes before any request, and reconnects on resume and every 60 s. Only a 401/403 from `/auth/refresh` signs out; 5xx, 429 and timeouts count as no signal. Today, a unit's page and the units list (pages, no search) have saved copies. Sign-out from offline mode reconnects first so the phone stops getting that person's pushes (fixed after review). The saved Today and unit data include tenants' names and phone numbers, unencrypted in app storage: Compliance review. |
| Extra (phase 18) | Vendor job link `/r/<token>`: the vendor sees the job, adds photos and reports it done. Stored as a SHA-256 plus an encrypted copy; a new vendor gets a new link; ends 7 days after the job closes; rate-limited; the report is audited. Migrations `20261125100000_vendor_repair_link`, `20261125110000_vendor_link_hashed`. |

Fixed after review: vendor photos attach on upload; completion dates in Nairobi time (web and
app); the app lists vendors with the job's trade first and shows the completion photos; a
route test that checked nothing was removed; `GEMINI.md` has working rules.

Fixed during slices 2–3: offline queues (readings and inspections) record who saved each
item and only that person uploads it, so a second user on the same phone never sends them.

Still open: the job SMS now carries a link (likely 2 SMS units); the Today screen shows raw
priorities (`URGENT`) and every unread meter one by one; inline styles on the vendor pages.
