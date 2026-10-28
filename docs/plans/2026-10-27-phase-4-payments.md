# Phase 4 — Manual payments (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.1 (allocation, credit, deposits), §5.2 (channels, manual payments, reversals), §5.5 (schema)
**Depends on:** phase 3 (done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** staff record money received by cash, cheque, bank slip or a manually entered M-Pesa code. Each payment is allocated to the tenant's invoices (oldest due first, or as chosen). Any surplus becomes tenant credit, which is used up automatically by the next invoice. The tenant gets a receipt by SMS and as a PDF. Mistakes are fixed by reversal, never deletion. Deposits are tracked as money actually held and settled at move-out. Every tenant has a running statement.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Payment channels | `PaymentChannel`: `MPESA_PAYBILL`, `MPESA_TILL`, `BANK_ACCOUNT`, `CASH`, `CHEQUE`. Fields: name, shortcode / bank name / account number / account name, `propertyIds` (empty = all). No Daraja credentials yet (phase 5). Needs `channels:manage` | Design §5.2 |
| Allocation | Default: open invoices oldest due date first (then oldest issue). Or explicit `allocations[]` (each ≤ that invoice's balance, total ≤ amount). Anything left is the tenant's **credit** | Design §5.1 |
| Credit | Not a separate balance. It is the unallocated remainder of payments (`Payment.unallocated`), cached as `Tenant.creditBalance`. When a new invoice is issued (run, move-in, one-off), credit is applied to it automatically, oldest payment first, in the same transaction. Staff can also "Apply credit" to existing open invoices | Every shilling stays traceable to the payment it came from |
| `amountPaid` / status | `Invoice.amountPaid` = sum of its allocations. Status is derived (`ISSUED → PARTIALLY_PAID → PAID`). Allocation uses a conditional update, so an invoice can never be over-settled, even racing a credit note | Integrity under concurrency |
| Concurrency | Every money operation for a tenant first locks that tenant's row (`FOR UPDATE`): payments, reversals, credit application, deposit settlement, invoice issue | Serialises per tenant, never globally |
| Reversal | `POST /payments/:id/reverse {reason}` (`payments:refund`) creates a negative payment (`reversesId`) that mirrors every allocation of the original, including credit it later paid towards other invoices. Each payment can be reversed once. Nothing is ever deleted | Design §5.2 |
| Duplicate entries | The same reference on the same channel is refused (`409 DUPLICATE_REFERENCE`): an M-Pesa code or bank slip can't be entered twice | The most common manual mistake |
| Receipt numbers | `RCT-2026-000001`, per organisation and year (reversals get their own number) | Readable |
| `receivedAt` | Date the money was received (`YYYY-MM-DD`, not in the future). Recording time is `createdAt` | Statements use the money date |
| Deposits | Ledger `DepositTransaction` per tenancy: `OPENING` (the move-in opening balance), `RECEIVED` (paid on refundable move-in lines; the deposit lines are paid first), `APPLIED` (used to pay the tenant's invoices: a payment of method `DEPOSIT`), `REFUNDED` (paid back; reference), `REVERSAL`. `Tenancy.depositHeld` = the sum | Design §5.1; auditable, reused by agency accounting (6b) |
| Deposit settlement | `POST /tenancies/:id/deposit/settle {applyAmount?, refundAmount?, refundReference?, note?}` on `NOTICE`/`ENDED` tenancies. Apply needs `payments:create`; refund needs `payments:refund`. Apply + refund ≤ held | Move-out |
| Refunding credit (overpayment) | **Not in this phase**; reverse the payment instead | Rare; needs a payout flow (phase 10) |
| Statement | `GET /tenants/:id/statement?from&to` and `/statement/pdf`: opening balance; invoices (debit), credit notes, payments and deposit applications (credit), reversals (debit), each with a running balance; closing balance; current credit and deposit held. Balance = invoiced − credited − paid (negative = in credit). Void invoices are left out | Replaces the legacy "BF" view (design §5.1) |
| SMS receipt | On a new payment (unless `notifyTenant: false`): "Received KES 25,000.00 ref RCT-2026-000012. Balance KES 1,200.00. Thank you — <Org>". Sent after commit; a failed SMS never fails the payment (it is logged and reported as `receiptSent: false`) | Tenants trust what they can see |

## Data model (migration `payments`)

- `PaymentChannel` — `kind`, `name`, `shortcode?`, `bankName?`, `accountNumber?`, `accountName?`, `propertyIds uuid[]`, `status`. Unique `(orgId, name)`.
- `Payment` — `number`, `tenantId`, `channelId?` (null for `DEPOSIT`), `method ChannelKind|DEPOSIT`, `amount` (negative = reversal), `unallocated`, `reference?`, `paidBy?`, `note?`, `receivedAt date`, `reversesId?` (unique), `reversalReason?`, `tenancyId?` (deposit applications), `recordedById?`. Unique `(orgId, number)`. Partial unique `(channelId, reference) WHERE amount > 0 AND reference IS NOT NULL`.
- `PaymentAllocation` — `paymentId`, `invoiceId`, `amount` (negative on reversals).
- `DepositTransaction` — `tenancyId`, `kind`, `amount` (signed), `paymentId?`, `invoiceId?`, `reference?`, `note?`, `createdById?`.
- CHECKs: `unallocated` between 0 and `amount` for positive payments; `amountPaid` ≥ 0 (existing).

## API contract (under `/api/v1`)

```jsonc
// Channel
{ "id", "kind", "name", "shortcode", "bankName", "accountNumber", "accountName",
  "propertyIds": [], "status", "createdAt", "updatedAt" }
// Payment (list)
{ "id", "number", "method", "amount", "unallocated", "reference", "paidBy", "note",
  "receivedAt": "2026-10-27", "tenant": { "id", "code", "firstName", "lastName", "phone" },
  "channel": { "id", "name", "kind" } | null, "reversesId", "reversedBy": { "id", "number" } | null,
  "reversalReason", "recordedBy": { "id", "name" } | null, "createdAt" }
// Payment (detail) adds
{ "allocations": [{ "invoice": { "id", "number", "period", "kind" }, "amount" }] }
// POST /payments response adds
{ "receiptSent": true }
// Statement
{ "tenant": {…}, "from", "to", "openingBalance", "closingBalance", "creditBalance", "depositHeld",
  "entries": [{ "date", "type": "INVOICE|CREDIT_NOTE|PAYMENT|REVERSAL|DEPOSIT_APPLIED",
                "reference", "description", "debit", "credit", "balance", "invoiceId"?, "paymentId"? }] }
// Deposit
{ "tenancyId", "held", "transactions": [{ "id", "kind", "amount", "reference", "note", "createdAt", "createdBy": {…} | null }] }
```

| Method & path | Permission | Notes |
|---|---|---|
| `GET /payment-channels?status` | `channels:view` | `{ data }`; limited staff see channels for all properties or theirs |
| `POST /payment-channels` · `PATCH /:id` · `DELETE /:id` | `channels:manage` | `409 NAME_TAKEN`; delete when used → `409 IN_USE` |
| `GET /payments?q&tenantId&channelId&method&from&to&reversed` | `payments:view` | Paged, newest first |
| `GET /payments/:id` · `GET /payments/:id/receipt` (PDF) | `payments:view` | |
| `POST /payments` `{tenantId, channelId, amount, receivedAt, reference?, paidBy?, note?, allocations?: [{invoiceId, amount}], notifyTenant?}` | `payments:create` | Amount > 0. `409 DUPLICATE_REFERENCE`, `422` on bad allocations, `409 CHANNEL_INACTIVE` |
| `POST /payments/:id/reverse` `{reason}` → reversal payment (200) | `payments:refund` | `409 ALREADY_REVERSED`; reversals can't be reversed (`409 IS_REVERSAL`) |
| `GET /tenants/:id/open-invoices` | `payments:view` | Invoices with balance > 0, oldest due first (allocation picker) |
| `POST /tenants/:id/apply-credit` → `{ applied, creditBalance }` (200) | `payments:create` | |
| `GET /tenants/:id/statement?from&to` · `GET /tenants/:id/statement/pdf?from&to` | `payments:view` | Default: from the tenant's first activity to today |
| `GET /tenancies/:id/deposit` | `payments:view` | |
| `POST /tenancies/:id/deposit/settle` `{applyAmount?, refundAmount?, refundReference?, note?}` (200) | see above | `422` if more than held; `409 TENANCY_ACTIVE` unless `NOTICE`/`ENDED` |
| Invoice detail gains `payments: [{ id, number, amount, receivedAt, method }]` | `invoices:view` | Allocations to this invoice |
| Tenant gains `creditBalance`, `balance` (owed; negative = credit) | `tenants:view` | |

New error codes: `IDEMPOTENCY_MISMATCH`, `DUPLICATE_REFERENCE`, `CHANNEL_INACTIVE`, `ALREADY_REVERSED`, `IS_REVERSAL`, `TENANCY_ACTIVE`.

## Frontend

1. **Payment channels** (`/app/payment-channels`): list + add/edit sheet (fields by kind), deactivate/delete.
2. **Payments** (`/app/payments`): list (search, channel, method, date range, show reversals); "Record payment" sheet: tenant search → open invoices with suggested oldest-first allocation (editable), amount, date (default today), channel, reference, paid by, "Send SMS receipt"; result shows the receipt number, the allocation and the credit left. Payment detail page: allocations, receipt PDF, "Reverse" (reason, step-free, `payments:refund`).
3. **Tenant page:** balance and credit tiles, "Record payment", "Apply credit", a **Statement** tab (date range, running balance, PDF), payments list.
4. **Invoice detail:** payments allocated; "Record payment" pre-filled with this invoice.
5. **Tenancy:** a **Deposit** panel (held amount + ledger) on the tenant/unit pages; "Settle deposit" dialog on `NOTICE`/`ENDED` tenancies (apply to balance, refund with reference).

## Tests

- **Unit:** oldest-first allocation plan, explicit allocation validation, deposit-received split (refundable lines first), statement running balance, SMS text length.
- **e2e:** pay exact / partial / over (credit) with oldest-first; explicit allocations; credit auto-applied when the next run issues; apply-credit; duplicate reference; reversal mirrors allocations including credit later used, restores statuses and credit; second reversal refused; deposit received via move-in invoice, apply + refund at move-out, limits; statement totals reconcile (closing = invoices − credit notes − payments); receipt PDF; SMS sent with receipt number (log adapter) and `notifyTenant: false`; void blocked once paid; concurrent payments for one tenant never over-allocate; property-limited staff and cross-org isolation on every new endpoint.

## Not in phase 4

M-Pesa STK/C2B and auto-matching (5), refunding overpaid credit as cash out (10), payment reminders (7), landlord ledger entries (6b: hook into allocation then).

## Done when

All checks pass; locally a tenant with two open invoices pays part, then more than the rest (credit), the next run uses the credit, a payment is reversed and the invoices reopen, a deposit is paid and partly refunded at move-out, the statement and receipt PDFs are correct, and all of it is in the audit log.

## Outcome (2026-10-27)

- Backend: 98 unit + 70 e2e tests (real Postgres): oldest-first and explicit allocation, credit and its automatic use by the next invoice, apply-credit, duplicate references, inactive channels, reversals mirroring credit used later, deposits received / applied / refunded / reversed, statement reconciling with the balance, receipt and statement PDFs, five concurrent payments for one tenant, `Idempotency-Key` replay (two identical retries → one payment, one SMS), cross-org isolation. Frontend: 203 tests. Lint, typecheck, build, OpenAPI pass.
- Added after the screens were built: `POST /payments` honours an `Idempotency-Key` header (same key + same details → the original payment with `replayed: true`; different details → `409 IDEMPOTENCY_MISMATCH`); `GET /payments?reversed=true` lists only reversals and reversed payments.
- Verified in a browser against the real API: record KES 30,000 against a KES 28,710.50 invoice → paid + KES 1,289.50 credit, SMS receipt sent, receipt PDF, tenant statement with running balance.
