# Phase 5 — M-Pesa (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.2 (payments and integrations), §8 (secrets at rest)
**Depends on:** phase 4 (done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** M-Pesa money arrives without anyone typing it in. Paybill and till payments (C2B) and payment prompts sent to a tenant's phone (STK push) land as raw inbound transactions. Each is matched automatically to a tenant and recorded as a payment, with the receipt SMS. Anything that can't be matched waits on a reconciliation screen. Every organisation uses its own Daraja app, so money goes straight to the landlord or agency, never through Hodi.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Credentials | Per M-Pesa channel: environment (`sandbox`/`production`), consumer key, consumer secret, passkey (STK). Encrypted with `FieldCipher` (bound to org + channel), never returned or logged. Setting them needs `channels:manage` **and step-up** | Design §5.2/§8. Changing payout or collection details is a fraud vector |
| Daraja client | `DarajaClient` interface. `HttpDarajaClient` calls Safaricom (OAuth token cached per channel). `SimulatedDarajaClient` (`DARAJA_MODE=simulated`, the default outside production) answers like Daraja and, a few seconds after an STK push, delivers a success callback to itself, so the whole flow works locally without keys. Tests swap the provider | Build and demo before Safaricom keys exist |
| Webhook URLs | `{PUBLIC_API_URL}/api/v1/hooks/pay/{callbackToken}/stk`, `…/c2b/validate`, `…/c2b/confirm`. The token is 32 random bytes per channel (unguessable, rotatable). The path avoids the words Daraja rejects in C2B URLs ("mpesa", "safaricom") | Design §5.2: Daraja doesn't sign callbacks |
| Webhook trust | (1) the channel token, (2) the caller's IP must be on Safaricom's list (`MPESA_CALLBACK_IPS`; default = Safaricom's published callback IPs; **confirm against current Daraja docs at go-live**), (3) STK successes are **re-queried** (STK Query) before any money is recorded. Each transaction is stored once (unique per channel + M-Pesa receipt), so retries are harmless | Design §5.2 |
| C2B re-query | **Deviation:** C2B confirmations are trusted on token + IP allow-list + shortcode match. They are **not** re-queried, because Transaction Status needs an initiator and a certificate-encrypted security credential. That can be added per channel later. Security should review | Honest about what is verified |
| Inbound first, payment second | Every callback is stored as an immutable `InboundTransaction` (raw payload kept, visible only with `reconciliation:view`) *before* matching. Matching failures never lose money | Design §5.2 |
| Matching order | STK: the request it answers (tenant known). C2B account reference (upper-cased, spaces removed): tenant code `T00042` → invoice number `INV-2026-000123` → unit `KLC-A4` / `KLCA4` (property code + unit number → current tenant). Then the payer's phone, only if exactly one tenant has it. Otherwise `UNMATCHED` | Design §5.2. Safaricom may mask the payer's phone on C2B, so the account reference matters most |
| Manual entry first | If staff already recorded the same receipt on that channel by hand, the inbound transaction is linked to that payment (`MATCHED`, no new payment) | Phase 4 duplicate-reference rule |
| Payment created | Method from the channel, reference = M-Pesa receipt, received at the M-Pesa time (Nairobi date), recorded by "M-Pesa (automatic)", allocated oldest first (STK: the requested invoices first), SMS receipt sent | Same ledger as phase 4 |
| STK push | Staff start it from a tenant or invoice ("Request M-Pesa payment": phone defaults to the tenant's, amount to the balance). `Idempotency-Key` honoured. The client polls the request's state. A sweep job re-queries pending requests after 90 s and marks them `TIMEOUT` after 10 min. Tenant self-service "Pay" arrives with the tenant portal (phase 7) on the same endpoint | Design §5.2 |
| C2B registration | `POST /payment-channels/:id/daraja/register-c2b` registers the confirm and validate URLs with Daraja (`ResponseType: Completed`). Validation always accepts: refusing would bounce a tenant's money | Landlords' cash flow first |
| Reconciliation | Unmatched list → assign to a tenant (optionally choosing invoices) → payment; or ignore with a reason (e.g. not rent); ignore can be undone. Needs `reconciliation:view` / `reconciliation:update` | Design §5.2 |
| Org suspended | Callbacks are still processed | Design §5.4 |

## Data model (migration `mpesa`)

- `PaymentChannel` gains `darajaEnv` (`SANDBOX|PRODUCTION`)?, `secretsEnc Bytes?`, `callbackToken String? @unique`, `c2bRegisteredAt DateTime?`.
- `StkRequest` — `channelId`, `tenantId`, `invoiceIds uuid[]`, `phone`, `amount`, `accountRef`, `merchantRequestId?`, `checkoutRequestId? @unique`, `state PENDING|SUCCESS|FAILED|CANCELLED|TIMEOUT`, `resultCode?`, `resultDesc?`, `mpesaReceipt?`, `inboundId?`, `paymentId?`, `idempotencyKey?` (unique per org), `requestedById?`, `completedAt?`.
- `InboundTransaction` — `channelId`, `source MPESA_STK|MPESA_C2B`, `providerRef` (M-Pesa receipt), `amount`, `payerName?`, `payerPhone?`, `accountRef?`, `occurredAt`, `raw Json`, `matchStatus UNMATCHED|MATCHED|IGNORED`, `matchedBy AUTO_STK|AUTO_ACCOUNT|AUTO_PHONE|MANUAL|EXISTING?`, `tenantId?`, `paymentId?`, `ignoredReason?`, `resolvedById?`, `resolvedAt?`. Unique `(channelId, providerRef)`.
- `Payment` gains `inboundId?` (unique).

## API contract (under `/api/v1`)

```jsonc
// Channel gains
"daraja": { "configured": true, "environment": "SANDBOX", "callbackUrls": { "stk", "c2bConfirm", "c2bValidate" },
            "c2bRegisteredAt": null } | null      // null for non-M-Pesa channels
// StkRequest
{ "id", "state", "phone", "amount", "accountRef", "resultDesc", "mpesaReceipt",
  "tenant": { "id", "code", "firstName", "lastName" }, "channel": { "id", "name" },
  "paymentId", "createdAt", "completedAt" }
// InboundTransaction (list)
{ "id", "source", "providerRef", "amount", "payerName", "payerPhone", "accountRef", "occurredAt",
  "matchStatus", "matchedBy", "channel": { "id", "name", "kind" },
  "tenant": { "id", "code", "firstName", "lastName" } | null, "payment": { "id", "number" } | null,
  "ignoredReason", "resolvedBy": { "id", "name" } | null, "resolvedAt", "createdAt" }
// detail adds "raw": { … } and "suggestions": [{ "tenant": {…}, "reason": "Phone matches" }]
```

| Method & path | Permission | Notes |
|---|---|---|
| `PUT /payment-channels/:id/daraja` `{environment, consumerKey, consumerSecret, passkey?}` | `channels:manage` + step-up | M-Pesa channels only (`422`). Generates the callback token on first save |
| `DELETE /payment-channels/:id/daraja` | `channels:manage` + step-up | Removes credentials |
| `POST /payment-channels/:id/daraja/rotate-token` | `channels:manage` + step-up | New callback URLs (re-register C2B after) |
| `POST /payment-channels/:id/daraja/register-c2b` → channel (200) | `channels:manage` | `409 DARAJA_NOT_CONFIGURED`, `502 DARAJA_ERROR` with Safaricom's message |
| `POST /stk-requests` `{tenantId, channelId, amount, phone?, invoiceIds?}` + `Idempotency-Key` → StkRequest (202) | `payments:create` | Channel must be configured: `MPESA_PAYBILL`/`MPESA_TILL` with a passkey. `502 DARAJA_ERROR` if Safaricom refuses |
| `GET /stk-requests/:id` | `payments:view` | Poll |
| `GET /stk-requests?tenantId&state` | `payments:view` | Recent requests |
| `GET /inbound-transactions?status&channelId&source&q&from&to` | `reconciliation:view` | Paged, newest first |
| `GET /inbound-transactions/:id` | `reconciliation:view` | With `raw` and match suggestions |
| `POST /inbound-transactions/:id/assign` `{tenantId, allocations?}` → inbound (200) | `reconciliation:update` | Creates the payment; `409 ALREADY_RESOLVED` |
| `POST /inbound-transactions/:id/ignore` `{reason}` · `POST …/unignore` (200) | `reconciliation:update` | |
| `POST /hooks/pay/:token/stk` · `/c2b/validate` · `/c2b/confirm` | public: token + IP allow-list | Always `200 {ResultCode: 0, ResultDesc: "Accepted"}` for a known token; unknown token or IP → 404/403, no body details |
| `POST /internal/jobs/stk-sweep` | scheduler OIDC | Every minute |

New error codes: `DARAJA_NOT_CONFIGURED`, `DARAJA_ERROR`, `NOT_MPESA_CHANNEL`, `ALREADY_RESOLVED`.

New env: `DARAJA_MODE` (`live`|`simulated`; default `simulated` outside production, required `live` in production), `PUBLIC_API_URL` (base for callback URLs; default `APP_URL`), `MPESA_CALLBACK_IPS` (comma-separated; default Safaricom's list).

## Frontend

1. **Payment channels:** for M-Pesa channels, a "Daraja" section: status (configured / environment / C2B registered), "Set up" sheet (environment, consumer key, secret, passkey; step-up handled by the existing dialog), callback URLs with copy buttons, "Register paybill URLs", "Rotate URLs", "Remove".
2. **Request M-Pesa payment** dialog (tenant page, invoice detail): channel (configured M-Pesa only), phone (tenant's), amount (balance), then live status by polling (`PENDING` → "Check your phone…" → paid with receipt link / failed with reason / timed out).
3. **Reconciliation** (`/app/reconciliation`): list with tabs Unmatched / Matched / Ignored, filters (channel, source, date, search); detail drawer with payer, account reference, amount, time, suggestions, the raw payload (collapsed), and actions: Assign to tenant (tenant search + optional invoice allocation, reusing the record-payment allocation editor), Ignore (reason), Un-ignore.
4. Payment detail: "From M-Pesa" link to the inbound transaction when `inboundId` is set. Sidebar badge with the unmatched count (from `GET /inbound-transactions?status=UNMATCHED&pageSize=1` → `meta.total`).

## Tests

- **Unit:** account-reference normalisation and matching order, phone normalisation (`2547…`, masked numbers), Daraja timestamp/password, callback payload parsing (STK success/cancel, C2B), IP allow-list check.
- **e2e (simulated Daraja via provider override):** STK push → callback → re-query → payment, allocated to the requested invoice, SMS; cancelled and timed-out STK; callback replay creates nothing new; STK success that the re-query denies records nothing; C2B with tenant code, invoice number, unit ref and phone; unmatched → assign → payment; ignore/unignore; manual entry of the same receipt first → linked, not doubled; unknown token 404; wrong IP 403; credentials never in any response or audit entry; setting credentials needs step-up; cross-org isolation; sweep job.

## Not in phase 5

Tenant self-service Pay (7), C2B Transaction Status re-query (needs initiator credentials; Security to decide), B2C payouts (10), banks (10).

## Done when

All checks pass. Locally, with the simulated Daraja, staff request an STK payment and see it complete into a receipt. A simulated C2B payment with a tenant code is recorded automatically, and one with an unknown reference waits on the reconciliation screen until it is assigned. All of it is in the audit log.

## Outcome (2026-10-27)

- Backend: 106 unit + 77 e2e tests (real Postgres, a fake Daraja): credentials write-only, step-up, never in responses/audit, kept passkey on key change; STK push → callback → re-query → payment on the requested invoice, SMS; callback replays; forged success denied by re-query; cancel; sweep (timeout and still-processing); C2B by tenant code, invoice number, unit reference and phone; unmatched → ignore → unignore → assign; manual entry first → linked; unknown token 404; non-Safaricom address 403; other shortcode ignored; cross-org isolation. Frontend: 251 tests.
- Contract change during the build: STK endpoints are `/stk-requests` (not `/payments/stk`, which collided with `/payments/:id`).
- Verified in a browser with the simulated Daraja: connected a paybill (step-up code), sent a payment prompt → "Paid" with receipt in ~5 s, paybill payment with reference "klc a4" matched to unit A4's tenant, "rent october" waited on Reconciliation with a "Name matches" suggestion and was assigned.
- Deployment: callbacks must go straight to the Cloud Run URL (`API_URL` → `PUBLIC_API_URL`), not through Firebase Hosting, or the Safaricom address check sees the CDN. STK sweep scheduler job in `infra/gcp/README.md` §10.
- Open for Security / go-live: C2B confirmations are not re-queried (needs Transaction Status credentials); confirm Safaricom's callback IP list and the C2B register API version.
