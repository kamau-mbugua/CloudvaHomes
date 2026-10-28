# Phase 0 — Foundation (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` (§3, §4.1–4.2, §4.6, §6, §9)
**Goal:** an empty-but-production-shaped platform: a NestJS API and a React web app that build, lint, test and run locally, follow every cross-cutting convention from the design, and are ready to deploy to GCP. No domain features (those start in phase 1).

## Toolchain decisions (made while planning)

| Area | Choice | Reason |
|---|---|---|
| Node | 22 LTS in Docker/CI (`engines: >=20.19`) | Node 20 is end-of-life; local dev on 20.19+ still works |
| NestJS | 12, ESM, layout from the official `nest new` scaffold | Current major; official layout = least surprise |
| TypeScript | 6.x (both apps) | What Nest 12 and pos-react use. TS 7 (Go port) skipped until tooling catches up |
| Tests | Vitest (both apps) | Nest 12 scaffold default; same runner as pos-react |
| Lint | oxlint (both apps) + Prettier (backend) | Scaffold / pos-react defaults |
| Prisma | 7.10 (stable), `@prisma/adapter-pg` | npm `latest` currently points at an 8.0 RC — not used |
| Web | React 19, Vite 8, React Router 7, TanStack Query 5 | Mirrors `pos-react` so its code ports directly |

## Backend (`backend/`)

1. Scaffold (package.json, tsconfig, nest-cli, vitest configs, oxlint, prettier) per the Nest 12 template, minus the telemetry vendor note.
2. **Config:** `src/config/env.ts` — zod-validated env (`NODE_ENV`, `PORT`=8080, `DATABASE_URL`, `LOG_LEVEL`, `CORS_ORIGINS`); app refuses to boot on invalid config. `.env.example`.
3. **Logging:** `nestjs-pino`; JSON in prod with Cloud Logging `severity` + trace correlation from `X-Cloud-Trace-Context`; pretty in dev; redaction of `authorization`, `cookie`, `password`, `otp`, `idNumber`, `*secret*`.
4. **Request id:** honour `X-Request-Id` (else generate UUID), echo it in the response header and in every error body.
5. **Errors:** global filter → `{ error: { code, message, details? }, requestId }`; validation errors → `422 VALIDATION_FAILED` with per-field details; unknown errors → `500 INTERNAL` with no internals leaked.
6. **Responses & pagination:** `ok(data)` → `{ data }`; `paginated(items, total, query)` → `{ data, meta: { page, pageSize, total, pages } }`; `PaginationQueryDto` (1-based `page`, `pageSize` ≤ 100).
7. **Money:** BigInt JSON serialisation (as JSON integer; throws above `Number.MAX_SAFE_INTEGER`) + `money.ts` helpers.
8. **Prisma:** `prisma.config.ts`, `prisma/schema.prisma` (datasource + generator only — models arrive in phase 1), `PrismaService` (adapter-pg, lifecycle hooks). *Built without an empty "init" migration — the first migration is created with phase 1's models; `migrate deploy` with no migrations is already verified.*
9. **Health:** `GET /api/v1/health` (liveness, no DB) and `GET /api/v1/health/ready` (DB `SELECT 1`) for Cloud Run probes.
10. **HTTP hardening:** helmet, CORS allow-list from env, body limit, `trust proxy` (Cloud Run), graceful shutdown.
11. **OpenAPI:** Swagger UI at `/api/docs`, JSON at `/api/docs-json` (disabled in prod unless `ENABLE_DOCS=true`); `npm run openapi:export` writes `openapi.json` for client generation.
12. **Tests:** unit — env validation, error filter, pagination, BigInt serialiser; e2e — health, ready (real Postgres), 404 shape, 422 shape, request-id echo.
13. **Dockerfile** (multi-stage, node:22-slim, non-root, `prisma generate`, prod deps only).

## Frontend (`frontend/`)

1. Vite + React 19 + TS scaffold mirroring `pos-react` config (oxlint, vitest).
2. Port the UltimatePOS design layer from `pos/UltimatePOS/pos-react`: `tokens.css` (minus till tokens), `fonts.css` + Lufga woff files (licence note kept), `shell.css`, `sidebar.css`, `form.css`, `admin.css`, `auth.css`.
3. Port primitives: `DialogBehaviour`, `Sheet`, `Toast`, `EmptyState`, `ConfirmDelete`.
4. App shell (sidebar groups, collapse, top bar, phone drawer, theme toggle, account menu) driven by a Hodi navigation model: Dashboard · Landlords · Properties · Tenants · Billing · Money · Expenses · Reports · Settings. Pages are placeholders.
5. Login page (UltimatePOS auth layout, Hodi branding) — UI only; wired in phase 1.
6. `lib/api/client.ts`: fetch wrapper for the new error envelope (`ApiError` with `code`, `details`, `requestId`); dev proxy `/api` → `http://localhost:8080`.
7. `firebase.json` with SPA fallback and `/api/**` → Cloud Run `hodi-api` rewrite.
8. Tests: navigation matching, API error parsing.

## Repo root

- `docker-compose.yml` (Postgres 16 for local dev), root `README.md`, `.gitignore`, `.editorconfig`.
- `.github/workflows/ci.yml`: backend (Postgres service → generate, migrate, lint, typecheck, unit, e2e, build) and frontend (lint, typecheck, test, build) jobs.
- `infra/gcp/README.md`: one-time GCP setup commands (projects, APIs, Artifact Registry, Cloud SQL, Secret Manager, Workload Identity Federation, Firebase) + `.github/workflows/deploy-dev.yml` (build → push → migrate job → deploy Cloud Run → deploy Firebase). **Not executed** — needs the owner's GCP account.

## Not in phase 0

Auth, any domain model, Cloud Tasks/Scheduler wiring, KMS encryption, the `hodi_app` → `mobile/` move (owner runs git).

## Done when

- `backend`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` (against Postgres), `npm run build` all pass; `docker build` succeeds if Docker is available.
- `frontend`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass; login and shell render in light/dark at desktop and 390px.
- Running both locally: the web app loads, `/api/v1/health/ready` returns 200 through the Vite proxy.
