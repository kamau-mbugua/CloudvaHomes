# Hodi API (`backend/`)

NestJS 12 (ESM) + Prisma 7 + PostgreSQL. Design: `../docs/specs/2026-10-27-hodi-platform-design.md`.

## Run locally

```bash
docker compose up -d              # from repo root: Postgres 16 (hodi_dev + hodi_test)
cp .env.example .env              # once
npm install
npx prisma generate               # client is generated into src/generated (git-ignored)
npm run prisma:migrate            # apply/create migrations (from phase 1 on)
npm run start:dev                 # http://localhost:8080/api/v1 · docs at /api/docs
```

No Docker? Any Postgres works — create a `hodi` role (with `CREATEDB`, needed for Prisma's
shadow database) and the `hodi_dev` / `hodi_test` databases, and point `DATABASE_URL` at it.

## Commands

| Command | What it does |
|---|---|
| `npm run lint` | oxlint (type-aware, warnings fail) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (Vitest, `src/**/*.spec.ts`) |
| `npm run test:e2e` | e2e tests (`test/**/*.e2e-spec.ts`) against a real database — set `TEST_DATABASE_URL` to keep them off your dev data |
| `npm run build` | compile to `dist/` |
| `npm run openapi:export` | after `build`: write `openapi.json` (no database needed, but the env must validate — locally `node --env-file=.env dist/scripts/export-openapi.js`) |
| `npm run format` | Prettier |
| `npm run cli:create-platform-admin -- --email … --phone …` | after `build`: create/promote a platform admin (password from `HODI_ADMIN_PASSWORD`) |

## Conventions (enforced in `src/common` and `src/app.setup.ts`)

- All routes under **`/api/v1`**. Liveness `GET /api/v1/health`, readiness `GET /api/v1/health/ready`.
- **Responses:** `ok(data)` → `{ data }`; `paginated(items, total, query)` → `{ data, meta: { page, pageSize, total, pages } }`. Pages are 1-based; `PaginationQueryDto` caps `pageSize` at 100.
- **Errors:** throw `AppError(status, CODE, message, details?)` (or a Nest HTTP exception). Every failure leaves as `{ error: { code, message, details? }, requestId }`. Validation failures are `422 VALIDATION_FAILED` with `details: [{ field: "lines[0].amount", message }]`. 5xx bodies never contain internals; the log has them, keyed by request id.
- **Money:** `BigInt` minor units (`src/common/money/money.ts`). BigInt fields serialise as JSON integers automatically; values beyond 2^53 throw rather than lose precision.
- **Request ids:** honours `X-Request-Id`, else generates one; echoed in the response header and error body.
- **Logging:** pino via `nestjs-pino`. JSON with Cloud Logging `severity` in production, pretty in dev; secrets and personal data are redacted (`src/common/logging/logger.options.ts`). Health probes are not logged.
- **Config:** `src/config/env.ts` validates the environment at boot and lists every problem at once. Empty values (`KEY=`) count as unset. Inject with `@Inject(ENV)`.
- **ESM:** relative imports end in `.js` (Node ESM resolution).

## Identity & access (phase 1) — rules for every feature module

- **Every route requires sign-in** (global `AuthGuard`). Opt out with `@Public()`. Guard routes with
  `@RequirePermission('invoices:create')` (all of), `@RequireAnyPermission(...)`, `@RequireOrg()` or
  `@PlatformAdminOnly()`. Permissions live in `src/modules/roles/permissions.ts` — add new ones there.
- **Use the org-scoped client** `@Inject(DB) db: Db` for all feature data. Add every new org-owned
  model to `ORG_SCOPED_MODELS` in `src/prisma/org-scope.extension.ts`, and extend the cross-org
  suite (`test/access.e2e-spec.ts`, or the module's own e2e file as `test/portfolio.e2e-spec.ts`
  does). Another organisation's id must behave like a missing id (404). Raw SQL is **not** scoped:
  filter by `orgContext().orgId` yourself.
  `PrismaService` (unscoped) is for identity internals only.
- **Sensitive actions** call `requireStepUp()`; the client retries with `X-Step-Up`.
- **Audit** every create/update/delete of business data: `audit.record({...}, tx)` inside the same transaction.
- Caller identity anywhere: `authContext()` / `orgContext()` (`src/modules/auth/decorators.ts`).
- **Property-limited staff:** `Membership.propertyIds` (empty = all) arrives as
  `ctx.propertyIds`. Anything tied to a property merges the filters in
  `src/modules/portfolio/property-scope.ts`; out-of-scope ids behave like missing ones (404).
- **Personal data at rest:** ID numbers (and later payout details and channel secrets) go through
  `FieldCipher` (`src/common/crypto/field-cipher.ts`; keys `FIELD_ENCRYPTION_KEYS`,
  `FIELD_INDEX_KEY`). Store `…Enc` + a blind `…Index` for duplicate checks + a short `…Hint`;
  never put the plain value in responses, logs or audit entries. Reading it back is its own
  endpoint and is audited.
- **Unique races:** pre-check for a friendly 409, and map the index violation with
  `violatesUnique(e, column)` (`src/prisma/errors.ts`) for the race that slips past.
- **Dates and money in DTOs:** `@IsDateOnly()` (`YYYY-MM-DD`, stored `@db.Date`, formatted with
  `formatDateOnly`) and `@IsMinorAmount()` (integer cents → `BigInt`).
- **Money onto invoices** only through `LedgerService` (`src/modules/payments/ledger.service.ts`):
  lock the tenant first (`lockTenant`), then `allocate` / `spend` / `applyCredit`. Never write
  `Invoice.amountPaid`, `Payment.unallocated`, `Tenant.creditBalance` or `Tenancy.depositHeld`
  directly. Payments are never edited or deleted — reverse them.
- **Cross-module hooks** keep the dependency arrow one way: portfolio ← billing ← payments.
  Billing joins move-in via `TenanciesService.onMoveIn`; payments joins invoice issue via
  `InvoiceIssuer.onIssued`.
- Dev messaging uses the `log` adapters: OTP codes and invitation links appear in the API log.

## Docker

```bash
docker build -t hodi-api .                         # runtime image (Cloud Run service)
docker build --target migrate -t hodi-migrate .    # `prisma migrate deploy` (Cloud Run job)
```

Deployment: `../infra/gcp/README.md` and `../.github/workflows/deploy-dev.yml`.
