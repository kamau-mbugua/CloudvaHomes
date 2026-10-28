# Phase 7 — Tenant portal & reminders (implementation plan)

**Date:** 2026-10-28
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §6.3 (tenant shell), §5.2 (STK "Pay"), §9 phase 7
**Depends on:** phases 4–5 (done)
**Status:** DONE 2026-10-28 — see "Outcome" at the end
**Goal:** tenants sign in on their phone with a one-time code to see what they owe, their invoices, statement and receipts, and to pay by M-Pesa from the app. Organisations can switch on SMS reminders before rent is due and when it's overdue. Every message sent to a tenant is logged on their page.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Portal access | Staff give access per tenant ("Give portal access") or to all current tenants at once. Hodi links/creates a user with the tenant's phone (and e-mail if any) and texts them the link. They sign in with a one-time code. Access can be removed. The session lists `tenantOf: [{ tenantId, name, organization }]` | Same model as the owner portal (6b). Explicit, so no tenant gets a login nobody asked for |
| What tenants see | Only their own records: balance and credit, current tenancies (unit, property, rent, billing day), deposit held, open and past invoices (with PDF), statement (with PDF), payments (with receipt PDF), how to pay (paybill/till and account number = their tenant code) and the organisation's contact details | Design §6.3 |
| Pay in the app | `POST /tenant/accounts/:id/pay {amount, phone?}` sends an STK prompt using the organisation's configured M-Pesa channel covering the tenant's property (or `409 NO_MPESA` when there's none). Same STK flow as phase 5, Idempotency-Key honoured, polled by the app | Design §5.2 |
| Reminders off by default | Organisation settings: `reminders.enabled` (default **off**), `reminders.daysBefore` (default 3; 0 = off), `reminders.overdueDays` (default `[3, 10]`). A daily job (09:00 Nairobi) sends at most **one SMS per tenant per day**, summing what is due or overdue | Tenants get no surprise messages; landlords control SMS cost |
| Reminder content | e.g. "Hi Tom, KES 20,500.00 is due on 5 Nov 2026. Pay to paybill 522522, account T00001. Prime Agency". Overdue: "…is overdue (since 5 Nov). …". The paybill comes from the organisation's M-Pesa channels for the property; without one the payment line is left out | Short (one SMS), actionable |
| Opt-out | `Tenant.remindersOff` set by staff (a tenant can ask). Manual "Send reminder now" still works | Transactional, but people can say no |
| Message log | `Message` rows (tenant, kind `REMINDER_DUE` / `REMINDER_OVERDUE` / `REMINDER_MANUAL` / `PORTAL_ACCESS`, to, text, status `SENT`/`FAILED`, error). The reminder job is idempotent with a unique (tenant, kind, day) | Staff can answer "did they get it?" |
| Delivery | Synchronous through the existing SMS adapter (Africa's Talking when configured, log otherwise), failures recorded, never retried in a loop | Cloud Tasks is still a later step |

## Data model (migration `tenant_portal`)

- `Tenant` gains `portalInvitedAt?`, `remindersOff Boolean @default(false)` (`userId` exists).
- `Organization.settings` (JSON, exists) holds `reminders: { enabled, daysBefore, overdueDays }`.
- `Message` — `orgId`, `tenantId?`, `kind`, `channel SMS|EMAIL`, `to`, `text`, `status`, `error?`, `day date`, `createdById?`, `createdAt`. Partial unique `(tenantId, kind, day) WHERE kind IN ('REMINDER_DUE','REMINDER_OVERDUE')`.

## API contract (under `/api/v1`)

| Method & path | Permission | Notes |
|---|---|---|
| `POST /tenants/:id/portal-access` · `DELETE` → `{ hasAccess, invitedAt }` (200) | `tenants:update` | `409 NO_CONTACT` without a phone |
| `POST /tenants/portal-access` `{ propertyId? }` → `{ invited }` (200) | `tenants:update` | All current tenants (optionally one property) without access yet |
| `GET /tenants/:id` gains `portal: { hasAccess, invitedAt }`, `remindersOff` | `tenants:view` | `PATCH /tenants/:id` accepts `remindersOff` |
| `POST /tenants/:id/reminder` → Message (200) | `tenants:update` | Sends the balance reminder now (`409 NOTHING_DUE` when nothing is owed) |
| `GET /messages?tenantId&kind&status&from&to` | `tenants:view` | Paged, newest first |
| `GET/PATCH /organization` gains `reminders: { enabled, daysBefore (0–14), overdueDays (up to 5 values, 1–90) }` | `settings:view/update` | |
| `GET /tenant/accounts` → `[{ tenantId, code, name, organization: { id, name } }]` | signed-in user linked to the tenant | |
| `GET /tenant/accounts/:id` → overview | same | `{ tenant, organization: { name, phone, email }, balance, credit, depositHeld, tenancies: [{ id, unit, property, rentAmount, billingDay, status, startDate, endDate }], openInvoices: [...], howToPay: [{ kind, name, shortcode, accountRef }], canPayInApp }` |
| `GET /tenant/accounts/:id/invoices?status&page` · `/invoices/:invoiceId` · `/invoices/:invoiceId/pdf` | same | Same shapes as staff invoices |
| `GET /tenant/accounts/:id/statement?from&to` · `/statement/pdf` | same | Same shape as phase 4 |
| `GET /tenant/accounts/:id/payments` · `/payments/:paymentId/receipt` | same | |
| `POST /tenant/accounts/:id/pay` `{ amount, phone? }` + `Idempotency-Key` → StkRequest (202) · `GET /tenant/accounts/:id/pay/:stkId` | same | `409 NO_MPESA` |
| `POST /internal/jobs/reminders` | scheduler OIDC | Daily 09:00 Nairobi |
| Session gains `tenantOf: [{ tenantId, name, organization: { id, name } }]` | | |

New error codes: `NO_MPESA`, `NOTHING_DUE`.

## Frontend

1. **Tenant portal** (`/tenant`): its own phone-first shell (like `/owner`), account switcher when `tenantOf` has several. Tabs: Home (balance, "Pay now", how to pay with copyable paybill/account, current home, deposit held, open invoices), Invoices (list + detail + PDF), Statement (range + PDF), Payments (list + receipt PDF). "Pay now" sheet: amount (default balance, whole shillings), phone (default own), live status like the staff STK dialog. Users with no organisation but `tenantOf` land here; the account menu links to it.
2. **Staff tenant page:** portal-access card (give/remove), "Send reminder now", reminders opt-out toggle, Messages section (log).
3. **Tenants list:** "Give portal access to all current tenants" (with property filter applied).
4. **Organisation settings:** Reminders section (on/off, days before, overdue days).

## Tests

- **Unit:** reminder schedule (which tenants on which day, one per tenant per day), SMS wording and length, paybill selection.
- **e2e:** portal access → OTP sign-in → `tenantOf` → overview/invoices/statement/payments/PDFs for own records only (another tenant 404, no staff endpoints); pay in app via fake Daraja → payment on their account; reminders job off by default, on → due-soon and overdue messages once per day, opted-out tenants skipped, re-run sends nothing; manual reminder; message log; cross-org.

## Not in phase 7

Push notifications (mobile, phase 9), e-mail statements, maintenance requests, tenant self-registration.

## Done when

All checks pass. Locally a tenant gets portal access, signs in with a code on a phone-sized screen, sees their invoice and statement, pays by (simulated) M-Pesa, and the payment shows on their account. With reminders switched on, the job texts a tenant whose rent is due in 3 days, once.

## Outcome (2026-10-28)

- Backend: 128 unit + 94 e2e tests (real Postgres, fake Daraja): no code without access; access → OTP sign-in → `tenantOf`; own account, invoices, statement, PDFs only (another tenant's account or invoice 404, staff endpoints 403); access removal; pay in app → callback → payment, balance 0, receipt; reminders off by default, on → one SMS per tenant per day (due-soon, then overdue), opted-out skipped, re-run sends nothing; manual reminder (and `NOTHING_DUE`); message log; bulk access once. Frontend: 408 tests.
- Verified in a browser at 390px on the dev data: "Give portal access" from the tenant page (SMS logged), the tenant signing in with a code, home page (credit, paybill/account with copy buttons, home, deposit), "Pay in advance" KES 1,000 → "Paid" with the simulated M-Pesa receipt, credit up by KES 1,000.
- Fixed during the check: the "Call" contact button lost its space before the number.
