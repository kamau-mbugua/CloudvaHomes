# Phase 8 — Platform billing (implementation plan)

**Date:** 2026-10-28
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.4 (platform billing), §6.3 (admin shell)
**Depends on:** phase 5 (done)
**Status:** DONE 2026-10-28 — see "Outcome" at the end
**Goal:** Hodi bills each organisation monthly for the units it has let, at prices the platform admin sets. Organisations see their Hodi plan and invoices and pay by M-Pesa (Hodi's own paybill) or bank. Unpaid accounts go to a grace period (banner) and then read-only suspension, but tenants can always pay rent. Platform admins get their own area to run all of this.

## Owner decision (2026-10-28)

**Prices are set by the platform admin**, with no built-in price list. Admins create plans (price per occupied unit per month, monthly minimum, trial days), mark one as the default for new organisations, and can give any organisation its own price or minimum (an override) and trial end date.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| What is billed | On the 1st, for the previous month: **units let on its last day**, i.e. units with a tenancy covering that date. `total = max(units × price, minimum)`, using the organisation's override if set, else its plan. Issue on the 1st, due after `dueDays` (platform setting, default 10). One invoice per organisation per month | Design §5.4. A fixed snapshot date is easy to check against the organisation's own data |
| Trial | New organisations get the default plan and `trialEndsAt = created + plan.trialDays`. Months ending on or before `trialEndsAt` aren't billed. The admin can change the trial end date | Design §5.4 |
| Status | Recomputed daily from unpaid platform invoices: none overdue → `ACTIVE` (or `TRIAL` while in trial); overdue → `GRACE`; overdue `suspendAfterDays` or more (default 21) → `SUSPENDED`. The admin can push it back with **"no suspension until <date>"**, or close an organisation (`CLOSED` is never changed by the job) | Design §5.4; admins can be lenient without fighting the job |
| What suspension blocks | Read-only. Every change by staff is refused with `403 ORG_SUSPENDED`, **except**: paying Hodi, signing in, own account settings, and recording money in (payments, M-Pesa prompts, reconciliation assign). Tenant portal, owner portal, M-Pesa callbacks and scheduled jobs (invoice run, reminders) keep working | Design §5.4: rent collection is never blocked |
| Grace | Nothing is blocked; the web app shows a banner with the amount and due date and a "Pay now" link | Design §5.4 |
| Paying Hodi | Billing account number per organisation (`H00001`). (1) **STK push** from the organisation's billing page via Hodi's own Daraja app (platform settings, write-only, step-up). (2) **Paybill C2B** with the account number, matched automatically (callbacks under `/hooks/platform/<token>/…`, same safeguards as phase 5). (3) **Manual** entry by a platform admin (bank transfer, cheque). Payments are allocated oldest-invoice-first; any excess is held as credit and used by the next invoice | Design §5.4 |
| Who can do what | Platform admins (`isPlatformAdmin`) only on `/platform/*`. In an organisation, `settings:view` sees billing, and paying Hodi needs `settings:update` | Paying is an owner/manager task |
| Platform settings | One row: `dueDays`, `graceDays` (days overdue before the banner turns into a warning: informational), `suspendAfterDays`, `defaultPlanId`, Hodi paybill shortcode, Daraja environment + keys (encrypted) | Admin-managed, no deploy needed |

## Data model (migration `platform_billing`)

- `Plan` — `name` (unique), `description?`, `pricePerUnit`, `minimumMonthly`, `trialDays`, `isDefault`, `active`.
- `Organization` gains `billingRef @unique` (`H00001`), `planId?`, `priceOverride?`, `minimumOverride?`, `trialEndsAt?`, `noSuspendUntil?`, `platformCredit BigInt`.
- `PlatformInvoice` — `number @unique` (`HODI-2026-000001`), `orgId`, `period`, `occupiedUnits`, `rate`, `minimum`, `total`, `amountPaid`, `issueDate`, `dueDate`, `status` (reuses `InvoiceStatus`), `voidReason?`. Unique `(orgId, period)` while not void.
- `PlatformPayment` — `orgId`, `amount`, `method MPESA|BANK|CHEQUE|OTHER`, `source STK|C2B|MANUAL`, `reference` (unique), `payerName?`, `receivedAt`, `unallocated`, `recordedById?`, `raw?`.
- `PlatformAllocation` — `paymentId`, `invoiceId`, `amount`.
- `PlatformStkRequest` — like `StkRequest`, for organisations paying Hodi.
- `PlatformSettings` — single row (`id = 1`).

These tables are **not** org-scoped by the extension (platform code reads across organisations); organisation-facing endpoints filter by `orgContext().orgId` explicitly.

## API contract (under `/api/v1`)

**Organisation side** (`settings:view`; paying `settings:update`; all allowed while suspended)

| Method & path | Notes |
|---|---|
| `GET /billing` | `{ status, plan: { name, pricePerUnit, minimumMonthly } , price: { pricePerUnit, minimumMonthly, custom }, trialEndsAt, noSuspendUntil, billingRef, balance, credit, overdue: { amount, since } \| null, payTo: { paybill, accountRef } \| null, canPayInApp }` |
| `GET /billing/invoices?page` · `GET /billing/invoices/:id` · `/:id/pdf` | `PlatformInvoice` `{ id, number, period, occupiedUnits, rate, minimum, total, amountPaid, balance, issueDate, dueDate, status, overdue }`; detail adds `payments` |
| `GET /billing/payments?page` | `{ id, amount, method, source, reference, receivedAt }` |
| `POST /billing/pay` `{ amount, phone? }` + Idempotency-Key → `{ id, state, … }` (202) · `GET /billing/pay/:id` | STK via Hodi's paybill; `409 NO_MPESA` if Hodi's Daraja isn't set up |
| Session `activeOrganization` gains `status` | for the banner |

**Platform admin** (`isPlatformAdmin`)

| Method & path | Notes |
|---|---|
| `GET /platform/stats` | `{ organizations: { TRIAL, ACTIVE, GRACE, SUSPENDED, CLOSED }, occupiedUnits, lastMonthBilled, outstanding, collectedThisMonth }` |
| `GET /platform/plans` · `POST` · `PATCH /:id` · `DELETE /:id` (unused only) | `{ id, name, description, pricePerUnit, minimumMonthly, trialDays, isDefault, active, organizationCount }` |
| `GET /platform/organizations?q&status&page` (exists, extended) · `GET /platform/organizations/:id` | adds `status, billingRef, plan, price, trialEndsAt, noSuspendUntil, balance, occupiedUnits (now), owner` |
| `PATCH /platform/organizations/:id` `{ planId?, priceOverride? (null clears), minimumOverride?, trialEndsAt?, noSuspendUntil?, status? ('ACTIVE'\|'CLOSED') }` | Audited |
| `GET /platform/invoices?orgId&status&period&page` · `POST /platform/invoices/run` `{ period }` → `{ created }` · `POST /platform/invoices/:id/void` `{ reason }` | Run is idempotent |
| `GET /platform/payments?orgId&page` · `POST /platform/payments` `{ orgId, amount, method, reference, receivedAt, note? }` | `409 DUPLICATE_REFERENCE` |
| `GET /platform/settings` · `PUT /platform/settings` (+ step-up when Daraja keys change) | Keys write-only; response shows `daraja: { configured, environment, callbackUrls }` |
| `POST /internal/jobs/platform-invoices` (1st, 02:00) · `POST /internal/jobs/platform-status` (daily 03:00) | Scheduler OIDC |
| Hooks `POST /hooks/platform/:token/stk` · `/c2b/validate` · `/c2b/confirm` | Same checks as phase 5 |

New error codes: `ORG_SUSPENDED`, `PLAN_IN_USE`, `NO_MPESA` (exists), `DUPLICATE_REFERENCE` (exists).

## Frontend

1. **Organisation "Plan & billing"** (`/app/settings/plan`): status, plan and price (custom shown as such), trial end, balance/credit, how to pay (paybill + account number, copy), "Pay now" (STK dialog, reuse), invoices (with PDF) and payments.
2. **Banner** in the staff app: GRACE → "Your Hodi bill of KES X was due on D. Pay now"; SUSPENDED → "Your account is read-only until the Hodi bill is paid. Tenants can still pay rent." with "Pay now". Forms show the plain `ORG_SUSPENDED` message.
3. **Platform admin area** (`/admin`, its own shell, platform admins only; account-menu link): Overview (stats), Organisations (list with status filter, detail: plan/price override/trial/no-suspend-until/close, invoices, payments, "Record payment"), Plans (CRUD, default), Invoices (list, run month, void), Settings (due/grace/suspend days, default plan, Hodi paybill + Daraja keys with step-up, callback URLs).

## Tests

- **Unit:** occupied-units snapshot rule, total with minimum and overrides, trial skipping, status transitions (incl. no-suspend-until and CLOSED), suspension allow-list.
- **e2e:** admin plans + default + override; monthly run (idempotent, trial skipped, minimum applied, units counted on the last day incl. a tenancy that ended after it); manual payment allocation + credit used by next invoice; status job TRIAL→ACTIVE→GRACE→SUSPENDED and back on payment; suspended org: staff changes 403 `ORG_SUSPENDED`, reads OK, recording rent payments OK, tenant portal pay OK, paying Hodi OK; platform STK + C2B by billing ref (fake Daraja); non-admins 403 on `/platform/*`; an org sees only its own Hodi invoices.

## Not in phase 8

Self-service sign-up, card payments, VAT/eTIMS invoices for Hodi's own billing (needs a tax decision), dunning e-mails beyond the banner (SMS to the owner can come later).

## Done when

All checks pass. Locally, an admin sets a plan with a custom price for one organisation and runs the month. The organisation sees its Hodi invoice and pays it by simulated M-Pesa. An unpaid organisation turns GRACE then SUSPENDED: staff edits are refused, but a tenant still pays rent.

## Outcome (2026-10-28)

- **Backend:** 132 unit and 99 e2e tests pass, 5 of the e2e tests new for this phase (real Postgres, fake Daraja). They cover:
  - Plans: default plan and switching it, `PLAN_IN_USE`, non-admins 403.
  - Monthly run: units let on the last day, minimum applied, override, idempotent, void then re-run, trial skipped, a not-yet-ended month refused, each org sees only its own invoices.
  - Manual payments: oldest invoice first, credit kept, `DUPLICATE_REFERENCE`, a paid invoice can't be voided.
  - Status: ACTIVE → GRACE → SUSPENDED, held at GRACE by "no suspension until".
  - While suspended: reads work, changes get `ORG_SUSPENDED`, rent payments are still recorded.
  - Paying Hodi: `NO_MPESA` before setup; Daraja keys behind step-up and never returned; STK pay with Idempotency-Key; callback retries and an unknown token handled; back to ACTIVE on payment.
  - Paybill payments matched by billing ref (any case); duplicate and unknown refs ignored.
- **Frontend:** 444 tests pass. New screens: org Plan & billing page, GRACE/SUSPENDED banner with Pay now, and the `/admin` area (Overview, Organisations, Plans, Invoices, Settings).
- **Browser check** on the dev data:
  1. The admin created a "Standard" plan (KES 150 a unit, KES 2,000 minimum, default) and gave Agency a custom KES 120 with its trial ending 1 Sep.
  2. Billing September gave 3 let units × KES 120 below the minimum, so KES 2,000. Organisations with nothing to bill were skipped.
  3. The admin set up Hodi's paybill and keys, confirmed with a one-time code.
  4. With the bill backdated (SQL), Agency showed the grace banner. Once suspended, the settings save was refused with the plain message.
  5. Agency paid by simulated M-Pesa from the banner: the invoice showed Paid, the org Active, and edits worked again.
  6. While suspended, a tenant still paid KES 1,000 rent from the portal.
  7. At 390px the Plan & billing page has no horizontal overflow.
- **Not done:** VAT/eTIMS on Hodi invoices (needs a tax decision). There's no button to register Hodi's paybill C2B URLs with Safaricom, so do it by hand.
