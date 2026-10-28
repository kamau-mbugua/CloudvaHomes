# Phase 3 — Billing (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.1 (money and billing rules), §4.6 (scheduled jobs), §5.5 (schema)
**Depends on:** phase 2 (done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** tenants are billed correctly every month without anyone pressing a button. That covers rent plus each property's charges (fixed, variable and metered), move-in deposits and fees, one-off invoices, credit notes and voids, and a PDF for every invoice. Staff can preview a run before it happens and run it by hand.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| When a tenancy is billed | Every day the run bills each `ACTIVE`/`NOTICE` tenancy whose billing day of this month has come (`billingDay ≤ today`, Nairobi time) and that has no live `MONTHLY` invoice for the month. Tenancies that haven't started, or end before this month's billing date, are skipped | `≤` rather than `=` means a missed or failed day catches up on the next run. A unique index (one live monthly invoice per tenancy per month) makes a double run harmless |
| Backfill | None. A tenancy that started months ago is billed from the current month | Old arrears belong in phase 4 opening balances, not invented invoices |
| Pro-rating | **Not in this phase.** The billing day defaults to the move-in day, so the first month is a full month | Still an open owner question (§10.5). It can be added as an org setting without changing data |
| Arrears | Never copied into a new invoice. Each invoice stands alone; "Overdue" = balance > 0 and past its due date | Design §5.1 |
| Due date | Issue date + the organisation's `invoiceDueDays` (default 7, 0–60), editable in organisation settings | Simple and visible |
| Fixed charges | A per-property `ChargeType` with an amount, for every unit or for chosen units | Garbage, service charge, security |
| Variable charges | Amount entered per unit per month (`ChargeEntry`), on a grid screen. Units without an entry get no line that month | Legacy "variable" utility bills |
| Metered charges | `Meter` per unit and charge type. Readings per month: `previous` defaults to the last reading (or the meter's initial reading), `current` is entered. Amount = consumption × unit rate, rounded half-up to the cent, in integer arithmetic | Water and power. A missing reading means no line this month; the next reading's consumption covers both months, so nothing is lost |
| Billed inputs | Readings and variable entries used on an invoice are locked (`invoiceId` set). Voiding the invoice unlocks them so the month can be billed again | No silent changes to billed figures |
| Invoice states | `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`, derived from `total`, `amountPaid` (phase 4) and `creditedAmount`. No drafts: the preview screen plays that role | Design §5.1 |
| Changing an invoice | Never edited. **Credit note** (amount ≤ balance, reason) or **void** (only with nothing paid or credited). Both need `invoices:void` | Audit trail |
| Move-in invoice | Each property has `MoveInCharge`s (deposit as N × rent or a fixed amount; other fees; refundable flag). Move-in can issue a `MOVE_IN` invoice in the same step (on by default when the property has any), or later via `POST /tenancies/:id/move-in-invoice`. At most one live move-in invoice per tenancy | Design §5.1. Deposits become `depositHeld` when paid (phase 4) |
| One-off invoices | `ADHOC` invoice with free-text lines on a tenancy (repairs, penalties) | Covers what the run doesn't |
| Numbers | `INV-2026-000123`, `CN-2026-000007`: per organisation, per year, from `OrgCounter` | Readable, gap-free in practice |
| Scheduler | Cloud Scheduler calls `POST /api/v1/internal/jobs/invoice-run` daily at 00:30 Nairobi with a Google OIDC token. The API checks the signature, audience (`JOBS_OIDC_AUDIENCE`) and caller (`JOBS_INVOKER_EMAIL`). Without those env vars the endpoint is off (404). The job runs each non-closed organisation separately, so one failure doesn't stop the rest | Design §4.6 |
| Suspended orgs | Still billed; access rules arrive in phase 8 | Landlords' cash flow first |
| PDF | Server-side with `pdfkit`, A4: organisation, tenant, unit, period, lines, totals, balance, due date | One renderer for web, mobile and SMS links later |
| Meter photos | **Deferred.** Needs object storage (Cloud Storage + signed URLs), which expenses receipts (phase 6) also need; both will be built together | Keeps this phase to billing logic |
| Deleting a tenancy | Now refused once it has any non-void invoice (`409 TENANCY_INVOICED`) | Promised in phase 2 |

## Data model (migration `billing`)

- `Organization.invoiceDueDays Int @default(7)`.
- `ChargeType` — `propertyId`, `name`, `kind FIXED|VARIABLE|METERED`, `amount?` (FIXED), `unitRate?` (METERED, minor units per unit), `unitLabel?` ("m³", "kWh"), `unitIds uuid[]` (empty = all units), `status`. Unique `(propertyId, name)`.
- `MoveInCharge` — `propertyId`, `name`, `kind DEPOSIT|FEE`, `amount?` or `rentMonths?` (exactly one), `refundable`, `status`. Unique `(propertyId, name)`.
- `ChargeEntry` — `chargeTypeId`, `unitId`, `period "YYYY-MM"`, `amount`, `invoiceId?`. Unique `(chargeTypeId, unitId, period)`.
- `Meter` — `unitId`, `chargeTypeId`, `serialNo`, `initialReading Decimal(14,3)`, `status`. Unique `(orgId, serialNo)`, `(unitId, chargeTypeId)`.
- `MeterReading` — `meterId`, `period`, `previous`, `current` (Decimal(14,3), `current ≥ previous`), `note?`, `readById`, `readAt`, `invoiceId?`. Unique `(meterId, period)`.
- `Invoice` — `number`, `tenancyId`, `tenantId`, `unitId`, `propertyId`, `period`, `kind MONTHLY|MOVE_IN|ADHOC`, `issueDate`, `dueDate`, `total`, `amountPaid`, `creditedAmount`, `status`, `voidedAt?`, `voidReason?`, `createdById?` (null = scheduled run). Unique `(orgId, number)`. Partial unique `(tenancyId, period, kind) WHERE kind <> 'ADHOC' AND status <> 'VOID'`.
- `InvoiceLine` — `invoiceId`, `kind RENT|CHARGE|MOVE_IN|ADJUSTMENT`, `description`, `quantity Decimal(14,3)`, `unitAmount`, `amount`, `refundable`, `chargeTypeId?`, `moveInChargeId?`, `meterReadingId?`, `chargeEntryId?`, `position`.
- `CreditNote` — `number`, `invoiceId`, `amount`, `reason`, `createdById`.

All are org-scoped. CHECKs: amounts ≥ 0, `current ≥ previous`, `total = sum of lines` is maintained in code (lines are written once).

## API contract (under `/api/v1`)

Periods are `YYYY-MM`; dates `YYYY-MM-DD`; money integer minor units; quantities and readings are decimal **strings** (`"12.500"`), never floats.

**Shapes**

```jsonc
// ChargeType
{ "id", "property": { "id", "code", "name" }, "name", "kind": "FIXED|VARIABLE|METERED",
  "amount": 30000 | null, "unitRate": 15000 | null, "unitLabel": "m³" | null,
  "unitIds": [], "status", "meterCount", "createdAt", "updatedAt" }
// MoveInCharge
{ "id", "property": {…}, "name", "kind": "DEPOSIT|FEE", "amount": null, "rentMonths": 2,
  "refundable": true, "status" }
// Meter
{ "id", "serialNo", "initialReading": "0.000", "status",
  "unit": { "id", "number" }, "property": {…}, "chargeType": { "id", "name", "unitLabel" },
  "lastReading": { "period", "current" } | null }
// Reading sheet row (GET /meter-readings/sheet)
{ "meter": { "id", "serialNo" }, "unit": { "id", "number" },
  "suggestedPrevious": "120.000",
  "reading": { "id", "previous", "current", "consumption", "amount", "note", "billed", "readAt", "readBy": { "id", "name" } } | null }
// Variable grid row (GET /charge-entries)
{ "unit": { "id", "number" }, "amount": 50000 | null, "billed": false }
// Invoice (list)
{ "id", "number", "kind", "period", "status", "issueDate", "dueDate",
  "total", "amountPaid", "creditedAmount", "balance", "overdue",
  "tenant": { "id", "code", "firstName", "lastName", "phone" },
  "unit": { "id", "number" }, "property": { "id", "code", "name" }, "tenancyId",
  "voidedAt", "voidReason", "createdAt" }
// Invoice (detail) adds
{ "lines": [{ "id", "kind", "description", "quantity": "1.000", "unitAmount", "amount", "refundable" }],
  "creditNotes": [{ "id", "number", "amount", "reason", "createdAt", "createdBy": { "id", "name" } }] }
// Run preview item
{ "tenancyId", "tenant": {…}, "unit": { "id", "number" }, "property": {…},
  "lines": [{ "kind", "description", "quantity", "unitAmount", "amount" }], "total",
  "missingReadings": [{ "meterId", "serialNo", "chargeName" }] }
```

**Endpoints**

| Method & path | Permission | Notes |
|---|---|---|
| `GET /charge-types?propertyId&kind&status` | `charges:view` | `{ data }` (not paged) |
| `POST /charge-types` `{propertyId, name, kind, amount?, unitRate?, unitLabel?, unitIds?}` · `PATCH /:id` (no `propertyId`/`kind`; + `status`) · `DELETE /:id` | `charges:create/update/delete` | FIXED needs `amount`; METERED needs `unitRate`. Delete when billed, or with meters → `409 IN_USE` |
| `GET /move-in-charges?propertyId` · `POST` `{propertyId, name, kind, amount? \| rentMonths?, refundable?}` · `PATCH` · `DELETE` | `charges:*` | Exactly one of `amount`/`rentMonths` |
| `GET /charge-entries?chargeTypeId&period` | `charges:view` | Grid rows for the VARIABLE charge's units |
| `PUT /charge-entries` `{chargeTypeId, period, entries: [{unitId, amount \| null}]}` | `charges:update` | `null` deletes. Billed rows → `409 ALREADY_BILLED` (nothing saved) |
| `GET /meters?propertyId&unitId&chargeTypeId` · `POST` `{unitId, chargeTypeId, serialNo, initialReading?}` · `PATCH` `{serialNo?, status?}` · `DELETE` | `meters:*` | Charge must be METERED and on the unit's property. `409 SERIAL_TAKEN`; delete with readings → `409 IN_USE` |
| `GET /meter-readings/sheet?propertyId&chargeTypeId&period` | `meters:view` | One row per active meter |
| `PUT /meter-readings` `{period, readings: [{meterId, current, previous?, note?}]}` | `meters:create` | Upsert. `current < previous` → `422`; billed → `409 ALREADY_BILLED` |
| `DELETE /meter-readings/:id` | `meters:delete` | Not when billed |
| `GET /invoices?q&status&kind&period&propertyId&tenantId&tenancyId&overdue` | `invoices:view` | Newest first |
| `GET /invoices/:id` · `GET /invoices/:id/pdf` | `invoices:view` | PDF: `application/pdf` |
| `POST /invoices` `{tenancyId, lines: [{description, amount}] (1–20), dueDate?}` | `invoices:create` | `ADHOC`; also allowed on ended tenancies (e.g. damages after move-out) |
| `POST /invoices/:id/void` `{reason}` → invoice (200) | `invoices:void` | `409 INVOICE_SETTLED` if anything paid or credited; unlocks readings/entries |
| `POST /invoices/:id/credit-notes` `{amount, reason}` → invoice (200) | `invoices:void` | `amount ≤ balance` else `422`; on `VOID` → `409` |
| `GET /invoices/run/preview?date` | `invoices:view` | What the run would create for `date` (default today, Nairobi) |
| `POST /invoices/run` `{date?}` → `{ date, period, created, invoiceIds }` (200) | `invoices:create` | Same as the scheduled job, for the active organisation. `date` may not be in the future |
| `POST /tenancies/:id/move-in-invoice` | `invoices:create` | `409 ALREADY_INVOICED`, `422 NO_MOVE_IN_CHARGES` |
| `POST /tenancies` gains `issueMoveInInvoice?: boolean` (default true when the property has active move-in charges) | `tenancies:create` (+`invoices:create` to issue) | Created in the same transaction |
| `GET/PATCH /organization` gains `invoiceDueDays` | as before | |
| `POST /internal/jobs/invoice-run` | Google OIDC (Cloud Scheduler) | Not under `/api/v1`'s user auth; 404 unless configured |

New error codes: `METER_EXISTS` (a unit has one meter per charge), `ALREADY_BILLED`, `ALREADY_INVOICED`, `NO_MOVE_IN_CHARGES`, `INVOICE_SETTLED`, `INVOICE_VOID`, `SERIAL_TAKEN`, `TENANCY_INVOICED`.

## Frontend

1. **Charges** (`/app/charges`): pick a property → tabs: recurring charges (fixed/variable/metered, which units), move-in charges, and "Variable amounts" (month picker + grid of units with amount inputs, save all).
2. **Meter readings** (`/app/meter-readings`): pick property, metered charge and month → sheet of meters with previous (editable), current, consumption and amount computed live; save all. A "Meters" tab to add, edit and remove meters.
3. **Invoices** (`/app/invoices`): list with filters (status, kind, month, property, overdue) and search; detail page with lines, credit notes, balance, "Download PDF", "Credit note", "Void"; "New invoice" (one-off) sheet.
4. **Invoice run** (`/app/invoices/run`): date picker (default today), preview table with totals and missing-reading warnings, "Create N invoices".
5. Move-in sheet: "Issue move-in invoice" checkbox listing the property's move-in charges with computed amounts. Tenancy actions: "Issue move-in invoice" when none exists.
6. Tenant and unit pages: an invoices section. Organisation settings: "Invoice due after N days".

## Tests

- **Unit:** consumption × rate rounding (half-up, integer only), decimal parsing, period/date helpers in Nairobi time, run eligibility (billing day reached, not started, ended before billing date, already billed), status derivation, move-in charge amounts.
- **e2e:** run creates one invoice per eligible tenancy with rent + fixed + variable + metered lines; second run creates nothing; missed day catches up; readings and entries lock and unlock on void; credit notes and void rules; move-in invoice at move-in and later; ad-hoc invoice; PDF returns a PDF; tenancy delete blocked once invoiced; scheduled job auth (missing/invalid token → 401, valid → runs every org); property-limited staff and cross-org isolation on every new endpoint.

## Not in phase 3

Payments and balances (4), meter photos and receipts storage (with phase 6), SMS/email of invoices (7), pro-rating (owner decision), tax/VAT lines (none known yet).

## Done when

All checks pass; locally an organisation sets up a fixed, a variable and a metered charge on a property, enters readings and variable amounts, previews and runs invoices, downloads a PDF, issues a credit note, voids and re-runs an invoice, and every step is in the audit log.

## Outcome (2026-10-27)

- Backend: 93 unit + 61 e2e tests (real Postgres): full run with fixed, variable and metered lines; idempotent re-runs; locks and unlock-on-void; credit notes and void rules; move-in invoices (default, opt-out, permission); one-off invoices; overdue; PDF; scheduled job auth (404 when off, 401/403, runs every org); cross-org and property-limited staff. Frontend: 164 tests. Lint, typecheck, build, OpenAPI export pass.
- Verified in a browser against the real API: run preview (12.4 m³ × KES 150 = KES 1,860.00), "Create 4 invoices", invoice detail, PDF download, credit note, meter sheet at 390px.
- Fixed during the check: meter lines used "→", which the PDF's built-in font can't print; now "to".
- New env: `JOBS_OIDC_AUDIENCE`, `JOBS_INVOKER_EMAIL` (GitHub vars `JOBS_AUDIENCE`, `GCP_SCHEDULER_SA`); Cloud Scheduler setup in `infra/gcp/README.md` §9.
- Deferred as planned: meter photos (with phase 6 storage), pro-rating (owner decision).
