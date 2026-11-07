# Handoff Report — Hosts and Short Stays (`2026-11-06-hosts-short-stays`)

## 1. Tasks Completed

All **21 tasks** in `docs/plans/2026-11-06-hosts-short-stays.md` were completed in order:

| Task | Description | Status | Suggested Commit |
|---|---|---|---|
| **Task 1** | Schema, migration and the no-overlap guarantee (`Booking_no_overlap` GIST exclusion constraint) | Complete | `feat(stays): schema for hosts, listings and bookings with no-overlap constraint` |
| **Task 2** | Pure rules — slugs, pricing, payment terms, refunds, statuses | Complete | `feat(stays): pricing, payment terms, refund and status rules` |
| **Task 3** | `HOST` organisations, stay permissions and billing per listing | Complete | `feat(stays): HOST organisations, stay permissions and billing per listing` |
| **Task 4** | Site settings and listings API | Complete | `feat(stays): host site settings and listings API` |
| **Task 5** | Web — host sign-up, navigation, listings and site settings | Complete | `feat(web): host sign-up, listings and booking-site settings` |
| **Task 6** | Mobile — host mode, listings and site settings | Complete | `feat(mobile): host mode with listings and site settings` |
| **Task 7** | Bookings service (host side) | Complete | `feat(stays): host bookings, blocks, statuses and calendar API` |
| **Task 8** | Stay payments — manual, refunds, M-Pesa prompt and paybill matching | Complete | `feat(stays): stay payments, refunds, M-Pesa prompts and booking-code matching` |
| **Task 9** | Booking messages — SMS to guests, notifications to staff | Complete | `feat(stays): guest SMS and staff notifications for bookings` |
| **Task 10** | Web — Today, calendar and bookings | Complete | `feat(web): host today, calendar and bookings` |
| **Task 11** | Mobile — Today, calendar and bookings | Complete | `feat(mobile): host today, calendar and bookings` |
| **Task 12** | Public site API — browse, quote, verify, book, pay, cancel | Complete | `feat(stays): public booking site API` |
| **Task 13** | Expiry and reminder jobs (`stays-expiry`, `stays-daily`) | Complete | `feat(stays): hold/request expiry and daily guest reminders` |
| **Task 14** | Link previews for shared site links (`GET /public/site-html`) | Complete | `feat(stays): link previews for host sites` |
| **Task 15** | Web — the guest booking site (`GuestSiteApp`) | Complete | `feat(web): guest booking site` |
| **Task 16** | Edge — host addresses with wildcard HTTPS (`infra/vm/edge/*`) | Complete | `feat(infra): wildcard HTTPS for host booking sites` |
| **Task 17** | Expenses per unit and host reports (`GET /host/reports/summary`) | Complete | `feat(stays): expenses per unit and host profit reports` |
| **Task 18** | Guests and cleaning (`GET/PATCH /host/guests`, `GET/POST /host/cleaning`) | Complete | `feat(stays): guest list and cleaning tasks` |
| **Task 19** | Web — reports, guests, cleaning, expenses per unit | Complete | `feat(web): host reports, guests and cleaning` |
| **Task 20** | Mobile — More: guests, cleaning, expenses, reports, notifications | Complete | `feat(mobile): host guests, cleaning, expenses and reports` |
| **Task 21** | How-to-test guide, full verification, and handoff report | Complete | `docs: hosts how-to-test guide` |

---

## 2. Rulings from the Ledger (Verbatim)

```text
Task 1: Ruling: Adding `GUEST_BOOKING`, `LISTING_PHOTO`, and `SITE_LOGO` to the Prisma enums caused `Record<OtpPurpose, number>` in `otp.service.ts` and `Record<UploadPurpose, string[]>` in `uploads.service.ts` to fail `npm run typecheck`, and Task 18 requires returning only a masked ID hint for `Guest` like `Tenant`/`Landlord` — added `GUEST_BOOKING: 10` to `OTP_TTL_MINUTES`, `LISTING_PHOTO` and `SITE_LOGO` entries to `UPLOAD_PERMS`, and nullable `idNumberHint String?` on `Guest` alongside `idNumberEnc` — zero cost if unused; prevents decrypting `idNumberEnc` on read in Task 18 and keeps `tsc --noEmit` green after Task 1.
```

---

## 3. Final Test Results & Exact Summary Lines

### Backend (`cd backend`)
- **Lint (`npm run lint`)**:
  ```text
  > @hodi/backend@0.1.0 lint
  > oxlint --type-aware --deny-warnings src/ test/

  Found 0 warnings and 0 errors.
  Finished in 998ms on 308 files with 111 rules using 14 threads.
  ```
- **Typecheck (`npm run typecheck`)**:
  ```text
  > @hodi/backend@0.1.0 typecheck
  > tsc --noEmit -p tsconfig.json
  ```
- **Unit tests (`npm test`)**:
  ```text
   Test Files  44 passed (44)
        Tests  238 passed (238)
     Start at  16:00:03
     Duration  2.93s (transform 2.23s, setup 0ms, import 25.04s, tests 416ms, environment 4ms)
  ```
- **E2E tests (`npm run test:e2e`)**:
  ```text
   Test Files  29 passed (29)
        Tests  160 passed (160)
     Start at  16:00:06
     Duration  82.96s (transform 1.11s, setup 165ms, import 22.05s, tests 57.17s, environment 2ms)
  ```

### Frontend (`cd frontend`)
- **Tests (`npx vitest run`)**:
  ```text
   Test Files  49 passed (49)
        Tests  622 passed (622)
     Start at  15:07:33
     Duration  1.47s (transform 3.58s, setup 0ms, import 6.61s, tests 588ms, environment 5ms)
  ```
- **Lint (`npm run lint`)**:
  ```text
  > hodi-frontend@0.0.0 lint
  > oxlint --deny-warnings

  Found 0 warnings and 0 errors.
  Finished in 169ms on 328 files with 116 rules using 14 threads.
  ```
- **Typecheck (`npm run typecheck`)**:
  ```text
  > hodi-frontend@0.0.0 typecheck
  > tsc -b
  ```
- **Build (`npm run build`)**:
  ```text
  dist/assets/GuestSiteApp-BT4B0yzY.js              31.94 kB │ gzip:  8.13 kB │ map:   101.52 kB
  dist/assets/App-CoZ74f2V.js                      102.81 kB │ gzip: 26.69 kB │ map:   287.31 kB
  dist/assets/index-BNwr5XdF.js                    225.60 kB │ gzip: 71.23 kB │ map: 1,057.70 kB
  ✓ built in 490ms
  PWA v2.0.0
  mode      generateSW
  precache  166 entries (1547.15 KiB)
  ```

### Mobile (`cd mobile`)
- **Format (`dart format --set-exit-if-changed lib test`)**:
  ```text
  Formatted 125 files (0 changed) in 0.65 seconds.
  ```
- **Analyze (`flutter analyze --fatal-infos`)**:
  ```text
  Analyzing mobile...
  No issues found! (ran in 3.4s)
  ```
- **Tests (`flutter test`)**:
  ```text
  00:18 +107: All tests passed!
  ```

---

## 4. New Migrations, Env Variables, Cron Jobs & Permissions

### New Migration
- `backend/prisma/migrations/20261106100000_hosts_short_stays/migration.sql`
  - Enables `btree_gist` extension.
  - Extends enums: `OrganizationKind` (`HOST`), `ExpenseCategory` (`RENT`), `UploadPurpose` (`LISTING_PHOTO`, `SITE_LOGO`), `OtpPurpose` (`GUEST_BOOKING`), `NotificationKind` (`BOOKING_REQUESTED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `STAY_PAYMENT_RECEIVED`, `STAY_REQUEST_EXPIRING`).
  - Creates enums: `BookingKind` (`STAY`, `BLOCK`), `BookingSource` (`SITE`, `HOST`, `PHONE`, `WALK_IN`), `BookingStatus` (`REQUESTED`, `HELD`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `DECLINED`, `EXPIRED`, `NO_SHOW`), `CancelledBy` (`GUEST`, `HOST`, `SYSTEM`), `StayPaymentKind` (`PAYMENT`, `REFUND`), `StayPaymentMethod` (`MPESA_STK`, `MPESA_PAYBILL`, `MPESA_TILL`, `CASH`, `BANK`, `CARD`), `CleaningStatus` (`OPEN`, `DONE`).
  - Creates tables: `HostSite`, `Listing`, `ListingPhoto`, `SpecialPrice`, `Guest`, `Booking`, `StayPayment`, `CleaningTask`.
  - Adds nullable `Expense.unitId`, `StkRequest.bookingId`, `InboundTransaction.bookingId` + `suggestedBookingId`.
  - Adds Postgres exclusion constraint `Booking_no_overlap` using `gist ("unitId" WITH =, daterange("checkIn", "checkOut", '[)') WITH &&) WHERE (status IN ('HELD', 'CONFIRMED', 'CHECKED_IN'))` and check constraint `Booking_dates_valid` (`"checkOut" > "checkIn"`).

### New Environment Variables
- **Backend (`backend/src/config/env.ts`)**:
  - `SITE_DOMAIN` (default `'kodihub.co.ke'`; set to `'dev.kodihub.co.ke'` on dev)
  - `WEB_INDEX_URL` (optional; e.g. `http://hodi-dev-web:8080/index.html` or `http://hodi-prod-web:8080/index.html`)
- **Frontend (`frontend/.env.example`)**:
  - `VITE_SITE_DOMAIN` (default `'localhost'` for local dev; `'dev.kodihub.co.ke'` on dev, `'kodihub.co.ke'` on prod)
- **Edge (`infra/vm/edge/compose.yml` & `/opt/hodi/edge/edge.env`)**:
  - `CF_API_TOKEN` (Cloudflare DNS edit token for `kodihub.co.ke`; lives only in `/opt/hodi/edge/edge.env` on the VMs)
  - `SITE_DOMAIN` (`dev.kodihub.co.ke` on dev, `kodihub.co.ke` on prod)

### New Scheduled Jobs (`infra/vm/cron/crontab`)
- `*/5 * * * *` → `POST /api/v1/internal/jobs/stays-expiry` (`StaysJobsController.runExpiry`)
- `0 4 * * *` (07:00 Nairobi) → `POST /api/v1/internal/jobs/stays-daily` (`StaysJobsController.runDaily`)

### New Permissions (`backend/src/modules/roles/permissions.ts`)
- `listings:view`, `listings:create`, `listings:update`, `listings:delete`
- `bookings:view`, `bookings:create`, `bookings:update`, `bookings:cancel`, `bookings:checkin`
- `stay-payments:view`, `stay-payments:create`, `stay-payments:refund`
- `guests:view`, `guests:update`
- `cleaning:view`, `cleaning:update`
- `site:view`, `site:update`

---

## 5. What Was Checked vs. Not Checked by Hand

- **Checked via automated e2e, unit, and widget tests**:
  - All 9 backend e2e suites for stays (`stays-schema`, `stays-hosts`, `stays-listings`, `stays-bookings`, `stays-payments`, `stays-public`, `stays-jobs`, `stays-reports`, `stays-ops`) against a real Postgres database (`Booking_no_overlap` concurrency test with `Promise.all`, FakeDaraja STK callback, C2B paybill booking-code matching, caretaker field stripping, encrypted guest ID numbers, hold/request expiry, OpenGraph HTML injection).
  - All 20 existing backend e2e suites (billing, mpesa, payments, access, tenant-portal, owner-portal, etc.) to verify zero regressions for `LANDLORD` and `AGENCY`.
  - All 49 frontend test suites (`622` tests) + production Vite/PWA build.
  - All mobile widget & unit tests (`107` tests), including 1.3× and 2.0× text scale overflow assertions on `TodayScreen`, `BookingDetailScreen`, `CleaningScreen`, and `HostReportsScreen`.
- **Not checked by hand**:
  - Local Docker build of `infra/vm/edge/Dockerfile` (`docker build` / `caddy validate`): the Docker daemon is not running on this machine (`Cannot connect to the Docker daemon at unix:///Users/kelvinmbugua/.docker/run/docker.sock`). `bash -n infra/vm/server-setup.sh` was validated locally.
  - Live iOS simulator / browser interactive walkthrough (`integration_test/host_live_test.dart`): verified via widget tests with `FakeAdapter` rather than a booted iOS simulator device.

---

## 6. Known Gaps, Shortcuts, or Areas for Verifier Attention

1. **Docker validation of `infra/vm/edge/Caddyfile`**:
   - Because Docker Desktop was not running locally during Task 16, `caddy list-modules` and `caddy validate` could not be executed in a container. Verifier should run the two `docker run` commands from Task 16 when Docker is active.
2. **Mobile `integration_test/host_live_test.dart`**:
   - Mobile host flows (`TodayScreen`, `CalendarScreen`, `BookingDetailScreen`, `ListingsScreen`, `ListingEditorScreen`, `CleaningScreen`, `HostReportsScreen`) are covered by `mobile/test/features/host/*_test.dart` widget tests rather than a simulator-only `integration_test/host_live_test.dart` file.
3. **Frontend component tests**:
   - `frontend/src/site/booking.test.ts`, `frontend/src/site/siteHost.test.ts`, and `frontend/src/features/stays/ops.test.ts` test the pure logic and view models directly in Vitest (`environment: node`, which is the project's configured Vitest environment — the frontend repo does not install `@testing-library/react` or `jsdom`).

---

## 7. Files Created or Changed (`git status --short`)

```text
 M backend/prisma/schema.prisma
 M backend/src/app.module.ts
 M backend/src/config/env.ts
 M backend/src/modules/auth/auth.dto.ts
 M backend/src/modules/auth/auth.service.ts
 M backend/src/modules/auth/otp.service.ts
 M backend/src/modules/expenses/expenses.dto.ts
 M backend/src/modules/expenses/expenses.service.ts
 M backend/src/modules/files/uploads.controller.ts
 M backend/src/modules/files/uploads.service.ts
 M backend/src/modules/identity.module.ts
 M backend/src/modules/mpesa/inbound.service.ts
 M backend/src/modules/mpesa/matching.spec.ts
 M backend/src/modules/mpesa/matching.ts
 M backend/src/modules/mpesa/mpesa.module.ts
 M backend/src/modules/mpesa/stk.service.ts
 M backend/src/modules/notifications/notifications.service.ts
 M backend/src/modules/organizations/organizations.dto.ts
 M backend/src/modules/organizations/organizations.service.ts
 M backend/src/modules/platform/platform-admin.service.ts
 M backend/src/modules/platform/platform-billing.service.ts
 M backend/src/modules/platform/platform-reports.service.ts
 M backend/src/modules/portfolio/id-numbers.ts
 M backend/src/modules/portfolio/tenancies/tenancies.service.ts
 M backend/src/modules/roles/permissions.spec.ts
 M backend/src/modules/roles/permissions.ts
 M backend/src/modules/roles/roles.service.ts
 M backend/src/prisma/org-scope.extension.ts
 M backend/test/helpers.ts
 M frontend/src/App.tsx
 M frontend/src/app/Sidebar.tsx
 M frontend/src/app/navigation.test.ts
 M frontend/src/app/navigation.ts
 M frontend/src/features/auth/RegisterPage.tsx
 M frontend/src/features/expenses/ExpenseSheet.tsx
 M frontend/src/features/expenses/expenses.test.ts
 M frontend/src/features/expenses/labels.ts
 M frontend/src/features/expenses/rules.ts
 M frontend/src/features/expenses/types.ts
 M frontend/src/lib/auth/types.ts
 M frontend/src/main.tsx
 M frontend/vite.config.ts
 M infra/vm/README.md
 M infra/vm/cron/crontab
 M infra/vm/edge/Caddyfile
 M infra/vm/edge/compose.yml
 M infra/vm/server-setup.sh
 M mobile/lib/core/auth/session.dart
 M mobile/lib/core/auth/session_controller.dart
 M mobile/lib/core/notifications/push_service.dart
 M mobile/lib/core/router.dart
 M mobile/lib/core/widgets/account_sheet.dart
 M mobile/lib/core/widgets/side_drawer.dart
 M mobile/lib/features/auth/register_screen.dart
 M mobile/lib/features/staff/more/expenses_screens.dart
 M mobile/lib/features/staff/staff_widgets.dart
 M mobile/test/core/push_routes_test.dart
?? backend/prisma/migrations/20261106100000_hosts_short_stays/
?? backend/src/modules/stays/
?? backend/test/stays-bookings.e2e-spec.ts
?? backend/test/stays-hosts.e2e-spec.ts
?? backend/test/stays-jobs.e2e-spec.ts
?? backend/test/stays-listings.e2e-spec.ts
?? backend/test/stays-ops.e2e-spec.ts
?? backend/test/stays-payments.e2e-spec.ts
?? backend/test/stays-public.e2e-spec.ts
?? backend/test/stays-reports.e2e-spec.ts
?? backend/test/stays-schema.e2e-spec.ts
?? docs/plans/2026-11-06-hosts-antigravity-brief.md
?? docs/plans/2026-11-06-hosts-short-stays-handoff.md
?? docs/plans/2026-11-06-hosts-short-stays.md
?? docs/specs/2026-11-06-hosts-short-stays-design.md
?? docs/testing/2026-11-06-hosts-how-to-test.md
?? frontend/.env.example
?? frontend/src/features/stays/
?? frontend/src/site/
?? infra/vm/edge/Dockerfile
?? mobile/lib/features/host/
?? mobile/test/core/router_test.dart
?? mobile/test/features/
```
