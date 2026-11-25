# Phase 19, slice 5 — Unit readiness and task pushes

One slice only. Parent brief: `docs/plans/2026-11-25-phase-19-caretaker-app.md` (Slice 5).
Spec: `docs/specs/2026-11-24-roadmap-features-design.md` §6 ("Unit status", "Push").
Claude reviews the result against this file.

## Rules for this run

1. **Never `git commit` or `git push`.** Leave changes in the working tree.
2. **Build only what is listed under "What to build".** No other features, screens or
   refactors. Ideas go in the Progress note at the bottom.
3. **Before writing code**, reply with:
   - the files you will add or change;
   - the migration name and its SQL;
   - how you pick who gets each push (the query), and how a job run twice sends nothing new.

   Stop if it doesn't match this brief.
4. Every test under "Tests that must exist" is required, including the failure cases.
5. Finish by filling in the **Progress** section at the bottom of this file (built, not built,
   anything done differently and why, each check run and its result).
6. Don't touch `hodi_app/`. Customer-facing text says KodiHQ. Plain, short English.
7. Don't deploy, don't run migrations against anything but the local/e2e database, and don't
   change the live crontab or Cloud Scheduler. Editing the files in `infra/` is fine.

## Why

Two gaps in the caretaker's day:

- Nobody can tell from the system whether an empty unit can be shown to a new tenant. The
  caretaker knows ("still being painted", "needs a clean"), so let them say it on the phone
  and let the office see it on the web.
- Tasks only appear when someone opens the app. A push at the right moment (readings due,
  a tenant moving out today, a repair now late) gets them done on time.

## What already exists (use it, don't rebuild)

- `Unit` model: `backend/prisma/schema.prisma` (`model Unit`). Units API:
  `backend/src/modules/portfolio/units/` (`PATCH /units/:id` with `units:update`; `update()`
  already records an audit entry with before/after snapshots). Property limits:
  `unitScope()` in `backend/src/modules/portfolio/property-scope.ts`.
- Staff property limits: `Membership.propertyIds` (empty = all properties). The Owner role
  (`Role.systemKey = 'OWNER'`) has every permission; other roles list theirs in
  `Role.permissions`. See `backend/src/modules/auth/auth.guard.ts` (~line 96–107).
- Notifications: `NotificationsService.notifyUser({ userId, orgId, kind, title, body,
  actionUrl })` in `backend/src/modules/notifications/notifications.service.ts` stores a
  `UserNotification` and sends the FCM push. It never throws.
- Scheduled jobs: `POST /internal/jobs/<name>` behind `JobsGuard`, `@Public()`, e.g.
  `backend/src/modules/stays/jobs/stays-jobs.controller.ts` (takes an optional date in the
  body for tests). Called by `infra/vm/cron/crontab` (Nairobi time) and listed in
  `infra/gcp/README.md`. E2E pattern: `backend/test/stays-jobs.e2e-spec.ts`
  (`JOBS_SHARED_SECRET`). Cross-org reads in a job use `withoutOrgScope`.
- Nairobi date: `nairobiToday()` in `backend/src/modules/stays/bookings/booking-view.ts`.
- Late repairs: `SLA_HOURS`, `isOverdue`, `overdueWhere` in
  `backend/src/modules/maintenance/sla.ts`.
- Move-outs: `Tenancy.status = 'NOTICE'`, `Tenancy.endDate` = expected move-out day.
- Meters: `Meter.status = 'ACTIVE'`, `Meter.unitId`.
- Web: the units list table is `frontend/src/features/portfolio/UnitsTable.tsx` (status cell:
  `<Badge table={RECORD_STATUS} … />`, tables in `features/portfolio/labels.ts`); web tests are
  pure `*.test.ts` (no component tests), e.g. `portfolio.test.ts`. The web reads
  `/app/meter-readings?propertyId=…`, `/app/units/<id>`, `/app/maintenance?late=true`.
- Mobile: unit screen `mobile/lib/features/staff/units/units_screens.dart`
  (`UnitDetailScreen`), `Unit` in `mobile/lib/features/staff/staff_models.dart`,
  `StatusChip` / `Tone` / `showMessage` in `lib/core/widgets/common.dart`, `can(ref, '…')`.
  Push routing: `mobileRouteForActionUrl` in `mobile/lib/core/notifications/push_service.dart`,
  tests in `mobile/test/core/push_routes_test.dart`. Routes: `/staff/units/:unitId`,
  `/staff/more/meters?propertyId=…`, `/staff/more/maintenance`.

## What to build

### A. Unit readiness

**Database.** Migration `20261127090000_unit_readiness` (hand-written SQL + `schema.prisma`):

- enum `UnitReadiness` = `READY | NEEDS_CLEANING | UNDER_REPAIR`;
- `Unit.readiness UnitReadiness?` (null = not set; no default, no backfill).

**API.** `PATCH /units/:id` accepts `readiness`: one of the three values, or `null` to clear.
Anything else → 400. It goes through the existing `update()`, so it's audited and limited to
the caller's properties (a unit outside them → 404, as today). `GET /units` and
`GET /units/:id` return `readiness`. No automatic changes (for example, a new tenancy doesn't
clear it); put ideas in the Progress note.

**Web.** In `UnitsTable.tsx`'s status cell, a second `Badge` when `readiness` is set, from a
new `UNIT_READINESS` table in `labels.ts`: **Ready** (good), **Needs cleaning** (warn),
**Under repair** (warn). Not set → no badge. Add `readiness` to the web `Unit` type. No web
editing in this slice.

**Mobile.** On `UnitDetailScreen`:

- show the same chip when set;
- with `units:update`, a **Readiness** row opens a bottom sheet with **Ready**, **Needs
  cleaning**, **Under repair**, **Not set**. Choosing one sends `PATCH /units/:id
  { readiness }`, refreshes the unit and shows "Unit marked as <label>." (for **Not set**:
  "Readiness cleared.");
- without `units:update`, the chip only (no row);
- on failure, show the server's message, or "No connection. Try again when you're online."
  for a network error, and leave the old value. No offline queue for this.

### B. Task pushes

All three are sent with `notifyUser`, one per person, to each **active** member of the
organisation who:

- has the named permission (Owner role counts), and
- can see the property (`propertyIds` empty or containing it).

Put that rule in one pure function (e.g. `canReceive(membership, permission, propertyId)`)
with a unit test, and use it for all three.

**Sent only once, even if a job runs twice or retries.** Add a table in the same migration:

```
model TaskPush {
  id        String   @id @default(uuid(7)) @db.Uuid
  orgId     String   @db.Uuid
  kind      String   // METER_READINGS_DUE | FINAL_METER_READING | MAINTENANCE_LATE
  refKey    String   // period "2026-12", tenancyId, or maintenance request id
  createdAt DateTime @default(now())
  @@unique([orgId, kind, refKey])
  @@map("task_pushes")
}
```

Claim the row first (insert; a unique clash means it was already sent → skip), then send.

| Kind | When | To (permission) | Title / body | `actionUrl` |
|---|---|---|---|---|
| `METER_READINGS_DUE` | Job `caretaker-daily`, only when the Nairobi date is the 1st | `meters:create`, for properties with at least one ACTIVE meter. **One push per person per org**, even with many properties. | "Meter readings due" / "Meter readings for December 2026 are due." | `/app/meter-readings` |
| `FINAL_METER_READING` | Job `caretaker-daily`, for each NOTICE tenancy whose `endDate` is today (Nairobi) **and** whose unit has an ACTIVE meter | `meters:create`, with access to that property | "Final meter reading" / "Take the final meter reading for <property> Unit <number>. The tenant moves out today." | `/app/units/<unitId>` |
| `MAINTENANCE_LATE` | Job `maintenance-late`, every 15 minutes | `maintenance:update`, with access to that property | "Repair is late" / "<title> — <property> Unit <number> is past its <N>-hour target." | `/app/maintenance?late=true` |

Rules for `MAINTENANCE_LATE`:

- Use `sla.ts`. Don't copy the hours.
- Only requests that became late **in the last 24 hours** (createdAt + SLA hours is between
  now − 24 h and now). Requests that were already late before the job existed must not all
  push on its first run.

Jobs:

- `POST /internal/jobs/caretaker-daily`: body `{ today?: "YYYY-MM-DD" }`; returns counts
  `{ readingsDue, finalReadings }`.
- `POST /internal/jobs/maintenance-late`: body `{ now?: ISO string }`; returns `{ late }`.

Both go behind `JobsGuard` like the stays jobs. Put the date logic in a pure `*.ts` file with
a `*.spec.ts`: is-the-1st, period label, the 24-hour late window.

Add to `infra/vm/cron/crontab`:

- `0 8 * * *` `caretaker-daily`;
- `*/15 * * * *` `maintenance-late`.

Add both to the job list in `infra/gcp/README.md`.

**Mobile push routes** (`mobileRouteForActionUrl`). Add before the generic `/app` fallback:

- `/app/meter-readings` → `/staff/more/meters`, keeping `?propertyId=` if present;
- `/app/units/<id>` → `/staff/units/<id>`;
- `/app/maintenance?late=true` already maps to `/staff/more/maintenance`. Keep it, and test it.

### Not in this slice

- Web editing of readiness.
- Readiness in the Today screen.
- Notification settings / muting.
- Vacancy photos (phase 15).
- Pushes for new inspections.
- Caching units offline.

## Tests that must exist

**Backend unit (`*.spec.ts`):**

- `canReceive`:
  - Owner with no permission list → yes;
  - role without the permission → no;
  - limited to another property → no;
  - empty `propertyIds` → yes;
  - INVITED / INACTIVE membership → no.
- Dates:
  - the 1st vs the 2nd in Nairobi, including 23:30 UTC on the last day of the month (which
    is the 1st in Nairobi);
  - the period label "December 2026";
  - the late window: became late 1 h ago → in; became late 25 h ago → out; not late yet → out.

**Backend e2e** (new `backend/test/caretaker-pushes.e2e-spec.ts`, plus readiness cases in
`portfolio.e2e-spec.ts` or the new file):

1. Readiness:
   - PATCH sets READY, then null clears it, and both appear in GET;
   - `"CLEAN"` → 400;
   - a role without `units:update` → 403;
   - a caretaker limited to another property → 404;
   - an audit row is written.
2. `caretaker-daily` on the 1st, with two properties A (meter) and B (no meter):
   - a caretaker limited to A gets exactly one `METER_READINGS_DUE`;
   - a member without `meters:create` gets none;
   - a member limited to B gets none.
3. Running `caretaker-daily` again the same day creates no new notifications.
4. `caretaker-daily` on the 2nd sends no `METER_READINGS_DUE`.
5. Move-out today:
   - a NOTICE tenancy ending today on a unit with an ACTIVE meter → `FINAL_METER_READING`
     with `actionUrl` `/app/units/<unitId>`;
   - one on a unit without a meter → none;
   - one ending tomorrow → none.
6. `maintenance-late`:
   - an URGENT request created 25 h before `now` → one `MAINTENANCE_LATE` to
     `maintenance:update` holders who can see the property;
   - a second run → none;
   - a request late for 3 days → none;
   - a CLOSED one → none.
7. Both jobs with no `Authorization` header → 401 (`JobsGuard` with `JOBS_SHARED_SECRET` set).

**Web** (`portfolio.test.ts`): `UNIT_READINESS` has a label and tone for all three values,
and matches the backend enum.

**Mobile:**

- Unit detail with readiness `NEEDS_CLEANING` shows **Needs cleaning**.
- With `units:update`: picking **Ready** sends `PATCH /units/u1 {"readiness":"READY"}` and
  shows "Unit marked as Ready."; **Not set** sends `{"readiness":null}`.
- Without `units:update`: no Readiness row.
- A network error (`DropConnection()`) shows the no-connection message and keeps the old chip.
- `push_routes_test.dart`:
  - `/app/meter-readings` → `/staff/more/meters`;
  - `/app/meter-readings?propertyId=p1` → `/staff/more/meters?propertyId=p1`;
  - `/app/units/u1` → `/staff/units/u1`;
  - `/app/maintenance?late=true` → `/staff/more/maintenance`.

## Checks before handing back

```bash
cd backend  && npx prettier --check "src/**/*.ts" "test/**/*.ts" && npx tsc --noEmit && npm run lint && npm run test && npm run test:e2e
cd frontend && npx tsc -b && npm run lint && npm run test
cd mobile   && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test
```

Report any check you could not run and why.

## Progress

### Built
- **Database & Prisma**
  - `backend/prisma/migrations/20261127090000_unit_readiness/migration.sql` *(new)* & `backend/prisma/schema.prisma`: Added `enum UnitReadiness` (`READY`, `NEEDS_CLEANING`, `UNDER_REPAIR`), nullable `Unit.readiness`, and `model TaskPush` (`task_pushes` with `@@unique([orgId, kind, refKey])`), and regenerated Prisma Client.
  - `backend/src/prisma/org-scope.extension.ts`: Registered `'TaskPush'` in `ORG_SCOPED_MODELS`.
- **Unit readiness (API, web, mobile)**
  - `backend/src/modules/portfolio/units/units.dto.ts` & `units.service.ts`: Accepted optional `readiness` (`'READY' | 'NEEDS_CLEANING' | 'UNDER_REPAIR' | null`) on `PATCH /units/:id`, persisted and audited it in `snapshot()` / `update()`, and returned `readiness` on `GET /units` and `GET /units/:id` with property-scope enforcement (`404` out of scope, `403` without `units:update`).
  - `frontend/src/features/portfolio/types.ts`, `labels.ts`, `UnitsTable.tsx`, `portfolio.test.ts`: Added `UnitReadiness`, `UNIT_READINESS` (`Ready` good, `Needs cleaning` warn, `Under repair` warn), a second `Badge` in the `UnitsTable` Status cell when `unit.readiness` is set, and unit tests in `portfolio.test.ts`.
  - `mobile/lib/features/staff/staff_models.dart`, `staff_widgets.dart`, `units/units_screens.dart`, `mobile/test/staff/unit_readiness_test.dart`: Added `UnitRow.readiness`, `unitReadinessLabel` / `unitReadinessTone`, the readiness `StatusChip` on `UnitDetailScreen`, and (for `units:update` holders) the **Readiness** row & bottom sheet (**Ready**, **Needs cleaning**, **Under repair**, **Not set**) sending `PATCH /units/:id`, showing `"Unit marked as <label>."` / `"Readiness cleared."`, and showing `"No connection. Try again when you're online."` on network errors without losing the existing chip.
- **Task pushes, scheduled jobs, infra & push routing**
  - `backend/src/modules/maintenance/task-pushes.rules.ts` *(new)* & `task-pushes.rules.spec.ts` *(new)*: Pure `canReceive(membership, permission, propertyId)` plus Nairobi 1st-of-month detection, period label formatting (`"December 2026"`), and the 24-hour late window built on `SLA_HOURS` / `isOverdue` from `sla.ts`, with unit tests.
  - `backend/src/modules/maintenance/task-pushes.service.ts` *(new)*, `task-pushes.controller.ts` *(new)* & `maintenance.module.ts`: Implemented `POST /internal/jobs/caretaker-daily` (`METER_READINGS_DUE` on the 1st of the month in Nairobi, once per person per org; `FINAL_METER_READING` for same-day `NOTICE` move-outs on units with an `ACTIVE` meter) and `POST /internal/jobs/maintenance-late` (`MAINTENANCE_LATE` for open/in-progress requests whose SLA elapsed in the last 24 hours), guarded by `JobsGuard` and deduplicated by claiming `(orgId, kind, refKey)` in `task_pushes` before calling `NotificationsService.notifyUser`.
  - `backend/test/caretaker-pushes.e2e-spec.ts` *(new)*: E2E coverage for readiness CRUD/audit/422/403/404, `caretaker-daily` on the 1st vs 2nd, idempotency on repeat runs, suspended org exclusion, `FINAL_METER_READING` move-out rules, `maintenance-late` 24-hour window / 3-day-late / closed / repeat runs, and `401` without valid job auth.
  - `infra/vm/cron/crontab` & `infra/gcp/README.md`: Added `0 8 * * *` `caretaker-daily` and `*/15 * * * *` `maintenance-late` schedules.
  - `mobile/lib/core/notifications/push_service.dart` & `mobile/test/core/push_routes_test.dart`: Added `/app/meter-readings` (preserving `?propertyId=`) → `/staff/more/meters` and `/app/units/<id>` → `/staff/units/<id>` before the `/app` fallback, and tested all four staff push URLs.

### Not built
- Web editing of readiness, readiness in the Today screen, notification settings/muting, vacancy photos, inspection pushes, and offline unit caching (all out of scope for this slice).

### Done differently & notes (agreed before coding)
1. **Invalid readiness HTTP status (`422` vs `400`):** In `configureApp()` (`backend/src/app.setup.ts`), the global `ValidationPipe` maps DTO validation failures to `AppError.validation(...)` (`422 VALIDATION_FAILED`). Per owner confirmation, `PATCH /units/:id` with `"readiness": "CLEAN"` uses the API's standard `422 VALIDATION_FAILED` and is tested for `422`.
2. **Skipping `SUSPENDED` as well as `CLOSED` organisations:** Per owner instruction, all three task push queries and membership lookups filter `organization: { status: { notIn: ['CLOSED', 'SUSPENDED'] } }`, verified by an e2e case confirming a suspended organisation's caretaker receives no `METER_READINGS_DUE`.
3. **Future ideas (not built here):** Automatically clearing `Unit.readiness` (or setting `NEEDS_CLEANING`) when a tenancy moves in or moves out, or surfacing units not yet `READY` on the caretaker Today screen and web unit filter bar.

### Checks run
- `cd backend && npx prettier --check "src/**/*.ts" "test/**/*.ts"` — **passed** (`All matched files use Prettier code style!`)
- `cd backend && npx tsc --noEmit` — **passed** (`0` errors)
- `cd backend && npm run lint` — **passed** (`0` warnings, `0` errors)
- `cd backend && npm run test` — **passed** (`62` test files, `321` tests passed)
- `cd backend && npm run test:e2e` — **passed** (`42` test files, `295` tests passed)
- `cd frontend && npx tsc -b && npm run lint && npm run test` — **passed** (`0` warnings/errors; `65` test files, `734` tests passed)
- `cd mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test` — **passed** (`0` format changes, `No issues found!`, `300` tests passed)
