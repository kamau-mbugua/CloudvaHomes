# Phase 9 — Mobile app on the new API (implementation plan)

**Date:** 2026-10-28
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §7 (mobile), §6.3 (tenant shell), §9 phase 9
**Depends on:** phases 1–8 (done)
**Status:** DONE 2026-10-28 — see "Outcome" at the end
**Goal:** a Flutter app on the new API with two modes. **Tenants** sign in with a phone code, see what they owe and pay rent by M-Pesa. **Staff** handle the daily field work: look up a unit or tenant, record a payment or send an M-Pesa prompt, read meters with a photo, add an expense with a receipt, and match unmatched M-Pesa payments. Setup and admin stay on the web.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Where | New Flutter project in **`mobile/`**. `hodi_app/` stays untouched as the reference until the owner removes it; its screens and flows are ported, not its code | The legacy data layer (`AuthenticatedAppProviders`, hand-written models for the old API) is being replaced wholesale. A clean project also leaves the committed keystore behind. `hodi_app/` has its own `.git`, which the owner handles |
| API client | Hand-written: a `dio` client (auth header, single-flight token refresh, `ApiError` from the standard error envelope, Idempotency-Key on money calls) and plain Dart model classes per feature | The backend's OpenAPI has request DTOs but no response schemas, so `openapi-generator` would produce request code only. Same choice the web app made (§6.4 deviation, recorded here) |
| State | `flutter_riverpod` (providers/notifiers per feature) + `go_router` | Replaces the 1,648-line provider class; small, testable units |
| Session | Sign-in with `client: "mobile"`: the refresh token comes back in the body and is kept in `flutter_secure_storage` (Keychain / Keystore). Access token in memory only. Signing out revokes the session on the server | Design §4 |
| Modes | After sign-in: users with an organisation get **staff mode** (bottom tabs). Users with only `tenantOf` get **tenant mode**. Someone with both can switch from the account sheet. Owner portal and platform admin stay web-only | Matches the session shape (`organizations`, `tenantOf`, `ownerOf`) |
| Permissions | Screens and buttons follow the session's `permissions` list; the server stays the authority (403 shown plainly) | Design §4.3 |
| Money | `int` cents everywhere; one `formatKes()` helper (`KES 25,000.00`); M-Pesa amounts are whole shillings | Design §7 |
| Hodi suspension | The GRACE/SUSPENDED banner as on web; `ORG_SUSPENDED` shown with the same wording | Phase 8 |
| PDFs | Downloaded from the API to the app's temp folder and opened with the system viewer / share sheet | Same PDFs as web |
| Photos | `image_picker` (camera or gallery), compressed client-side to ≤ 1600 px JPEG, uploaded to `POST /uploads` like the web | Meter readings and expense receipts |
| Flavours | `--dart-define=API_URL=…` with `dev` / `uat` / `prod` launch configs; no secrets in the app | No flavour plugin needed |
| App id and signing | Keep `com.qnex.hodi` (`.dev` / `.uat` suffixes) so the release can ship as an update to the existing store listing. Release signing reads `android/key.properties` (git-ignored) or CI secrets; **no keystore in the repo** | Design §7 security fixes. Owner to confirm the store listing |
| Design | Hodi colours and type from the web (`frontend/src/styles`), Material 3, light and dark | One brand |

## Screens

**Shared:** splash/session restore · sign in (email or phone + password, or "Sign in with a code" for phones) · forgot password (code) · account sheet (name, organisation switch, mode switch, theme, sign out, app version).

**Tenant mode** (tabs: Home · Invoices · Payments · Statement)
- Home: balance or credit, "Pay now" (amount, phone → STK → live status), how to pay (paybill/till + account, copy), my home (unit, rent, deposit held), contact the organisation (call / e-mail).
- Invoices: open and past, detail with lines, PDF.
- Payments: list, receipt PDF.
- Statement: date range, running balance, PDF.

**Staff mode** (tabs: Home · Units · Tenants · Money · More)
- Home: this month's invoiced/collected, arrears, occupancy (dashboard API), quick actions.
- Units: search, filter by property and vacant/let; unit detail (current tenancy, balance).
- Tenants: search; tenant detail (contacts with call/SMS, balance, open invoices, statement, payments, "Record payment", "Send M-Pesa prompt", "Send reminder").
- Money: payments (list, detail, receipt), invoices (list, detail, PDF), unmatched M-Pesa (assign to tenant / ignore).
- More: meter readings (pick meter → reading + photo; recent readings), expenses (list, add with receipt photo), Plan & billing (read-only + Pay now), account.

Web-only for now: setup (properties/units creation, charges, channels, Daraja), users and roles, agency accounting, reports beyond the dashboard, owner portal, platform admin.

## Backend changes

None expected. If a screen needs a small read endpoint, it is added with tests in the same phase.

## Tests

- Unit: money formatting, error mapping, token refresh (single flight, refresh failure → signed out), session → mode routing, permission gating, STK status polling.
- Widget: sign-in, tenant home (owes / in credit), pay sheet states, staff tenant detail actions hidden without permission, suspended banner.
- Live check on the iOS simulator against the local API and the dev data: a tenant signs in with a code and pays (simulated M-Pesa); a staff member records a payment, sends a prompt, reads a meter with a photo and adds an expense.

## Not in phase 9

Push notifications (needs FCM/APNs set-up), offline mode, owner and admin modes, store release (owner: listing, signing keys, privacy form).

## Done when

`flutter analyze` (no issues) and `flutter test` pass; a debug build runs on the iOS simulator against the local API with the flows above working.

## Outcome (2026-10-28)

- **`mobile/` (new Flutter app).**
  - `flutter analyze` is clean; `flutter test` passes 47 tests: core 17, auth 3, tenant 3, billing 3, STK sheet 2, staff 19.
  - **Core:**
    - API client: one shared token refresh; a POST is never retried; the `ORG_SUSPENDED` wording matches the web.
    - Session: the refresh token is kept in secure storage, and launching offline doesn't sign the person out.
    - The router redirect is pure (no side effects).
    - `PagedList`, the M-Pesa prompt sheet, the Hodi bill banner and Plan & billing.
  - **Tenant mode:** home, invoices with PDFs, payments with receipts, statement, Pay now.
  - **Staff mode:**
    - Home dashboard.
    - Units with filters.
    - Tenants: record a payment, send an M-Pesa prompt, send a reminder.
    - Money: payments, invoices, unmatched M-Pesa (assign or ignore).
    - More: meter readings with a photo, expenses with a receipt photo, Plan & billing.
- **Live check** (`integration_test/live_test.dart`) on the iPhone 17 simulator against the local API and the dev data:
  - The tenant signed in with an SMS code and paid KES 100 (simulated M-Pesa, "Paid" with a receipt), then viewed an invoice, payments and the statement.
  - The staff member:
    - signed in;
    - opened Achieng's page;
    - recorded a KES 50 bank payment (receipt RCT-…, SMS sent);
    - sent an M-Pesa prompt that was paid;
    - saved a 210.5 m³ reading with a photo, stored as an 11 KB JPEG (`METER_PHOTO` upload).
- **Fixed from the screenshots:**
  - detail screens stacked under the tab app bar; they now use the root navigator;
  - fact-row alignment;
  - the success icon colour;
  - phone and email wrapping on the tenant page;
  - the "Credit left" wording, now "Held as credit".
- **Decisions taken while building:**
  - The record-payment Idempotency-Key is reused on an unchanged resubmit and replaced when a field changes, as on the web (the server answers `IDEMPOTENCY_MISMATCH` to a reused key with a different body).
  - `hodi_app/` is untouched.
  - No backend changes were needed.
- **Not done (owner):**
  - App icons and splash.
  - Store listing and the upload key (rotate the legacy key, write `key.properties` in CI).
  - Android emulator run (iOS only so far).
  - Push notifications.
  - Removing `hodi_app/` and its committed keystore from the repo.
