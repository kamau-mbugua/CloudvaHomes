# Phase 6b — Agency accounting (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.3 (agencies, landlords, remittances), §5.5 (schema), §8 (payout details)
**Depends on:** phases 4 and 6 (done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** an agency always knows what it owes each landlord, and why. Every shilling collected on a landlord's property, every commission, deductible expense and deposit, and every payout lands in that landlord's ledger as it happens. Monthly owner statements come out of it. Payouts are drafted, approved by a second person and marked paid. Landlords sign in to a read-only owner portal to see their own figures.

## Defaults (owner question §10.7, answered by default, changeable per agreement)

Commission is charged on **rent only**. Deposits are **held by the agency**, not passed to the landlord. Expenses the agency pays on a property **are deducted** from the landlord's payout.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Management agreement | Per landlord, optionally narrowed to some of their properties: commission basis (`PERCENT_OF_COLLECTED` default, `PERCENT_OF_INVOICED`, `FIXED_MONTHLY`), rate in basis points or fixed amount, commissionable line kinds (default `[RENT]`), who collects (`AGENCY_COLLECTS` default / `LANDLORD_COLLECTS`), remittance day (1–28), deduct expenses (yes), hold deposits (yes), start and end date. Agreements for the same landlord and property can't overlap. A change of terms = end the old agreement, start a new one, so past statements never change | Design §5.3 |
| Which agreement applies | The one covering the property on the date of the event (payment received, invoice issued, expense incurred). No agreement → money still lands in the ledger, with no commission (and a warning in the UI) | A landlord's money is never untracked |
| Splitting a payment across invoice lines | An invoice is paid in line order, with refundable lines (deposits) first, then by position (rent is first). The part of each allocation landing on commissionable lines is commissionable; deposit lines go to the deposit bucket (or to the payable bucket if the agreement doesn't hold deposits); the rest passes through | The same rule the deposit tracking (phase 4) already uses; deterministic and reversible |
| Ledger entries | Append-only `LandlordLedgerEntry` (`bucket PAYABLE|DEPOSIT_HELD`, `kind COLLECTION|COMMISSION|EXPENSE|DEPOSIT|REMITTANCE|ADJUSTMENT`, signed amount; + = owed to the landlord). Written in the same transaction as the event, through hooks (`LedgerService.onAllocated`, `onDepositMoved`; `InvoiceIssuer.onIssued` for `PERCENT_OF_INVOICED`; `ExpensesService.onChanged`). A reversal produces the mirror entries automatically, because it is a negative allocation | Design §5.3: auditable, never recomputed |
| Landlord collects | Collections are **not** owed by the agency (the landlord already has the money), so they're recorded as information only; commission is a debit, so the balance goes negative = the landlord owes the agency. The remittance then runs the other way ("due from landlord") | Design §5.3 |
| Fixed monthly commission | Booked once per agreement per month when that month's remittance is drafted | Simple and visible |
| Remittances | Draft per landlord per month (manual, or the nightly job on the agreement's remittance day): net = PAYABLE balance at the draft time, with the breakdown (collections, commission, expenses, adjustments) since the previous remittance. `DRAFT → APPROVED → PAID`, or `CANCELLED`. **Approve** needs `remittances:approve` and must be a different person from the one who drafted it. **Mark paid** needs `remittances:pay` + method + reference; it writes the REMITTANCE ledger entry. One live remittance per landlord per month | Maker-checker, design §5.3 |
| Payout details | Bank (bank, branch, account name, number) or M-Pesa (phone) or cheque (payee name). Encrypted with `FieldCipher`; shown masked (`•••• 6789`). Changing them needs `landlords:update` + **step-up**, and the landlord is told by SMS/e-mail at the old and new contact. Remittances copy the details used when paid (masked) | Design §5.3: quietly changed payout details are a known fraud route |
| Adjustments | `POST /landlords/:id/ledger/adjustments {bucket, amount, memo}` (opening balances, corrections) needs `remittances:approve` + step-up | Money out of thin air must be rare and visible |
| Owner statement | Per landlord for a month or range: opening balance; collections per property and unit (with the tenant), commission, expenses, adjustments, remittances; closing balance; deposits held; occupancy and arrears of their units. JSON + PDF | Design §5.3 |
| Owner portal | A landlord gets portal access from their page ("Give portal access"): Hodi creates/links a user with the landlord's phone/e-mail (no membership, no password) and sends an SMS/e-mail; they sign in with a one-time code. The session lists `ownerOf: [{ landlordId, name, organization }]`. `/api/v1/owner/*` endpoints check `Landlord.userId = me` and run as that organisation limited to that landlord's properties | Read-only, reuses OTP sign-in from phase 1 |
| Landlord organisations | Everything here is agency-only (`403 AGENCY_ONLY`, as in phase 2) | Design §5.3 |

## Data model (migration `agency`)

- `ManagementAgreement` — fields above; `status` derived from dates.
- `LandlordLedgerEntry` — `landlordId`, `propertyId?`, `bucket`, `kind`, `amount`, `agreementId?`, `paymentId?`, `allocationId?`, `invoiceId?`, `expenseId?`, `remittanceId?`, `tenancyId?`, `occurredAt` (event date), `memo?`, `createdById?`, `createdAt`.
- `Remittance` — `number REM-2026-000001`, `landlordId`, `period`, `direction TO_LANDLORD|FROM_LANDLORD`, `collections`, `commission`, `expenses`, `adjustments`, `net`, `cutoff`, `status`, `draftedById?`, `approvedById?`, `approvedAt?`, `paidById?`, `paidAt?`, `method?`, `reference?`, `payoutMasked?`, `cancelledReason?`. Partial unique `(landlordId, period) WHERE status <> 'CANCELLED'`.
- `Landlord` gains `payoutMethod?`, `payoutEnc?`, `payoutHint?`, `portalInvitedAt?` (`userId` exists).

## API contract (under `/api/v1`, agency organisations only)

```jsonc
// Agreement
{ "id", "landlord": { "id", "code", "name" }, "propertyIds": [], "commissionBasis", "commissionBps", "fixedAmount",
  "commissionableLines": ["RENT"], "collection", "remittanceDay", "deductExpenses", "holdDeposits",
  "startDate", "endDate", "active": true, "createdAt" }
// Ledger entry
{ "id", "bucket", "kind", "amount", "occurredAt", "memo", "property": { "id", "code", "name" } | null,
  "unit": { "id", "number" } | null, "tenant": { "id", "code", "firstName", "lastName" } | null,
  "payment": { "id", "number" } | null, "invoice": { "id", "number" } | null, "expense": { "id", "name" } | null,
  "remittance": { "id", "number" } | null, "createdAt" }
// Landlord account (GET /landlords/:id/account — not added to GET /landlords/:id)
"balances": { "payable": n, "depositHeld": n }, "payout": { "method", "masked", "updatedAt" } | null,
"portal": { "hasAccess": true, "invitedAt" }
// Remittance
{ "id", "number", "landlord": {…}, "period", "direction", "collections", "commission", "expenses",
  "adjustments", "net", "status", "draftedBy", "approvedBy", "approvedAt", "paidBy", "paidAt", "method",
  "reference", "payoutMasked", "cancelledReason", "createdAt" }
```

| Method & path | Permission | Notes |
|---|---|---|
| `GET /agreements?landlordId&active` · `POST` · `PATCH /:id` (only `endDate`, and all fields while it has no ledger entries) · `DELETE /:id` (no entries) | `agreements:view/create/update/delete` | `409 AGREEMENT_OVERLAP`; `409 AGREEMENT_IN_USE` |
| `GET /landlords/:id/ledger?bucket&from&to` | `landlords:view` | Paged, newest first, with running balance per bucket |
| `POST /landlords/:id/ledger/adjustments` `{bucket, amount (signed), memo}` | `remittances:approve` + step-up | |
| `PUT /landlords/:id/payout` `{method, bankName?, branch?, accountName?, accountNumber?, phone?, payeeName?}` · `DELETE` | `landlords:update` + step-up | Notifies the landlord |
| `GET /landlords/:id/statement?from&to` (months) · `/statement/pdf` | `landlords:view` | |
| `POST /landlords/:id/portal-access` → landlord (200) · `DELETE` | `landlords:update` | Links (or creates) the user with the landlord's phone/e-mail; staff users may also be landlords. `409 NO_CONTACT` without either |
| `GET /remittances?landlordId&status&period` · `GET /:id` | `remittances:view` | |
| `POST /remittances` `{landlordId, period}` (draft) | `remittances:create` | `409 REMITTANCE_EXISTS` |
| `POST /remittances/:id/approve` · `/pay` `{method, reference, paidAt?}` · `/cancel` `{reason}` (200) | approve · pay · create | `409 SAME_PERSON` (drafter can't approve), `409 REMITTANCE_STATE` |
| `GET /owner/landlords` · `GET /owner/landlords/:id` (balances, properties with occupancy & arrears) · `/statement?from&to` · `/statement/pdf` · `/remittances` | signed-in user linked to the landlord | `404` otherwise |
| `POST /internal/jobs/remittance-drafts` | scheduler OIDC | Daily |
| Session (`/me`, login, refresh) gains `ownerOf: [{ landlordId, name, organization: { id, name } }]` | | |

New error codes: `AGREEMENT_OVERLAP`, `AGREEMENT_IN_USE`, `REMITTANCE_EXISTS`, `REMITTANCE_STATE`, `SAME_PERSON`, `NO_CONTACT`.

## Frontend

1. **Agreements** (`/app/agreements`): list (landlord, basis and rate, collection, remittance day, dates, active), add sheet, "End agreement" (sets end date), delete when unused. A landlord without an active agreement shows a warning on the landlord page.
2. **Landlord page** additions: balance tiles (payable / held deposits), ledger tab (filters, running balance), statement tab (month range, PDF), payout details card (masked; change with step-up), portal access ("Give portal access" / "Remove"), adjustment dialog (approvers).
3. **Owner statements** (`/app/owner-statements`): pick landlord + month range → statement view + PDF.
4. **Remittances** (`/app/remittances`): list by status, "Draft remittances" (landlord + month), detail with breakdown, Approve (hidden for the drafter), Mark paid (method, reference, date; shows the masked payout details), Cancel.
5. **Owner portal** (`/owner`): its own minimal shell. Landlord switcher if `ownerOf` has several. Overview (balances, properties with occupancy and arrears), statements (month range + PDF), payouts list. After sign-in, a user with no organisation but with `ownerOf` lands here, and staff who are also landlords get a link in the account menu.

## Tests

- **Unit:** line waterfall (deposit first, rent next, partial, reversal), commission rounding, agreement overlap, statement assembly, remittance net/direction.
- **e2e:** agency + landlord + agreement (10%): rent payment → COLLECTION + COMMISSION; deposit → DEPOSIT_HELD; charges pass through; reversal mirrors; deductible expense and its void; `PERCENT_OF_INVOICED` at issue; `LANDLORD_COLLECTS` → negative balance; fixed monthly at draft; remittance draft/approve (same person refused)/pay → ledger zero; adjustments need step-up; payout details encrypted, masked, step-up, landlord notified; owner portal sees only their landlord, other landlords 404; landlord orgs 403; cross-org.

## Not in phase 6b

Automated payouts (B2C / bank transfer, phase 10), landlord invoices as documents for `LANDLORD_COLLECTS` (statement shows the amount due), multiple landlords per property (co-ownership), VAT on commission (needs a tax decision).

## Done when

All checks pass. Locally, an agency sets a 10% agreement and collects rent; the landlord's ledger shows the collection and the commission. A remittance is drafted, approved by a second user and paid. The owner statement PDF reconciles. The landlord signs in with a code and sees only their own figures.

## Outcome (2026-10-27)

- Backend: 124 unit + 90 e2e tests (real Postgres): 10% commission on rent only with charges passing through and reversals mirroring; deposits held then applied at move-out; deductible expenses (create, edit, void); invoiced-basis commission at issue and back on void; landlord-collects netting; fixed monthly fee at draft; agreement overlap / in-use rules; remittance draft → approval by a second person (drafter refused) → paid, balance to zero; payout details encrypted, masked, step-up, landlord told; adjustments need step-up; owner portal via one-time code, own landlord only, no staff access; property-limited staff; cross-org. Frontend: 379 tests.
- Verified in a browser on the dev data: a 10% agreement; a KES 21,050 payment → KES 20,000 rent (KES 2,000 commission) + KES 1,050 charges → KES 19,050 owed; draft REM-2026-000001 with Approve hidden from its drafter; the landlord signing in with a code at 390px and seeing only their own figures.
- Fixed during the check (frontend): the agreements list (landlord page) and the recurring-expenses list (phase 6) sent `pageSize` to unpaged endpoints and were refused with 422.
- Contract change: landlord balances, payout and portal status come from `GET /landlords/:id/account`.
- Ledgers start when this phase is deployed: money moved before then (or before an agreement existed) isn't in them — post opening balances as adjustments when migrating an agency.
- New scheduler job `remittance-drafts` (daily), in `infra/gcp/README.md` §11.
