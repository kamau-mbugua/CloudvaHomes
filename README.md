# Hodi — rental management platform

Monorepo for Hodi (CloudvaLabs): rent billing, collections (M-Pesa, banks), agency accounting
and reporting for Kenyan landlords and letting agencies.

| Folder | What | Stack |
|---|---|---|
| `backend/` | API | NestJS 12, Prisma 7, PostgreSQL 16 |
| `frontend/` | Web app — org staff, tenants, landlords, platform admin | React 19, Vite, TanStack Query; UltimatePOS design |
| `mobile/` | Flutter app (today: `hodi_app/`, to be moved and refactored) | Flutter |
| `landing/` | Marketing site (later) | — |
| `infra/` | GCP setup and local Docker helpers | Cloud Run, Cloud SQL, Firebase Hosting |
| `docs/` | Design specs, plans, legacy API reference | — |

## Start here

- Design: `docs/specs/2026-10-27-hodi-platform-design.md`
- Current phase plan: `docs/plans/2026-10-27-phase-0-foundation.md`
- How the old Hodi worked: `docs/legacy/hodi-legacy-openapi.yaml` (reference only)

## Run everything locally

```bash
docker compose up -d                                   # Postgres 16

cd backend && cp .env.example .env && npm install
npx prisma generate && npm run start:dev               # API → http://localhost:8080/api/v1

cd ../frontend && npm install && npm run dev           # Web → http://localhost:5173 (proxies /api to :8080)
```

Each app's README has its commands and conventions. CI (`.github/workflows/ci.yml`) runs lint,
type-check, tests and builds for both apps; `deploy-dev.yml` deploys `develop` to GCP once
`infra/gcp/README.md` has been followed.
