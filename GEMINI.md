# Project Overview

This is the **Hodi / KodiHQ** (CloudvaLabs) monorepo, a rental and short-stay property management platform for Kenyan landlords, letting agencies, and short-stay hosts. It handles rent billing, collections (M-Pesa, banks), agency accounting, tenant/landlord/host portals, short-stay booking sites, SMS notifications, and reporting.

*(Note: The public brand and domain transitioned from **KodiHub** / `kodihub.co.ke` to **KodiHQ** / `kodihq.co.ke`; internal code and packages still use `hodi` and the Android package ID `co.ke.kodihub`.)*

## Working rules (read first)

*   **Never run `git commit` or `git push`.** Leave every change in the working tree; the owner commits.
*   **Build only what you were asked.** When given a brief in `docs/plans/`, implement only the slice named in the request. Don't add features, endpoints or screens that aren't in it; write suggestions in the brief's Progress note instead.
*   **Restate before coding.** List the endpoints, fields, migrations and files you'll touch for the slice, and stop if that doesn't match the brief.
*   **Test the failure paths.** Besides the happy path, test dropped connections, retries, stale or concurrent edits, permissions and property limits wherever the slice touches them.
*   **Report honestly.** Finish by filling the brief's Progress note: what was built, what wasn't, anything done differently and why, and each check you ran (or couldn't).
*   **Don't touch** `hodi_app/` (legacy, read-only) or anything outside this repository.

## Monorepo Structure & Stack

*   **`backend/`**: Core API service (`@hodi/backend`).
    *   **Stack**: NestJS 12 (ESM), Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 16, Express 5, TypeScript 6, Zod 4, Pino, PDFKit, Sharp.
    *   **Modules**: `agency`, `audit`, `auth`, `banks`, `billing`, `expenses`, `files`, `jobs`, `maintenance`, `mpesa`, `notifications`, `organizations`, `payments`, `platform`, `portfolio`, `receipts`, `reports`, `roles`, `stays`, `tenant-portal`, `users`.
*   **`frontend/`**: Web application (`hodi-frontend`) for organization staff, landlords/owners, tenants, short-stay hosts, guest booking sites (`{slug}.kodihq.co.ke`), and platform superadmins.
    *   **Stack**: React 19, Vite 8 (`vite-plugin-pwa`), TypeScript 6, React Router 7, TanStack Query 5. Hand-written CSS on UltimatePOS design tokens (no Tailwind or UI component library).
*   **`mobile/`**: Native mobile app (`hodi`) for Android and iOS covering staff, tenants, owners, hosts, and platform admin.
    *   **Stack**: Flutter (Dart `^3.11.0`, CI pinned to Flutter `3.41.1`), Riverpod, GoRouter, Dio, `flutter_secure_storage`, `printing`, Firebase Core & Messaging.
*   **`landing/`**: Public marketing site (`kodihq.co.ke` / `landing.kodihq.co.ke`).
    *   **Stack**: Static HTML/CSS/JS that dynamically loads copy and plan pricing from `GET /api/v1/public/landing` (editable by superadmins under `/admin/settings?tab=landing`). Verified via `node landing/check.mjs`.
*   **`infra/`**: Infrastructure and deployment configuration.
    *   **Stack**: Google Compute Engine VMs (`infra/vm/`) running Docker Compose (`hodi-api`, `hodi-migrate`, `hodi-web`, `hodi-cron`) behind a custom Caddy + Cloudflare DNS-01 edge proxy for wildcard TLS (`*.kodihq.co.ke`), plus local Postgres init scripts (`infra/docker/`).
*   **`docs/`**: Design specs (`docs/specs/`), phase implementation plans (`docs/plans/`), testing notes, and legacy OpenAPI reference (`docs/legacy/`).
*   **`hodi_app/`**: Legacy Flutter app kept strictly as a read-only reference. Do not modify unless explicitly requested.

## Building and Running Locally

### Prerequisites
*   Docker (for local PostgreSQL 16 via `docker-compose.yml`).
*   Node.js (`>=20.19`, CI uses Node 22).
*   Flutter SDK (`^3.11.0`, CI uses `3.41.1`).

### Local Workflow

1.  **Start PostgreSQL (`hodi_dev` and `hodi_test` databases, `TZ=Africa/Nairobi`):**
    ```bash
    docker compose up -d
    ```
2.  **Backend (`http://localhost:8080/api/v1`, Swagger docs at `/api/docs`):**
    ```bash
    cd backend
    cp .env.example .env
    npm install
    npx prisma generate        # Generates client into src/generated
    npm run prisma:migrate     # Apply migrations
    npm run start:dev
    ```
3.  **Frontend (`http://localhost:5173`, proxies `/api` to `:8080`):**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
4.  **Mobile (`mobile/`):**
    ```bash
    cd mobile
    flutter pub get
    # iOS simulator against local API
    flutter run --flavor dev -t lib/main_dev.dart --dart-define=API_URL=http://localhost:8080/api/v1
    # Android emulator against local API
    flutter run --flavor dev -t lib/main_dev.dart --dart-define=API_URL=http://10.0.2.2:8080/api/v1
    ```
5.  **Landing Page (`landing/`):**
    ```bash
    node landing/check.mjs
    cd landing && python3 -m http.server 4000
    ```

## Verification, Testing & Linting Commands

*   **`backend/`**:
    *   Lint: `npm run lint` (`oxlint --type-aware --deny-warnings src/ test/`)
    *   Typecheck: `npm run typecheck` (`tsc --noEmit -p tsconfig.json`)
    *   Format check: `npx prettier --check "src/**/*.ts" "test/**/*.ts"` (or `npm run format` to write)
    *   Unit tests: `npm test` (`vitest run`)
    *   E2E tests: `npm run test:e2e` (`vitest run --config ./vitest.config.e2e.ts`, requires running Postgres with `TEST_DATABASE_URL`)
    *   Build & OpenAPI: `npm run build && npm run openapi:export -- openapi.json`
*   **`frontend/`**:
    *   Lint: `npm run lint` (`oxlint --deny-warnings`)
    *   Typecheck: `npm run typecheck` (`tsc -b`)
    *   Unit tests: `npm test` (`TZ=Africa/Nairobi vitest run`)
    *   Build: `npm run build`
*   **`mobile/`**:
    *   Format check: `dart format --output=none --set-exit-if-changed lib test`
    *   Analyze: `flutter analyze --fatal-infos --fatal-warnings`
    *   Tests: `flutter test`
*   **`landing/`**:
    *   Check HTML/DOM bindings & inline scripts: `node landing/check.mjs`

## Key Architectural & Coding Conventions

### Backend (`backend/`)
*   **ESM Imports**: Relative TypeScript imports must use `.js` extensions.
*   **Routes & Envelopes**: All routes live under `/api/v1`. Wrap responses with `ok(data)` (`{ data }`) or `paginated(items, total, query)` (`{ data, meta }`). Throw `AppError(status, CODE, message, details?)` for errors.
*   **Auth & Scoping**: Every route is protected by the global `AuthGuard` unless decorated with `@Public()`. Use `@RequirePermission(...)`, `@RequireAnyPermission(...)`, `@RequireOrg()`, or `@PlatformAdminOnly()`.
*   **Multi-Tenant DB Access**: Always inject the org-scoped client `@Inject(DB) db: Db` for feature data and register new org-owned models in `ORG_SCOPED_MODELS` (`src/prisma/org-scope.extension.ts`). Cross-org or out-of-property-scope IDs must return `404`. `PrismaService` (unscoped) is reserved for identity/platform internals.
*   **Money & Ledger**: Money is stored and transferred as `BigInt` minor units (cents). Never mutate `Invoice.amountPaid`, `Payment.unallocated`, `Tenant.creditBalance`, or `Tenancy.depositHeld` directly—always go through `LedgerService` (`lockTenant`, `allocate`, `spend`, `applyCredit`). Payments are immutable once recorded (use reversals).
*   **Sensitive Data & Auditing**: Encrypt PII/secrets at rest via `FieldCipher` (`…Enc`, `…Index`, `…Hint`). Record business data mutations via `audit.record({...}, tx)` inside the same transaction. Sensitive operations require `requireStepUp()` (`X-Step-Up`).

### Frontend (`frontend/`)
*   **Auth & Security**: Access tokens live strictly in memory; refresh tokens use `httpOnly` cookies (`credentials: 'include'`). Never store auth tokens in `localStorage`.
*   **Mutations**: TanStack Query mutations never auto-retry (`queryClient.ts`) to prevent double-charging or duplicate financial writes.
*   **Money & Timezone**: Format minor units with `formatKES(minor)`. Tests run under `TZ=Africa/Nairobi`.

### Mobile (`mobile/`)
*   **Money & Idempotency**: Money is integer minor units everywhere (`core/money.dart` formats it). Money-moving `POST` requests include an `Idempotency-Key` and never auto-retry.

## CI/CD & Deployment

*   **CI (`.github/workflows/ci.yml`)**: Path-filtered jobs for `backend`, `frontend`, `mobile`, and `landing` on PRs and pushes to `main` and `dev`.
*   **Deployment (`.github/workflows/deploy.yml`)**: Triggered automatically after CI passes on pushes to `main` (deploys to production VM `hodi-server` -> `kodihq.co.ke`, `app.kodihq.co.ke`, `api.kodihq.co.ke`) or `dev` (deploys to dev VM `hodi-dev-server` -> `landing.kodihq.co.ke`, `dev.kodihq.co.ke`, `dapi.kodihq.co.ke`). Builds Docker images on the GitHub runner, pushes to `ghcr.io`, uploads `infra/vm/` and `landing/`, and runs `/opt/hodi/infra.new/scripts/deploy.sh` over SSH with pre-deploy DB backups and health-check rollback.
