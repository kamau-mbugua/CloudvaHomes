# Hodi Platform — Architecture & Data Model Design

**Date:** 2026-10-27
**Status:** Draft for review
**Scope:** Whole platform — `backend/`, `frontend/`, `mobile/`, `landing/` (later).
**Reference:** `docs/legacy/hodi-legacy-openapi.yaml` — how the lost Hodi backend behaved, reverse-engineered from `hodi_app`. Reference only; this design supersedes it.

---

## 1. What we are building

Hodi is a rental-management SaaS for the Kenyan market. Landlords and letting agents manage properties, units and tenants; the system bills tenants every month (rent + utilities), takes payment through M-Pesa, banks, cash and cheque, reconciles money that arrives, tracks expenses, and reports income per property. Hodi itself bills each landlord/agency for using the platform.

**Users (all get the web app; staff and tenants get the mobile app):**

| Who | What they do |
|---|---|
| Platform admin (CloudvaLabs) | Onboards organisations, sets plans/pricing, sees platform billing, support |
| Organisation owner / manager | Everything inside their organisation |
| Accountant | Invoices, payments, reconciliation, expenses, reports, landlord remittances |
| Caretaker | Meter readings, house status, tenant move-in/out (no money config) |
| Landlord (client of an agency) | Sees their properties, occupancy, monthly owner statements and remittances (read-only) |
| Tenant | Sees their invoices, statement and receipts; pays via M-Pesa; raises requests |

### Decisions already made (owner, 2026-10-27)

- Backend **NestJS + Prisma + PostgreSQL**.
- **One monorepo:** `/backend`, `/frontend`, `/mobile`, `/landing` (later).
- Web frontend for **all user types**, styled on **UltimatePOS `pos-react`** design.
- The Flutter app is **refactored** onto the new API (not kept wire-compatible).
- Payments: **M-Pesa** (Daraja) plus **as many banks as feasible**.
- **Agencies are in scope:** an agency manages properties on behalf of landlords, earns commission, and remits collections to them (§5.3).
- **Hosting: Google Cloud Platform** (§4.6).

---

## 2. Naming — two words that collide

The legacy app used **"estate"** for the paying customer of the SaaS. In Kenya "estate" also means a residential compound — i.e. a *property*. And **"tenant"** means both a renter and (in SaaS jargon) a customer account. To avoid bugs born of ambiguity:

| Legacy term | New term | Meaning |
|---|---|---|
| Estate | **Organisation** (`Organization`, `orgId`) | Landlord or agency account; the SaaS customer |
| — (new) | **Landlord** | A property owner who is a *client of an agency* organisation |
| — (new) | **Management agreement** | Terms between an agency and a landlord: commission, remittance day |
| — (new) | **Remittance** | A payout of net collections from an agency to a landlord |
| Property | **Property** | A building / compound |
| House | **Unit** | A rentable space in a property |
| House category / type | **UnitCategory** / **UnitType** | e.g. "Executive" / "2 Bedroom" |
| Tenant (renter) | **Tenant** | A person renting; linked to a `User` when they have a login |
| Tenant occupancy / house history | **Tenancy** | Tenant × unit × period (move-in → move-out) |
| Utility bill | **ChargeType** | Recurring charge: fixed, variable or metered |
| Onboard / "new let" fee | **MoveInCharge** | One-off on move-in: deposit (refundable) or fee |
| Payment type + bank account | **PaymentChannel** | Where money arrives: paybill, till, bank account, cash |
| Payment statement | **InboundTransaction** | A raw money-in event from M-Pesa / a bank, before allocation |
| Estate invoice | **PlatformInvoice** | Hodi billing an organisation |
| User group | **Role** | Named set of permissions within an organisation |

"Tenant" is never used to mean an organisation anywhere in code.

---

## 3. Repository layout

```
CloudvaHomes/
├── backend/                 NestJS API (TypeScript)
│   ├── prisma/              schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/          guards, interceptors, filters, pagination, money, decorators
│   │   ├── config/          typed env (zod)
│   │   ├── prisma/          PrismaService + org-scoping extension
│   │   └── modules/
│   │       ├── auth/        login, refresh, OTP, password reset
│   │       ├── organizations/
│   │       ├── users/  roles/
│   │       ├── landlords/   landlords, management agreements, owner statements, remittances
│   │       ├── properties/  units/
│   │       ├── tenants/     tenancies/
│   │       ├── charges/     (charge types, move-in charges)
│   │       ├── meters/
│   │       ├── billing/     invoice generation, invoices, credit notes
│   │       ├── payments/    payments, allocations, receipts
│   │       ├── channels/    payment channels (paybills, bank accounts)
│   │       ├── integrations/
│   │       │   ├── mpesa/   STK push, C2B, callbacks
│   │       │   └── banks/   one adapter per bank behind a common interface
│   │       ├── reconciliation/
│   │       ├── expenses/
│   │       ├── reports/     dashboard, property P&L, arrears
│   │       ├── platform-billing/
│   │       ├── notifications/ SMS, email, push
│   │       ├── files/       S3-compatible uploads
│   │       └── audit/
│   └── test/
├── frontend/                React web app (all user types)
├── mobile/                  Flutter app (today's hodi_app, refactored)
├── landing/                 Marketing site (later)
├── packages/                (optional, later) shared generated API types
└── docs/
    ├── legacy/              hodi-legacy-openapi.yaml
    └── specs/               this document and later sub-project specs
```

The Flutter app currently lives at `hodi_app/` with its own `.git`. Moving it to `mobile/` and deciding whether the monorepo has one git history (recommended) or keeps the app's history via `git subtree` is an owner step — **not done by this design** (repo rule: the owner handles git).

---

## 4. Backend architecture

### 4.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 22 LTS, TypeScript strict | |
| Framework | NestJS 11 | Modules map 1:1 to domains; guards for permissions; Swagger from code |
| DB | PostgreSQL 16 | Transactions and constraints for money |
| ORM | Prisma 6 | Schema + migrations + typed client |
| Validation | `class-validator` DTOs (Nest standard) + `zod` for env | |
| Scheduled jobs | Cloud Scheduler → authenticated internal endpoints | Daily invoice run, reminders, STK timeout sweep, platform billing (§4.6) |
| Queues / retries | Cloud Tasks | SMS/email/push sending, webhook post-processing, PDF generation |
| Rate limits / OTP counters | Postgres (small tables, TTL cleanup job) | No Redis needed at launch; add Memorystore only if load demands |
| Files | Cloud Storage (private buckets, signed URLs) | Meter photos, documents, receipt PDFs |
| Secrets & encryption | Secret Manager (env secrets), Cloud KMS (key for field-level encryption) | |
| PDFs | Server-side (`pdfkit`, used in petropay) | Invoices/receipts identical on web, mobile, SMS link |
| SMS | Africa's Talking (used in petropay) | |
| Email | SMTP relay (Brevo, as other Cloudva projects) | |
| Push | Firebase Cloud Messaging | |
| API docs | `@nestjs/swagger` → `/api/docs` + exported `openapi.json` | Web + Dart clients generated from it |
| Logs | `pino` (JSON), request id per call | |
| Tests | Jest unit + e2e against a real Postgres (Testcontainers) | Money logic must be tested on the real DB |
| Hosting | GCP: Cloud Run + Cloud SQL for PostgreSQL | Details in §4.6 |

### 4.2 API conventions (new — not the legacy shapes)

- Base path `/api/v1`. JSON, camelCase.
- **Success:** `{ "data": … }` for one resource; `{ "data": [...], "meta": { "page", "pageSize", "total", "pages" } }` for lists. Pages are **1-based**.
- **Errors:** HTTP status is meaningful (400/401/403/404/409/422/429/500). Body:
  `{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [{ "field": "phone", "message": "…" }] }, "requestId": "…" }`.
  No more `200 + status:"00"` for failures.
- **Money:** integer **minor units** (cents) as JSON integers plus a `currency` (default `KES`). Never floats. Formatting is a client concern.
- **Dates:** ISO-8601 UTC timestamps; business dates (billing period, due date) as `YYYY-MM-DD`; billing periods as `YYYY-MM`. Server timezone for jobs: `Africa/Nairobi`.
- **Ids:** UUID v7 strings (sortable). Human references (invoice/receipt numbers) are separate fields, e.g. `INV-2026-000123`.
- **Idempotency:** every endpoint that creates money records (`POST /payments`, `/payments/stk`, invoice runs) requires an `Idempotency-Key` header; replays return the original response.
- **Filtering:** query params (`propertyId`, `status`, `from`, `to`, `q`); omitted = no filter (empty strings are rejected, unlike legacy).
- **Soft delete / status:** records use `status` (`ACTIVE` / `INACTIVE`) and `deletedAt`, replacing legacy `flags/{action}/{id}` with `PATCH /…/{id}` `{status}` and `DELETE /…/{id}`.

### 4.3 Multi-tenancy (organisation isolation)

Shared database, shared schema, `orgId` on every organisation-owned row.

1. The access token carries `sub` (userId) and the **active `orgId`** (a user may belong to several organisations — e.g. an agent; they switch org, which issues a new token).
2. A Prisma client extension injects `where: { orgId }` on reads and `data: { orgId }` on writes for org-scoped models. Raw SQL is only allowed in the reports module, which must take `orgId` explicitly.
3. **Defence in depth (phase 2 of hardening):** Postgres Row-Level Security on org-scoped tables using `SET LOCAL app.org_id` per transaction, so a missed filter fails closed.
4. e2e tests include a "cross-org" suite: org A's token must get 404 on every org B resource id.

### 4.4 Auth

- Staff: email/username + password (argon2id). Tenants: **phone + OTP** (many tenants have no email) and optional password.
- Access token (JWT, 15 min) + refresh token (opaque, stored hashed, rotated on use, 30 days, revocable per device).
- Password reset via email link or SMS OTP. OTP codes hashed, 5-minute expiry, 5 attempts, rate-limited per phone and per IP.
- Sensitive actions (adding/changing a payment channel, deleting an organisation, changing roles) require a **step-up OTP** — this keeps the legacy behaviour where adding a payment account needed an OTP.
- Platform admins are flagged on `User.isPlatformAdmin`; they act on organisations through an explicit "support session" that is audited.

### 4.5 Permissions

Keep the legacy granularity (it was good) but rename to `resource:action`:

`landlords`, `agreements`, `remittances`, `properties`, `units`, `unit-categories`, `tenants`, `tenancies`, `meters`, `charges`, `invoices`, `payments`, `channels`, `reconciliation`, `expenses`, `reports`, `users`, `roles`, `settings` × `view | create | update | delete` (+ special: `payments:refund`, `invoices:void`, `channels:manage`, `remittances:approve`, `remittances:pay`).

Approving and paying a remittance are separate permissions so one person cannot both prepare and release a payout (maker–checker).

- A **Role** is an org-defined set of permissions. Seeded system roles per organisation: **Owner** (all), **Manager**, **Accountant**, **Caretaker**. Owners can create custom roles (as legacy "user groups").
- Tenants and landlords don't get roles; their endpoints live under `/api/v1/me/…` and are scoped by the server to their own tenancies (tenant) or their own properties, statements and remittances (landlord). One person can be both (e.g. a landlord who also rents elsewhere) — the `/me` endpoints return each profile they have.
- Nest guard: `@RequirePermission('payments:create')`. The web/mobile clients receive the permission list at login to hide UI, but the server is the authority.
- Property-level scoping (a caretaker who only manages two properties): `Membership.propertyIds` (empty = all). Enforced in the same guard.

### 4.6 Hosting on Google Cloud

| Piece | GCP service | Notes |
|---|---|---|
| API | **Cloud Run** service `hodi-api` (container from `backend/Dockerfile`) | Min instances 1 in production (no cold start on payment callbacks); autoscale on requests |
| Database | **Cloud SQL for PostgreSQL 16**, private IP, automated backups + point-in-time recovery, HA in production | Cloud Run connects via the Cloud SQL connector / Direct VPC egress |
| Migrations | Cloud Run **job** `hodi-migrate` running `prisma migrate deploy` | Run by CI before traffic shifts to a new revision |
| Scheduled work | **Cloud Scheduler** → OIDC-authenticated calls to `/internal/jobs/*` on the API | Each job idempotent (unique constraints, e.g. one invoice per tenancy per period) so a double fire is harmless |
| Background work | **Cloud Tasks** queues → `/internal/tasks/*` | Retries with backoff; notifications, PDF rendering, webhook post-processing |
| Web app | **Firebase Hosting** for `frontend/` with a rewrite `/api/**` → Cloud Run `hodi-api` | Same origin for web + API: no CORS, cookies work, global CDN |
| Files | **Cloud Storage** private buckets | Signed URLs for upload (meter photos) and download (PDFs) |
| Secrets | **Secret Manager** mounted into Cloud Run | DB password, JWT keys, Daraja platform credentials, SMS keys |
| Field encryption | **Cloud KMS** key, envelope encryption | Tenant ID numbers, landlord payout details, channel credentials |
| Outbound static IP | **Cloud NAT** with a reserved address | Banks commonly whitelist the caller's IP; Daraja production may too |
| Logs / alerts | Cloud Logging + Error Reporting + uptime checks | Alert on webhook failures, invoice-run failures, 5xx rate |
| CI/CD | GitHub Actions → Artifact Registry → Cloud Run (Workload Identity Federation, no JSON keys) | Environments: `dev`, `staging`, `prod` as separate GCP projects |

**Region.** GCP has no Kenyan region. `africa-south1` (Johannesburg) is the closest; `europe-west1` is the alternative with the full service catalogue. Confirm Cloud SQL, Cloud Run, Cloud Tasks and Cloud Scheduler availability in the chosen region at project setup. Storing Kenyan personal data outside Kenya is a **cross-border transfer under the Data Protection Act** — see §8; Legal should confirm before go-live.

---

## 5. Domain model

### 5.1 Money and billing rules

- A **Tenancy** has `rentAmount`, `billingDay` (1–28), `startDate`, optional `endDate`, and a deposit.
- **Monthly invoice run** (Cloud Scheduler job, daily at 00:30 Nairobi): for each active tenancy whose `billingDay` is today and that has no invoice for the period, create one **Invoice** with lines:
  - `RENT` — tenancy rent (pro-rated for the first month if the org chooses).
  - `CHARGE` — each active ChargeType for the property: fixed amount; variable (amount entered per period before the run, or added as a line later); metered = (current − previous reading) × unit rate from the period's **MeterReading**.
  - `ARREARS_BF` — *not used*. Arrears are **not copied into the new invoice** (that double-counts). Instead every invoice stands alone and the **tenant statement** shows the running balance. The legacy "BF" tab becomes an "Overdue" filter (`balance > 0 AND dueDate < today`). Orgs that want a single "amount due" see it on the statement and the SMS ("You owe KES X in total").
- **Payments** are recorded once and **allocated** to invoices (oldest-due first by default, or chosen by the user). Unallocated remainder sits as tenant **credit** and is auto-applied to the next invoice.
- **Invoice status** is derived from allocations: `DRAFT → ISSUED → PARTIALLY_PAID → PAID`, or `VOID`. Changing an issued invoice is done by **credit note**, never by editing lines (audit trail).
- **Move-in:** creating a Tenancy optionally issues a move-in invoice from the property's MoveInCharges (deposit = N × rent if configured). Refundable deposits are tracked as `depositHeld` on the tenancy and settled on move-out (refund, or apply to arrears).
- All money columns are `BigInt` minor units. Sums are done in SQL or with integer arithmetic only.

### 5.2 Payments and integrations

```
          ┌────────── Tenant pays ──────────┐
          │                                 │
  STK push (app/web)                Paybill / bank deposit
  POST /payments/stk                (tenant enters account no.)
          │                                 │
   Daraja STK callback          Daraja C2B confirmation / Bank IPN
          │                                 │
          └──────► InboundTransaction ◄─────┘   (raw, immutable, unique per provider ref)
                          │
                 Reconciliation engine
          match by: STK request id → invoice
                    account ref → unit code / tenant code / invoice no.
                    phone → tenant (only if unique)
                          │
             ┌────────────┴─────────────┐
       matched: Payment + Allocations   unmatched: queue for accountant
       + SMS/push receipt               (web "Reconciliation" screen)
```

- **PaymentChannel** belongs to an organisation and optionally to specific properties. Types: `MPESA_PAYBILL`, `MPESA_TILL`, `BANK_ACCOUNT`, `CASH`, `CHEQUE`. Each M-Pesa channel stores the org's **own Daraja credentials** (consumer key/secret, passkey, shortcode) — money goes straight to the landlord, not through Hodi.
- **Credentials at rest:** encrypted with an app-level key (AES-256-GCM, key from the secret manager, envelope pattern; key id stored for rotation). Never returned by the API after save; never logged.
- **Webhooks:** Daraja does not sign callbacks, so: per-channel unguessable callback path token, Safaricom IP allow-list, and **always re-query** (`STK Query` / `Transaction Status`) before trusting a success. Banks: verify HMAC/signature per bank adapter. All webhook handlers are idempotent on the provider's transaction id (unique index).
- **Banks:** a `BankAdapter` interface (`parseNotification`, `verifySignature`, `fetchStatement(range)`) with one implementation per bank. Where a bank has no push API, a scheduled **statement pull** or a **CSV statement import** fills `InboundTransaction` the same way. Start with M-Pesa; then the banks the first customers use (likely Equity, KCB, Co-op — to confirm).
- **Manual payments** (cash, cheque, bank slip) are created by staff with `payments:create`, go straight to Payment (and for bank slips can be linked to an InboundTransaction once the statement arrives — replacing legacy "validate slip").
- **Refunds/reversals** are new Payment rows of negative amount with a link to the original; never deletes.

### 5.3 Agencies, landlords and remittances

An organisation is either a **LANDLORD** (owns what it manages; no Landlord records needed) or an **AGENCY** (manages properties for many landlords). In an agency, every property belongs to exactly one **Landlord**.

**Management agreement** (per landlord, optionally narrowed to some properties):
- Commission basis: `PERCENT_OF_COLLECTED` (default — agencies are usually paid on what they actually collect), `PERCENT_OF_INVOICED`, or `FIXED_MONTHLY` per property/unit.
- Rate in basis points (`1000` = 10%), and which line kinds are commissionable (default: rent only; utilities and deposits pass through).
- Remittance day of the month, and whether property expenses paid by the agency are deducted from the landlord's payout.
- Who receives rent: `AGENCY_COLLECTS` (tenants pay the agency's paybill; agency remits) or `LANDLORD_COLLECTS` (tenants pay the landlord's own paybill; the agency still records it and **invoices the landlord** for its commission instead of deducting it).
- Agreements have start/end dates; a change of terms is a new agreement, so past statements never change.

**Landlord ledger.** Every money event on a landlord's properties writes an entry to `LandlordLedgerEntry` so the balance owed to each landlord is auditable, never recomputed from scratch:

| Event | Entry |
|---|---|
| Payment allocated to an invoice on their property | **credit** the collected amount (commissionable and pass-through lines split) |
| Commission on that allocation | **debit** commission |
| Expense on their property paid by the agency (if deductible) | **debit** expense |
| Deposit received / refunded | **credit/debit** to a separate *deposit held* balance — deposits are not remitted by default (the agency holds them) |
| Remittance paid | **debit** the amount paid |
| Payment reversal | mirror entries reversing the above |

Commission is booked at allocation time (cash basis), so a reversed payment reverses its commission automatically.

**Owner statement** (monthly per landlord, PDF + portal): opening balance, collections by property/unit, commission, expenses, remittances, closing balance payable; plus occupancy and arrears for their units.

**Remittance flow:** on the remittance day a job drafts a `Remittance` per landlord = ledger balance payable → accountant reviews → a user with `remittances:approve` approves → a user with `remittances:pay` marks it paid (manual bank transfer / cheque with reference) or, later, sends it by **M-Pesa B2C** or bank transfer API. Payout destinations are the landlord's bank or M-Pesa details, encrypted at rest; changing them requires step-up OTP and notifies the landlord (a common fraud vector is quietly changing payout details).

### 5.4 Platform billing (Hodi → organisation)

- `Plan`: price per occupied unit per month (legacy "commission"), optional minimum, free trial days.
- Monthly job on the 1st: `PlatformInvoice` per organisation = occupied units on the last day of the previous month × rate.
- Organisation pays via Hodi's own M-Pesa paybill (same STK/C2B machinery, Hodi's channel).
- Status → access: `ACTIVE`; `GRACE` (unpaid past due, banner + dismissible prompt — legacy `001`); `SUSPENDED` (read-only lock; legacy `002`). Tenants can **always** pay rent even when the org is suspended — blocking rent collection would hurt the landlord's cashflow and our relationship.

### 5.5 Prisma schema (draft)

Abbreviated: every org-scoped model also has `createdAt`, `updatedAt` and, where noted, `deletedAt`; indexes on `orgId` plus the main filter columns are implied.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ───────── Identity & access ─────────
model User {
  id              String   @id @default(uuid(7)) @db.Uuid
  email           String?  @unique
  phone           String?  @unique          // E.164, e.g. +254712345678
  passwordHash    String?
  firstName       String
  lastName        String
  isPlatformAdmin Boolean  @default(false)
  status          UserStatus @default(ACTIVE)
  memberships     Membership[]
  tenantProfiles  Tenant[]
  refreshTokens   RefreshToken[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
enum UserStatus { ACTIVE INACTIVE LOCKED }

model Organization {
  id          String   @id @default(uuid(7)) @db.Uuid
  name        String
  kind        OrgKind                         // LANDLORD | AGENCY
  phone       String
  email       String
  kraPin      String?
  status      OrgStatus @default(TRIAL)       // TRIAL ACTIVE GRACE SUSPENDED CLOSED
  planId      String?  @db.Uuid
  settings    Json     @default("{}")         // invoice prefix, prorate, reminder days…
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
enum OrgKind { LANDLORD AGENCY }
enum OrgStatus { TRIAL ACTIVE GRACE SUSPENDED CLOSED }

model Membership {                              // user ↔ organisation (staff)
  id          String   @id @default(uuid(7)) @db.Uuid
  orgId       String   @db.Uuid
  userId      String   @db.Uuid
  roleId      String   @db.Uuid
  propertyIds String[] @db.Uuid               // empty = all properties
  status      UserStatus @default(ACTIVE)
  @@unique([orgId, userId])
}

model Role {
  id          String   @id @default(uuid(7)) @db.Uuid
  orgId       String   @db.Uuid
  name        String
  description String?
  isSystem    Boolean  @default(false)        // Owner/Manager/Accountant/Caretaker
  permissions String[]                        // ["payments:create", …]
  @@unique([orgId, name])
}

model RefreshToken {
  id         String   @id @default(uuid(7)) @db.Uuid
  userId     String   @db.Uuid
  tokenHash  String   @unique
  deviceInfo String?
  expiresAt  DateTime
  revokedAt  DateTime?
}

model OtpCode {
  id        String   @id @default(uuid(7)) @db.Uuid
  target    String                            // phone or email
  purpose   OtpPurpose
  codeHash  String
  attempts  Int      @default(0)
  expiresAt DateTime
  usedAt    DateTime?
}
enum OtpPurpose { LOGIN PASSWORD_RESET STEP_UP }

// ───────── Agency: landlords ─────────
model Landlord {                               // only used by AGENCY organisations
  id           String  @id @default(uuid(7)) @db.Uuid
  orgId        String  @db.Uuid
  userId       String? @db.Uuid               // set when they get owner-portal access
  code         String                         // "L0007"
  name         String                         // person or company
  kind         LandlordKind                   // INDIVIDUAL COMPANY
  phone        String
  email        String?
  idNumber     String?                        // national ID — PII, encrypted
  kraPin       String?
  payoutMethod PayoutMethod?                  // BANK MPESA CHEQUE
  payoutEnc    Bytes?                         // encrypted bank/M-Pesa payout details
  payoutKeyId  String?
  status       RecordStatus @default(ACTIVE)
  @@unique([orgId, code])
}
enum LandlordKind { INDIVIDUAL COMPANY }
enum PayoutMethod { BANK MPESA CHEQUE }

model ManagementAgreement {
  id               String  @id @default(uuid(7)) @db.Uuid
  orgId            String  @db.Uuid
  landlordId       String  @db.Uuid
  propertyIds      String[] @db.Uuid           // empty = all the landlord's properties
  commissionBasis  CommissionBasis             // PERCENT_OF_COLLECTED PERCENT_OF_INVOICED FIXED_MONTHLY
  commissionBps    Int?                        // 1000 = 10%
  fixedAmount      BigInt?
  commissionableLines LineKind[]               // default [RENT]
  collection       CollectionMode              // AGENCY_COLLECTS LANDLORD_COLLECTS
  remittanceDay    Int                         // 1–28
  deductExpenses   Boolean @default(true)
  holdDeposits     Boolean @default(true)
  startDate        DateTime @db.Date
  endDate          DateTime? @db.Date
}
enum CommissionBasis { PERCENT_OF_COLLECTED PERCENT_OF_INVOICED FIXED_MONTHLY }
enum CollectionMode { AGENCY_COLLECTS LANDLORD_COLLECTS }

model LandlordLedgerEntry {                    // append-only
  id          String   @id @default(uuid(7)) @db.Uuid
  orgId       String   @db.Uuid
  landlordId  String   @db.Uuid
  propertyId  String?  @db.Uuid
  bucket      LedgerBucket                     // PAYABLE DEPOSIT_HELD
  kind        LedgerKind                       // COLLECTION COMMISSION EXPENSE DEPOSIT REMITTANCE REVERSAL ADJUSTMENT
  amount      BigInt                           // + owed to landlord, − deducted/paid
  allocationId String? @db.Uuid
  expenseId    String? @db.Uuid
  remittanceId String? @db.Uuid
  agreementId  String? @db.Uuid
  occurredAt  DateTime
  memo        String?
}
enum LedgerBucket { PAYABLE DEPOSIT_HELD }
enum LedgerKind { COLLECTION COMMISSION EXPENSE DEPOSIT REMITTANCE REVERSAL ADJUSTMENT }

model Remittance {
  id           String  @id @default(uuid(7)) @db.Uuid
  orgId        String  @db.Uuid
  number       String                          // "REM-2026-000031"
  landlordId   String  @db.Uuid
  period       String                          // "2026-10"
  gross        BigInt
  commission   BigInt
  expenses     BigInt
  net          BigInt
  status       RemittanceStatus @default(DRAFT) // DRAFT APPROVED PAID CANCELLED
  method       PayoutMethod?
  reference    String?                         // bank ref / M-Pesa B2C receipt
  approvedById String? @db.Uuid
  paidById     String? @db.Uuid
  paidAt       DateTime?
  @@unique([orgId, number])
  @@unique([landlordId, period])
}
enum RemittanceStatus { DRAFT APPROVED PAID CANCELLED }

// ───────── Portfolio ─────────
model Property {
  id        String  @id @default(uuid(7)) @db.Uuid
  orgId     String  @db.Uuid
  landlordId String? @db.Uuid                  // required when the org is an AGENCY
  name      String
  code      String                            // short code used in paybill account refs
  location  String?
  county    String?
  floors    Int     @default(1)
  status    RecordStatus @default(ACTIVE)
  deletedAt DateTime?
  @@unique([orgId, code])
}

model UnitType {                               // "Bedsitter", "2 Bedroom"
  id       String @id @default(uuid(7)) @db.Uuid
  orgId    String @db.Uuid
  name     String
  @@unique([orgId, name])
}

model UnitCategory {                           // "Standard", "Executive"
  id          String @id @default(uuid(7)) @db.Uuid
  orgId       String @db.Uuid
  propertyId  String? @db.Uuid
  name        String
  description String?
  status      RecordStatus @default(ACTIVE)
}

model Feature {                                // "Balcony", "Parking"
  id      String @id @default(uuid(7)) @db.Uuid
  orgId   String @db.Uuid
  name    String
}

model Unit {
  id          String  @id @default(uuid(7)) @db.Uuid
  orgId       String  @db.Uuid
  propertyId  String  @db.Uuid
  unitTypeId  String? @db.Uuid
  categoryId  String? @db.Uuid
  number      String                          // "A4"
  floor       Int     @default(0)
  sizeSqft    Int?
  rentAmount  BigInt                          // default rent (minor units)
  description String?
  featureIds  String[] @db.Uuid
  status      RecordStatus @default(ACTIVE)
  deletedAt   DateTime?
  @@unique([propertyId, number])
}

// ───────── Tenants ─────────
model Tenant {
  id         String  @id @default(uuid(7)) @db.Uuid
  orgId      String  @db.Uuid
  userId     String? @db.Uuid                 // set once they have a login
  code       String                           // paybill account ref, e.g. "T00042"
  firstName  String
  lastName   String
  idNumber   String?                          // national ID / passport — PII, encrypted
  phone      String
  email      String?
  creditBalance BigInt @default(0)            // unallocated money (minor units)
  @@unique([orgId, code])
  @@unique([orgId, phone])
}

model Tenancy {
  id           String   @id @default(uuid(7)) @db.Uuid
  orgId        String   @db.Uuid
  tenantId     String   @db.Uuid
  unitId       String   @db.Uuid
  rentAmount   BigInt
  billingDay   Int                            // 1–28
  startDate    DateTime @db.Date
  endDate      DateTime? @db.Date
  depositHeld  BigInt   @default(0)
  status       TenancyStatus @default(ACTIVE) // ACTIVE NOTICE ENDED
  moveOutReason String?
  // DB constraint (raw migration): one ACTIVE/NOTICE tenancy per unit
}
enum TenancyStatus { ACTIVE NOTICE ENDED }

// ───────── Charges & meters ─────────
model ChargeType {                             // legacy "utility bill"
  id          String  @id @default(uuid(7)) @db.Uuid
  orgId       String  @db.Uuid
  propertyId  String  @db.Uuid
  name        String                          // "Water", "Garbage"
  kind        ChargeKind                      // FIXED VARIABLE METERED
  amount      BigInt?                         // FIXED
  unitRate    BigInt?                         // METERED: per unit consumed
  meterKind   String?                         // "water", "electricity"
  status      RecordStatus @default(ACTIVE)
}
enum ChargeKind { FIXED VARIABLE METERED }

model MoveInCharge {                           // legacy "onboard fee"
  id          String  @id @default(uuid(7)) @db.Uuid
  orgId       String  @db.Uuid
  propertyId  String  @db.Uuid
  name        String
  kind        MoveInKind                      // DEPOSIT OTHER
  amount      BigInt?                         // fixed amount, or
  rentMonths  Int?                            // N × rent
  refundable  Boolean @default(false)
  status      RecordStatus @default(ACTIVE)
}
enum MoveInKind { DEPOSIT OTHER }

model Meter {
  id           String @id @default(uuid(7)) @db.Uuid
  orgId        String @db.Uuid
  unitId       String @db.Uuid
  chargeTypeId String @db.Uuid
  serialNo     String
  status       RecordStatus @default(ACTIVE)
  @@unique([orgId, serialNo])
}

model MeterReading {
  id          String   @id @default(uuid(7)) @db.Uuid
  orgId       String   @db.Uuid
  meterId     String   @db.Uuid
  period      String                          // "2026-10"
  previous    Decimal  @db.Decimal(14, 3)
  current     Decimal  @db.Decimal(14, 3)
  photoKey    String?                         // object-storage key
  note        String?
  readById    String   @db.Uuid
  readAt      DateTime @default(now())
  locked      Boolean  @default(false)        // true once billed
  @@unique([meterId, period])
}

// ───────── Billing ─────────
model Invoice {
  id          String   @id @default(uuid(7)) @db.Uuid
  orgId       String   @db.Uuid
  number      String                          // "INV-2026-000123"
  tenancyId   String   @db.Uuid
  tenantId    String   @db.Uuid
  propertyId  String   @db.Uuid
  period      String                          // "2026-10"
  kind        InvoiceKind @default(MONTHLY)   // MONTHLY MOVE_IN ADHOC
  issueDate   DateTime @db.Date
  dueDate     DateTime @db.Date
  total       BigInt
  amountPaid  BigInt   @default(0)            // maintained from allocations
  status      InvoiceStatus @default(ISSUED)
  currency    String   @default("KES")
  lines       InvoiceLine[]
  @@unique([orgId, number])
  @@unique([tenancyId, period, kind])         // the invoice run cannot double-bill
}
enum InvoiceKind { MONTHLY MOVE_IN ADHOC }
enum InvoiceStatus { DRAFT ISSUED PARTIALLY_PAID PAID VOID }

model InvoiceLine {
  id            String @id @default(uuid(7)) @db.Uuid
  invoiceId     String @db.Uuid
  kind          LineKind                      // RENT CHARGE MOVE_IN ADJUSTMENT
  description   String
  quantity      Decimal @db.Decimal(14, 3) @default(1)
  unitAmount    BigInt
  amount        BigInt
  chargeTypeId  String? @db.Uuid
  meterReadingId String? @db.Uuid
}
enum LineKind { RENT CHARGE MOVE_IN ADJUSTMENT }

model CreditNote {
  id        String @id @default(uuid(7)) @db.Uuid
  orgId     String @db.Uuid
  number    String
  invoiceId String @db.Uuid
  amount    BigInt
  reason    String
  createdById String @db.Uuid
}

// ───────── Payments ─────────
model PaymentChannel {
  id           String @id @default(uuid(7)) @db.Uuid
  orgId        String @db.Uuid
  kind         ChannelKind                    // MPESA_PAYBILL MPESA_TILL BANK_ACCOUNT CASH CHEQUE
  landlordId   String?  @db.Uuid              // set when the landlord collects directly (LANDLORD_COLLECTS)
  name         String
  propertyIds  String[] @db.Uuid              // empty = all properties
  shortcode    String?                        // paybill/till
  bankCode     String?
  accountNo    String?
  accountName  String?
  secretsEnc   Bytes?                         // encrypted Daraja / bank credentials
  secretsKeyId String?
  callbackToken String? @unique               // unguessable path segment for webhooks
  status       RecordStatus @default(ACTIVE)
}
enum ChannelKind { MPESA_PAYBILL MPESA_TILL BANK_ACCOUNT CASH CHEQUE }

model InboundTransaction {                     // raw money-in, immutable
  id           String   @id @default(uuid(7)) @db.Uuid
  orgId        String   @db.Uuid
  channelId    String   @db.Uuid
  source       InboundSource                  // MPESA_STK MPESA_C2B BANK_IPN BANK_STATEMENT
  providerRef  String                         // M-Pesa receipt no. / bank txn id
  amount       BigInt
  payerName    String?
  payerPhone   String?
  accountRef   String?                        // what the payer typed
  occurredAt   DateTime
  raw          Json                           // full payload (PII — restricted access)
  matchStatus  MatchStatus @default(UNMATCHED) // UNMATCHED MATCHED IGNORED
  paymentId    String?  @db.Uuid
  @@unique([channelId, providerRef])           // idempotency for webhooks/imports
}
enum InboundSource { MPESA_STK MPESA_C2B BANK_IPN BANK_STATEMENT }
enum MatchStatus { UNMATCHED MATCHED IGNORED }

model StkRequest {
  id                String  @id @default(uuid(7)) @db.Uuid
  orgId             String  @db.Uuid
  channelId         String  @db.Uuid
  tenantId          String  @db.Uuid
  invoiceIds        String[] @db.Uuid
  phone             String
  amount            BigInt
  checkoutRequestId String? @unique
  state             StkState @default(PENDING) // PENDING SUCCESS FAILED CANCELLED TIMEOUT
  resultDesc        String?
  idempotencyKey    String  @unique
  createdAt         DateTime @default(now())
}
enum StkState { PENDING SUCCESS FAILED CANCELLED TIMEOUT }

model Payment {
  id          String   @id @default(uuid(7)) @db.Uuid
  orgId       String   @db.Uuid
  number      String                          // receipt "RCT-2026-000456"
  tenantId    String   @db.Uuid
  channelId   String   @db.Uuid
  method      ChannelKind
  amount      BigInt                          // negative = reversal/refund
  reference   String?                         // cheque no., M-Pesa code, slip no.
  paidBy      String?
  receivedAt  DateTime
  reversesId  String?  @db.Uuid
  recordedById String? @db.Uuid               // null when automatic
  allocations PaymentAllocation[]
  @@unique([orgId, number])
}

model PaymentAllocation {
  id        String @id @default(uuid(7)) @db.Uuid
  paymentId String @db.Uuid
  invoiceId String @db.Uuid
  amount    BigInt
}

// ───────── Expenses ─────────
model RecurringExpense {
  id          String @id @default(uuid(7)) @db.Uuid
  orgId       String @db.Uuid
  propertyId  String @db.Uuid
  name        String
  description String?
  amount      BigInt
  everyMonths Int                              // 1 monthly, 2, 3 quarterly
  nextDue     DateTime @db.Date
  status      RecordStatus @default(ACTIVE)
}

model Expense {
  id                 String @id @default(uuid(7)) @db.Uuid
  orgId              String @db.Uuid
  propertyId         String @db.Uuid
  recurringExpenseId String? @db.Uuid
  name               String
  description        String?
  amount             BigInt
  incurredOn         DateTime @db.Date
  receiptKey         String?
  voidedAt           DateTime?
  voidReason         String?
  createdById        String @db.Uuid
}

// ───────── Platform billing ─────────
model Plan {
  id               String @id @default(uuid(7)) @db.Uuid
  name             String
  pricePerUnit     BigInt                      // per occupied unit per month
  minimumMonthly   BigInt @default(0)
  trialDays        Int    @default(30)
  active           Boolean @default(true)
}

model PlatformInvoice {
  id            String @id @default(uuid(7)) @db.Uuid
  orgId         String @db.Uuid
  number        String @unique
  period        String
  occupiedUnits Int
  rate          BigInt
  total         BigInt
  amountPaid    BigInt @default(0)
  dueDate       DateTime @db.Date
  status        InvoiceStatus @default(ISSUED)
  @@unique([orgId, period])
}

// ───────── Cross-cutting ─────────
model AuditLog {
  id         String   @id @default(uuid(7)) @db.Uuid
  orgId      String?  @db.Uuid
  actorId    String?  @db.Uuid
  action     String                           // "payment.create", "role.update"
  entity     String
  entityId   String?
  before     Json?
  after      Json?                            // secrets/PII redacted
  ip         String?
  createdAt  DateTime @default(now())
}

model Notification {
  id        String   @id @default(uuid(7)) @db.Uuid
  orgId     String?  @db.Uuid
  userId    String?  @db.Uuid
  channel   String                            // SMS EMAIL PUSH IN_APP
  template  String
  payload   Json
  status    String                            // QUEUED SENT FAILED
  sentAt    DateTime?
}

enum RecordStatus { ACTIVE INACTIVE }
```

Relations (`@relation`) are omitted above for readability; they are added when the schema file is created.

---

## 6. Web frontend (`frontend/`)

### 6.1 Stack — mirror `pos-react`

React 19 + TypeScript + Vite + React Router 7 + TanStack Query 5, the same as `UltimatePOS/pos-react`, so components and patterns can be lifted directly. Styling is **hand-written CSS on design tokens**, as in `pos-react` (no Tailwind-first utility soup).

### 6.2 Design system — UltimatePOS

Copied from `pos/UltimatePOS/pos-react` (the same design petropay adopted in its 2026-10-12/13 sub-projects):

| Layer | Source file(s) | Notes |
|---|---|---|
| Tokens | `src/styles/tokens.css` | Navy `#002b4d` primary, lime `#84bd00` in dark, `--nav-background` stays navy in both themes; radii, shadows, text scale. Till-only `--till-*` tokens dropped |
| Font | `src/styles/fonts.css`, `public/fonts/Lufga*.woff` | **Lufga is a commercial typeface; licence coverage for a new product is unconfirmed** — owner to confirm before production, system sans fallback works if removed |
| Shell | `shell.css`, `sidebar.css`, `components/shell/*` | 252px navy sidebar with expandable groups, collapsible to 68px icons, 64px top bar with title/subtitle + ⌘K palette, phone drawer ≤ 860px |
| Primitives | `form.css`, `admin.css` + `components/{Sheet,Toast,EmptyState,ConfirmDelete,RowActions,DateRangeFilter,ListTotals}.tsx`, `DialogBehaviour.tsx` | Buttons, fields, tables, badges, modals/sheets, toasts, pagination |
| Dashboards | `dashboard.css` | Stat tiles, charts (hand-made SVG, no chart library) |
| Auth screens | `auth.css`, `features/auth/*` | Split brand panel + form |

### 6.3 Three shells in one app

| Shell | Who | Main navigation |
|---|---|---|
| **Org app** `/app` | Owner, manager, accountant, caretaker (menu filtered by permission) | Dashboard · Landlords (agencies only: landlords, agreements, owner statements, remittances) · Properties (properties, units, categories) · Tenants (tenants, tenancies, move-in/out) · Billing (invoices, invoice run, meter readings, charges) · Money (payments, reconciliation, channels) · Expenses · Reports · Settings (organisation, users, roles, billing/plan) |
| **Tenant portal** `/me` | Tenants | Home (balance, next due) · Invoices · Statement · Receipts · Pay (M-Pesa STK) · Profile |
| **Owner portal** `/owner` | Landlords of an agency | Home (collected this month, payable balance, occupancy) · Properties & units · Owner statements · Remittances · Expenses on my properties |
| **Platform admin** `/admin` | CloudvaLabs staff | Organisations · Plans · Platform invoices · Support sessions · Audit |

All screens are mobile-responsive; the tenant portal is designed phone-first.

### 6.4 API client

Generated TypeScript types from the backend's `openapi.json` (`openapi-typescript`) + a thin `fetch` client like `pos-react/src/lib/api/client.ts` (token refresh, `ApiError`). TanStack Query with `mutations.retry = 0` for anything that moves money (lesson already written into pos-react's README).

---

## 7. Mobile (`mobile/`)

The Flutter app keeps its screens and flows (they are the product knowledge) but its data layer is replaced:

- Generate a Dart client from `openapi.json` (`openapi-generator` dart-dio) — replaces hand-written models and `authenticated_repo.dart`.
- Replace the 1,648-line `AuthenticatedAppProviders` with per-feature providers/notifiers.
- Money as integer minor units; formatting in one helper.
- Add a **tenant mode** (the legacy app was staff-first; tenants now pay rent from it via STK).
- Move flavour base URLs to the new hosts.
- **Security fixes before any release:** remove `android/my-release-key.jks` and `keystore_setup.txt` from version control, rotate the upload key with Google Play if the old repo was ever shared, keep signing material in CI secrets.

The mobile refactor gets its own spec after the backend modules it needs exist.

---

## 8. Personal data and compliance

The platform stores Kenyan national ID / passport numbers, phone numbers, emails, addresses (unit + property), payment history and M-Pesa payer names — **personal data under the Kenya Data Protection Act 2019**, and processes payment data. Design measures:

- **Encryption:** TLS everywhere; Cloud SQL encryption at rest; **field-level encryption (Cloud KMS envelope)** for `Tenant.idNumber`, `Landlord.idNumber`, landlord payout details and channel secrets; Cloud Storage buckets private with signed URLs (meter photos, receipts).
- **Access control:** permission guard on every route; `InboundTransaction.raw` only visible to `reconciliation:view`; tenants only ever see their own records.
- **Logging:** pino redaction for `password`, `otp`, `idNumber`, `phone` (masked), `secrets*`, `Authorization`; never log webhook bodies in full at info level.
- **Audit log** on every create/update/delete of money, roles, channels and tenant records.
- **Retention & erasure:** tenant deletion anonymises personal fields but keeps financial records (legal/tax obligation) — exact retention periods to be confirmed with Legal.
- **Cross-border storage** (GCP has no Kenyan region, §4.6), **ODPC registration as a data controller/processor, and the tenant- and landlord-facing privacy notices** are legal questions — **recommend the owner consult Legal/Compliance** before go-live; this design does not settle them.

---

## 9. Delivery plan (each phase gets its own spec → plan → build → check)

| Phase | Deliverable | Depends on |
|---|---|---|
| **0. Foundation** | Monorepo folders; NestJS + Prisma + Postgres via docker-compose; config, logging, error format, pagination, OpenAPI; Dockerfile; CI (lint, test, build); GCP `dev` project (Cloud Run, Cloud SQL, Firebase Hosting). `frontend/` scaffold with UltimatePOS tokens, fonts, shell and primitives; login page | — |
| **1. Identity** | Organisations (landlord/agency), users, memberships, roles/permissions, auth (password, OTP, refresh), org switching, audit log; web: login, users, roles, org settings | 0 |
| **2. Portfolio** | Landlords (agencies), properties, unit types/categories, features, units, tenants, tenancies (move-in/out); web screens | 1 |
| **3. Billing** | Charge types, move-in charges, meters + readings (photo upload), invoice run job, invoices, credit notes, invoice PDF; web screens | 2 |
| **4. Payments (manual)** | Channels, manual payments (cash/cheque/bank slip), allocation, credit balance, receipts PDF, tenant statement; SMS receipts | 3 |
| **5. M-Pesa** | Daraja STK push + callback + query, C2B register/validation/confirmation, InboundTransaction, auto-matching, reconciliation screen; tenant "Pay" | 4 |
| **6. Expenses & reports** | Recurring + one-off expenses; dashboard, property P&L, arrears/aging, occupancy, exports | 4 |
| **6b. Agency accounting** | Management agreements, landlord ledger, commission on allocation, owner statements (PDF), remittances (draft → approve → pay, manual first), owner portal `/owner` | 4, 6 |
| **7. Tenant portal** | `/me` web shell; notifications (SMS reminders before due date, overdue) | 4–5 |
| **8. Platform billing** | Plans, platform invoices, Hodi paybill, grace/suspend; admin shell | 5 |
| **9. Mobile refactor** | Flutter on the new API, staff + tenant modes | 5–7 |
| **10. Banks & payouts** | BankAdapter interface + first bank(s); CSV statement import for the rest; automated remittance payouts (M-Pesa B2C, bank transfer API) | 5, 6b |
| **11. Landing** | Marketing site | any |

The ordering keeps something demoable at the end of every phase and puts money-moving code (5, 8, 10) after the ledger (3–4) is tested.

---

## 10. Open questions for the owner

Answered 2026-10-27: agencies are in scope (§5.3); hosting is GCP (§4.6).

1. **Monorepo git:** move `hodi_app/` → `mobile/` with a fresh root repo (simplest), or preserve its history via `git subtree`? (You run git.)
2. **Lufga licence** for a new product — confirm, or pick an open font (e.g. Inter / Plus Jakarta Sans) for the web. Not blocking: phase 0 ships with a system-font fallback.
3. **First banks** to integrate — which banks do the first landlords and agencies use?
4. **Platform pricing:** keep per-occupied-unit pricing like legacy, and what rate? Same for agencies and landlords?
5. **Pro-rating** of first-month rent — on by default or off?
6. **GCP region:** `africa-south1` (Johannesburg, lower latency) or `europe-west1` (full catalogue)? Needs Legal's view on cross-border data either way.
7. **Agency defaults:** is commission usually on rent only, and do agencies hold deposits (default in this design) or pass them to landlords?
