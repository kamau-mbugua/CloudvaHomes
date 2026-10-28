# Phase 6 — Expenses & reports (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.5 (Expense, RecurringExpense), §4.6 (Cloud Storage), §8 (private files)
**Depends on:** phase 4 (done; phase 5 also done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** organisations record what their properties cost, one-off or recurring, with the receipt attached. They see how they're doing: a dashboard, profit and loss per property, arrears by age, and occupancy, each downloadable as CSV. This phase also adds private file storage, used for expense receipts and the meter photos deferred from phase 3.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| File storage | `ObjectStorage` port. `local` driver (files under `STORAGE_DIR`, dev/test) and `gcs` driver (private Cloud Storage bucket `STORAGE_BUCKET`, uses the Cloud Run service account; no keys). Files are **uploaded through the API** (multipart, ≤ 10 MB) and **downloaded through the API** after a permission check. There are no public or signed URLs | Files are private and permission-checked like every record. Receipts are small, and it is one code path for both drivers |
| What may be uploaded | JPEG, PNG, WebP, PDF only, checked by the file's first bytes (not the name or the browser's claim). Stored under `org/<orgId>/<purpose>/<uuid>`. An `Upload` row records the type, size, SHA-256, uploader and purpose (`EXPENSE_RECEIPT`, `METER_PHOTO`) | Don't store executables; tidy per-org layout for retention/erasure later |
| Attaching | Upload first (`POST /uploads` → `{ id }`), then pass `receiptUploadId` / `photoUploadId` when saving the expense or reading. An upload attaches once, only to a record of its purpose and organisation. Unattached uploads older than a day are deleted by a job | Simple forms; no orphans |
| Expense categories | Fixed list: `REPAIRS`, `UTILITIES`, `SECURITY`, `CLEANING`, `SALARIES`, `TAXES`, `INSURANCE`, `MANAGEMENT`, `OTHER` | P&L groups need stable keys; editable lists can come later |
| Changing expenses | Editable (audited before/after) until voided. **Void** (reason) instead of delete. Voided expenses are left out of reports | Same principle as invoices, lighter (an expense has no counterparty ledger yet) |
| Recurring expenses | `RecurringExpense`: amount, category, every N months (1–12), day of month (1–28), start date, optional end date. A daily job creates the expenses due (`nextDue ≤ today`), catching up missed days. Idempotent: unique (recurring id, date) | Same pattern as the invoice run |
| Money basis in reports | **Collected** = payments by the date received (cash basis, reversals subtract on their date), attributed to a property through their invoice allocations. Credit not yet allocated isn't attributed to a property. **Invoiced** = non-void invoices by issue date. **Expenses** = non-void by date incurred. Net = collected − expenses | Landlords think in cash; agencies (6b) also need cash basis for commission |
| Arrears ageing | As of today: each open invoice's balance in a bucket by days past due (not yet due, 1–30, 31–60, 61–90, 90+), per tenant and in total, with the tenant's credit beside it | The legacy "BF" view, done right (design §5.1) |
| Occupancy | Per property: units, occupied, on notice, vacant, unavailable, rate = (occupied + notice) / (units − unavailable). Vacant units with "vacant since" (last move-out, else when created) | |
| Dashboard | One call for the month: invoiced, collected, collection rate (collected on this month's invoices ÷ invoiced), arrears overdue, occupancy, expenses, net, unmatched M-Pesa count, top 5 overdue tenants, 12-month trend (invoiced / collected / expenses) | One screen for the owner |
| Exports | `?format=csv` on each report and on the expenses list (UTF-8 with BOM for Excel, amounts in shillings with 2 decimals) | Accountants live in Excel |
| Scope | Everything respects property-limited staff | Phase 2 rule |

## Data model (migration `expenses`)

- `Upload` — `orgId`, `purpose`, `key`, `contentType`, `size`, `sha256`, `uploadedById`, `attachedAt?`.
- `RecurringExpense` — `propertyId`, `category`, `name`, `payee?`, `amount`, `everyMonths`, `dayOfMonth`, `nextDue date`, `endDate?`, `status`.
- `Expense` — `propertyId`, `recurringExpenseId?`, `category`, `name`, `payee?`, `reference?`, `amount`, `incurredOn date`, `receiptUploadId?`, `voidedAt?`, `voidReason?`, `createdById?`. Unique `(recurringExpenseId, incurredOn)`.
- `MeterReading.photoUploadId?`.

## API contract (under `/api/v1`)

```jsonc
// Upload
{ "id", "purpose", "contentType", "size", "createdAt" }
// Expense
{ "id", "property": { "id", "code", "name" }, "category", "name", "payee", "reference", "amount",
  "incurredOn", "receipt": { "id", "contentType", "size" } | null, "recurringExpenseId",
  "voidedAt", "voidReason", "createdBy": { "id", "name" } | null, "createdAt", "updatedAt" }
// RecurringExpense
{ "id", "property": {…}, "category", "name", "payee", "amount", "everyMonths", "dayOfMonth",
  "nextDue", "endDate", "status", "createdAt" }
```

| Method & path | Permission | Notes |
|---|---|---|
| `POST /uploads` (multipart: `file`, `purpose`) → Upload (201) | `expenses:create` or `expenses:update` for receipts; `meters:create` for photos | `413 PAYLOAD_TOO_LARGE` over 10 MB; `415 UNSUPPORTED_FILE` |
| `GET /uploads/:id/content` | the record's view permission (or the uploader before it is attached) | Streams the file, `Content-Disposition: inline`, `Cache-Control: private, no-store` |
| `GET /expenses?q&propertyId&category&from&to&voided&format` | `expenses:view` | Paged; `meta.totalAmount` = sum of the filtered non-void amounts |
| `POST /expenses` `{propertyId, category, name, amount, incurredOn, payee?, reference?, receiptUploadId?}` | `expenses:create` | `incurredOn` not in the future |
| `GET /expenses/:id` · `PATCH` (same fields) · `POST /expenses/:id/void` `{reason}` (200) | view · update · delete | `409 EXPENSE_VOID` when editing a voided one |
| `GET /expenses/:id/receipt` | `expenses:view` | Shortcut for the receipt's content |
| `GET /recurring-expenses?propertyId&status` · `POST` · `PATCH /:id` · `DELETE /:id` | `expenses:*` | Delete only if it never generated anything; else set `INACTIVE` |
| `POST /recurring-expenses/run` → `{ created }` (200) | `expenses:create` | Generate what's due now for the active organisation |
| `PUT /meter-readings` rows gain `photoUploadId?`; sheet rows gain `reading.photo: { id } \| null` | `meters:create` | `GET /meter-readings/:id/photo` with `meters:view` |
| `GET /reports/dashboard?period` | `reports:view` | |
| `GET /reports/property-pnl?from&to&propertyId&format` | `reports:view` | `from`/`to` are months `YYYY-MM` |
| `GET /reports/arrears?propertyId&format` | `reports:view` | |
| `GET /reports/occupancy?propertyId&format` | `reports:view` | |
| `POST /internal/jobs/recurring-expenses` · `POST /internal/jobs/upload-cleanup` | scheduler OIDC | Daily |

Report shapes:

```jsonc
// dashboard
{ "period", "invoiced", "collected", "collectionRate": 0.82 | null, "arrears", "expenses", "net",
  "occupancy": { "units", "occupied", "notice", "vacant", "unavailable", "rate" },
  "unmatchedMpesa", "topOverdue": [{ "tenant": {…}, "overdue", "oldestDueDate" }],
  "trend": [{ "period", "invoiced", "collected", "expenses" }] }       // 12 months, oldest first
// property-pnl
{ "from", "to", "rows": [{ "property": {…}, "invoiced": { "rent", "charges", "moveIn", "other", "total" },
  "collected", "expenses": { "<CATEGORY>": n, "total" }, "net" }], "totals": { same fields } }
// arrears
{ "asOf", "rows": [{ "tenant": {…}, "units": ["A4 · Kilimani Court"], "current", "d1_30", "d31_60",
  "d61_90", "d90plus", "total", "credit" }], "totals": {…} }
// occupancy
{ "rows": [{ "property": {…}, "units", "occupied", "notice", "vacant", "unavailable", "rate",
  "vacantUnits": [{ "id", "number", "vacantSince" }] }], "totals": {…} }
```

`rate` and `collectionRate` are numbers 0–1 (or null with nothing to divide by). Everything else is integer cents.

New error codes: `UNSUPPORTED_FILE` (415), `PAYLOAD_TOO_LARGE` (413, from the upload limit), `UPLOAD_INVALID` (wrong purpose, other org, already attached), `EXPENSE_VOID`.

New env: `STORAGE_DRIVER` (`local`|`gcs`; default `local` outside production, `gcs` required in production), `STORAGE_DIR` (default `.storage`), `STORAGE_BUCKET` (required for `gcs`).

## Frontend

1. **Dashboard** (`/app`): month picker; tiles (invoiced, collected + collection rate, arrears, expenses, net, occupancy, unmatched M-Pesa with link); 12-month bars (invoiced / collected / expenses) in plain SVG with an accessible table fallback; top overdue tenants. Shown to `reports:view`; others keep a simple welcome.
2. **Expenses** (`/app/expenses`): tabs Expenses / Recurring. List with filters, total of the filtered rows, CSV download. Add/edit sheet with receipt upload (drag-drop or pick, preview for images, PDF icon), void with reason. Recurring list + sheet; "Generate due now".
3. **Reports** (`/app/reports`): tabs P&L (month range, property), Arrears (property), Occupancy, each a table with totals and "Download CSV".
4. **Meter readings:** a camera/photo button per row (opens the phone camera on mobile via `capture`), thumbnail once attached, view full size.

## Tests

- **Unit:** file-type sniffing, recurring schedule (catch-up, day caps, end date), ageing buckets, P&L attribution with reversals, CSV escaping and money formatting.
- **e2e:** upload → attach → download (permission-checked; other org 404; wrong purpose / double attach refused; bad file 415; >10 MB 413); expense CRUD + void + filters + totals + CSV; recurring generation idempotent with catch-up; meter photo on a reading; dashboard, P&L, arrears and occupancy figures checked against a hand-built scenario; property-limited staff; cross-org.

## Not in phase 6

Landlord-deductible expenses and owner statements (6b), budgets, custom expense categories, scheduled e-mailed reports, PDF reports (CSV first).

## Done when

All checks pass; locally an expense with a photographed receipt and a monthly recurring expense are recorded; the dashboard, P&L, arrears and occupancy match the data; CSVs open in Excel; a meter reading has a photo.

## Outcome (2026-10-27)

- Backend: 118 unit + 82 e2e tests (real Postgres): uploads type-sniffed (a renamed executable is 415), 10 MB limit (413), attached once, other orgs and roles without the permission get 404, clean-up of stale uploads; expense CRUD, void, filters, totals, CSV with formula neutralising; recurring catch-up and idempotent re-runs; meter photos; dashboard, P&L, arrears and occupancy checked against a hand-built month (incl. a reversal and an unavailable unit); property-limited staff; cross-org. Frontend: 306 tests.
- Verified in a browser on the dev data: an expense with an uploaded receipt photo; a monthly recurring expense catching up September and October; dashboard figures (invoiced KES 92,360.50, collected KES 62,010.50 = 67.1 %, expenses KES 34,500) matching the database; the P&L CSV.
- Deployment: private bucket `<project>-hodi-files` and two daily scheduler jobs (`infra/gcp/README.md` §11); `STORAGE_DRIVER=gcs` in production.
- Oversized uploads answer `413 PAYLOAD_TOO_LARGE` (the plan said `FILE_TOO_LARGE`).
