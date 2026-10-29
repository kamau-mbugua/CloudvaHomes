# Phase 10 — Banks & payouts (implementation plan)

**Date:** 2026-10-28
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.2 (banks), §5.3 (remittances), §9 phase 10
**Depends on:** phases 5 (M-Pesa), 6b (agency remittances)
**Status:** DONE 2026-10-28 — see "Outcome" at the end
**Goal:** money paid into an organisation's **bank account** reaches Hodi and is matched to tenants like M-Pesa money: a CSV statement import that works with any bank, plus a notification webhook for banks or middleware that push. Agencies can **send a landlord's remittance by M-Pesa B2C** from Hodi, and download a bulk-payment file for bank payouts.

## Owner decisions still open (built so they can be answered later)

- **Which banks first** (design §10 Q3). No bank-specific API is built in this phase: each needs a partnership, credentials and the bank's own spec, which we don't have. The work here is bank-neutral, and a bank's adapter plugs into the interface below when one is chosen.
- **B2C account.** Paying landlords by M-Pesa needs the agency's own **B2C (bulk disbursement) shortcode** and a Daraja app with B2C enabled. A paybill used for collections can't send money. Each agency gets this from Safaricom.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Bank interface | `BankAdapter { code, name, verify(headers, rawBody, secret), parse(rawBody) → BankCredit[] }` in `src/modules/banks/`, registered by code. The statement side is the CSV importer below. A bank with a statement API later adds `fetchStatement(range)` | Design §5.2. Keeps per-bank code in one file each |
| Adapter shipped now | `HODI_JSON`: Hodi's own documented JSON webhook, signed with HMAC-SHA256 over the raw body (`X-Hodi-Signature: sha256=<hex>`, `X-Hodi-Timestamp`, 5-minute window). For banks, aggregators or integration middleware that can be configured to post to us | A working, testable push path without inventing a bank's API |
| Bank webhooks | `POST /hooks/bank/:token`. The token is per channel (as for M-Pesa), the signature is checked against the channel's encrypted secret, and the rows are stored as `InboundTransaction` (`source = BANK_IPN`). Idempotent on the bank's transaction id | Design §5.2. Same pipeline as M-Pesa, so matching, reconciliation and receipts are reused |
| CSV statement import | Upload a bank's CSV export for a `BANK_ACCOUNT` channel → choose which columns are date, amount (or credit), reference/narrative, transaction id (optional) and payer (optional) → preview → import. The mapping is saved on the channel for next time. Only **credits** are imported. Dates accept `YYYY-MM-DD`, `DD/MM/YYYY` and `DD-MM-YYYY`; amounts accept `1,234.50` | Works with any bank's export today, with no guessing at formats we can't verify |
| Statement dedup | With a transaction-id column, the id is the key. Without one, the key is a hash of (date, amount, narrative) plus `#n` for the n-th identical row in that file. Re-importing the same file, or a file that overlaps the last one, adds nothing | `InboundTransaction` is unique per channel + provider ref |
| Matching bank money | The narrative is searched for a tenant code (`T00001`) or an invoice number (`INV-2026-000001` / `INV2026000001`); the first hit wins. A whole-narrative unit reference (`KLCA4`) is tried as for M-Pesa. Otherwise it waits on the reconciliation screen. A manual bank-slip payment with the same reference on that channel is linked instead of paid twice (existing rule) | Narratives are free text: only unambiguous tokens auto-match |
| B2C set-up | A **payout account** per organisation (`PayoutAccount`, kind `MPESA_B2C`): B2C shortcode, Daraja environment, consumer key/secret, initiator name and **security credential** (generated in the Daraja portal), all encrypted and write-only, behind step-up. Webhook URLs carry an unguessable token | Same pattern as channels. Hodi never sees the initiator password |
| Sending a remittance | `POST /remittances/:id/send` (needs `remittances:pay` + step-up). Only an APPROVED `TO_LANDLORD` remittance whose landlord's payout method is M-Pesa, with a whole-shilling amount. Creates a `Payout` and moves the remittance to **`SENDING`** so it can't be paid twice. The person who approved it can't send it (maker–checker continues) | Design §5.3 |
| B2C result | Result callback (token + Safaricom IP allow-list, matched on our `OriginatorConversationID` *and* Safaricom's `ConversationID`): success → remittance **PAID** (method MPESA, reference = M-Pesa receipt, ledger entry); failure → payout FAILED, remittance back to **APPROVED** with the reason shown. A **queue timeout** or no answer within 30 minutes → payout `UNCERTAIN`: **never retried automatically**. A person checks the M-Pesa statement and resolves it as paid (with the receipt) or not paid | Money out must never be sent twice |
| Bank payouts | **Bulk-payment file**: `GET /remittances/bulk-file?ids=…` → CSV (beneficiary, bank, branch, account, amount, reference) for APPROVED bank remittances, for upload to the agency's internet banking. Then each is marked paid as today. Needs `remittances:pay` + step-up (it decrypts payout details) and is audited. No bank transfer API until a bank is chosen | Gives agencies batch bank payouts now without guessing a bank's file format |
| Local dev | `DARAJA_MODE=simulated` also simulates B2C: a result after about 4 s, failure if the amount ends in 1 shilling | As for STK |

## Data model (migration `banks_payouts`)

- `InboundSource` gains `BANK_IPN`, `BANK_STATEMENT`.
- `PaymentChannel` gains `bankAdapter String?` (for webhooks) and `statementMapping Json?` (the saved CSV mapping). `secretsEnc` / `callbackToken` are reused for the bank webhook secret and path.
- `StatementImport`: `orgId`, `channelId`, `filename`, `rows`, `credits`, `created`, `duplicates`, `matched`, `createdById`, `createdAt`. A history of imports.
- `PayoutAccount`: `orgId`, `kind` (`MPESA_B2C`), `name`, `shortcode`, `darajaEnv`, `secretsEnc`, `callbackToken @unique`, `status`, `createdAt`/`updatedAt`. One active account per organisation per kind.
- `Payout`: `orgId`, `remittanceId`, `accountId`, `amount`, `phone`, `state` (`PENDING`, `SUCCESS`, `FAILED`, `UNCERTAIN`), `originatorConversationId @unique`, `conversationId?`, `receipt?`, `resultCode?`, `resultDesc?`, `requestedById`, `resolvedById?`, `resolvedNote?`, timestamps.
- `RemittanceStatus` gains `SENDING`.

All new tables are org-scoped (added to `ORG_SCOPED_MODELS`).

## API contract (under `/api/v1`)

| Method & path | Permission | Notes |
|---|---|---|
| `POST /payment-channels/:id/statement-imports/preview` multipart `file` (+ optional `mapping` JSON) | `reconciliation:update` | → `{ headers, sample: [first 10 rows], mapping (saved or guessed), parsed: { credits, skipped, errors: [{row, message}] } }` |
| `POST /payment-channels/:id/statement-imports` multipart `file`, `mapping` | `reconciliation:update` | → `{ id, rows, credits, created, duplicates, matched }`; saves the mapping on the channel |
| `GET /payment-channels/:id/statement-imports` | `reconciliation:view` | History |
| `PUT /payment-channels/:id/bank-webhook` `{ adapter: 'HODI_JSON' }` (step-up) → `{ url, secret }` (secret shown **once**) · `DELETE` | `channels:manage` | `BANK_ACCOUNT` channels only |
| `POST /hooks/bank/:token` | signature | 200 `{ received, created }`; 401 on a bad signature |
| `GET /payout-accounts` · `PUT /payout-accounts/b2c` (step-up) · `DELETE /payout-accounts/b2c` (step-up) | `settings:view` / `settings:update` | `{ id, kind, name, shortcode, environment, configured, callbackUrls }`; keys never returned |
| `POST /remittances/:id/send` + `Idempotency-Key` | `remittances:pay` + step-up | → remittance with `payout: { id, state, amount, phone (masked), receipt, resultDesc, createdAt }` |
| `POST /remittances/:id/payout/resolve` `{ outcome: 'PAID'\|'NOT_PAID', receipt?, note }` | `remittances:pay` + step-up | Only for `UNCERTAIN` |
| `GET /remittances/bulk-file?ids=a,b` | `remittances:pay` + step-up | CSV; APPROVED bank remittances only |
| `POST /hooks/payout/:token/result` · `/timeout` | token + IP | Safaricom B2C callbacks |
| `POST /internal/jobs/payout-sweep` (every 5 min) | scheduler | PENDING over 30 min → UNCERTAIN |
| Remittance responses gain `status: 'SENDING'` and `payout` | | |

New error codes: `NO_PAYOUT_ACCOUNT`, `PAYOUT_NOT_MPESA`, `WHOLE_SHILLINGS`, `BAD_SIGNATURE`, `NOT_BANK_CHANNEL`, `CSV_INVALID`.

## Frontend

1. **Bank channel page:** "Import statement" (upload → column mapping with sample rows → preview counts and row errors → import → results with links to unmatched items), import history, and the "Bank notifications" card (turn on, copy URL, secret shown once, turn off).
2. **Settings → Payouts:** the M-Pesa B2C account (set up / change keys with step-up / remove), with callback URLs.
3. **Remittance page:** "Send by M-Pesa" for approved M-Pesa remittances (confirm the amount and the masked phone, step-up), live payout status, an UNCERTAIN banner with "Resolve", and failure reasons. Remittances list: select approved bank remittances → "Download bulk-payment file".

## Tests

- **Unit:** CSV parsing (dates, amounts, credit/debit columns, quoting, BOM), dedup keys, narrative references, HMAC verification (good, bad, stale timestamp), B2C result parsing.
- **e2e** (fake Daraja):
  - **Statement import:** import with mapping; re-import adds nothing; matched by tenant code and by invoice number; an existing slip is linked; debits skipped; bad rows reported.
  - **Webhook:** valid signature → payment; wrong or stale signature → 401; replay → nothing new.
  - **B2C account:** step-up needed; keys never returned.
  - **Send:**
    - success → PAID with the ledger entry;
    - failure → back to APPROVED;
    - timeout → UNCERTAIN → resolve paid / not paid;
    - can't send twice;
    - the approver can't send;
    - a remittance that isn't M-Pesa → 409;
    - cents → 422.
  - **Bulk file:** step-up needed, bank remittances only, audited.
  - **Cross-org isolation.**

## Not in phase 10

Bank-specific APIs (Equity, KCB, Co-op…: waiting on the owner's choice and partner access), bank transfer payouts by API, Transaction Status re-query for B2C (a security-review item, like C2B), tenant refunds by B2C.

## Done when

All checks pass. Locally:
- a bank CSV import creates payments for the tenants it names, and a second import of the same file adds nothing;
- a signed bank notification creates a payment;
- an approved remittance is sent by (simulated) M-Pesa B2C and shows as paid with its receipt.

## Outcome (2026-10-28)

- **Backend:** 143 unit and 107 e2e tests pass. New unit tests cover CSV parsing, dates and amounts, mapping guesses, dedup keys, narrative references and HMAC signatures. New e2e tests cover:
  - CSV import: mapping guessed, then remembered; tenant-code and invoice matches; re-import adds nothing; a manual bank slip is linked, not paid twice.
  - Signed notifications: step-up to turn on; secret shown once; wrong or stale signatures refused (401); replays ignored.
  - B2C payouts:
    - step-up to set up the account; keys never returned;
    - SENDING → PAID with the ledger entry, recorded as paid by the sender;
    - Idempotency-Key honoured; the approver can't send;
    - declined → back to APPROVED; details changed after approval → `PAYOUT_CHANGED`; cents → `WHOLE_SHILLINGS`;
    - timeout or lost contact → UNCERTAIN, resolved by a person (paid with receipt / not paid).
  - Bulk-payment file: step-up; bank landlords only; the audit has no account numbers.
- **Frontend:** 491 tests pass. New screens:
  - bank panel on Payment channels: statement import with column mapping, sample rows and counts; import history; bank notifications;
  - Settings → Payouts;
  - remittance page: Send by M-Pesa, live payout state, Resolve;
  - remittances list: select bank remittances → bulk-payment file.
  The interrupted background agent's work was finished inline.
- **Live check** on the dev data, in the browser against the real API:
  - A CSV from "Equity collections" had 2 credits and 1 debit skipped. The tenant-code credit was matched (receipt issued) and the other left on Reconciliation. Importing the same file again added nothing.
  - Bank notifications were turned on with a one-time code. A notification signed with `openssl` became a payment; a wrong signature got 401.
  - The B2C account was set up. REM-2026-000001 (approved by a second person) was sent by simulated M-Pesa: Sending → Paid with receipt SIMB2C…, with no horizontal scroll at 390px.
- **Fixed during the check:**
  - a preview with only a guessed mapping showed no counts (it now re-asks with the guess);
  - "Paid · Someone · 03:00" now shows the sender and the date;
  - "on M-Pesa M-Pesa •••• 0201" now reads "on M-Pesa •••• 0201".
- **Still for the owner:**
  - which banks to integrate first (each needs partner access and that bank's spec);
  - each agency's own B2C shortcode from Safaricom;
  - confirm the B2C API version and CommandID before go-live;
  - Transaction Status re-query for B2C (security review, like C2B).
