# Brief for Antigravity — build "Hosts and short stays" in KodiHub

You are implementing a planned feature in an existing, production codebase. A design and a
task-by-task plan are already written and approved by the owner. Your job is to **build
exactly that plan, task by task, test-first**, and leave a clear record. Another agent
(Claude) will verify your work afterwards and fix what it finds — so honesty in your record
matters more than looking finished.

Read this whole brief before touching anything.

---

## 1. What KodiHub is

KodiHub (formerly "Hodi" — you will still see `hodi` in some names) is a Kenyan
property-management platform by CloudvaLabs. Monorepo at the repository root:

| Folder | What | Stack |
|---|---|---|
| `backend/` | API | NestJS 12, Prisma 7 (`@prisma/adapter-pg`), Postgres, Vitest |
| `frontend/` | Staff web app, owner portal, tenant portal, admin | React 19, Vite, TanStack Query, React Router, Vitest |
| `mobile/` | Staff and tenant app | Flutter, Riverpod, go_router |
| `infra/vm/` | Two GCP VMs (prod, dev) with Docker Compose and a Caddy edge | Caddy 2 |
| `docs/specs/`, `docs/plans/`, `docs/testing/` | Designs, plans, test guides | Markdown |

Today it serves **landlords** and **agencies** (who manage for landlords) renting units to
**tenants** on monthly tenancies: invoices per month, M-Pesa (Daraja) collection, bank
reconciliation, expenses, reports, a tenant portal, and an owner portal. Phases 1–13 and a
tenant-portal redesign are finished and live on dev.

**Ignore the `CLAUDE.md` in the parent folder (`../CLAUDE.md`).** It belongs to a different
project (Physio Clinic Kenya) and does not apply here.

## 2. What we are building now

A third customer type: **hosts**. A host runs their own small BNB business on KodiHub —
not an Airbnb integration, not a marketplace. They get:

- properties and units ("listings") with **photos, nightly prices** and their own rules;
- **bookings** on a calendar where two stays can never overlap;
- payment terms, booking mode (instant / by request) and cancellation rules **they choose**;
- guest payments going **straight to the host's own M-Pesa paybill/till** (KodiHub never
  holds guest money);
- a **branded self-booking site** at `{name}.kodihub.co.ke` (prod) and
  `{name}.dev.kodihub.co.ke` (dev) where guests see photos, pick dates, confirm their
  phone with an SMS code, and book and pay — **no guest account, no app**;
- expenses per unit, profit reports, a guest list, cleaning tasks, caretaker access;
- everything on **web and mobile** for the host; the guest site is web (phone browsers).

**Read these two files completely before starting. They are the source of truth:**

1. `docs/specs/2026-11-06-hosts-short-stays-design.md` — the approved design (the *why* and
   the *what*). When the plan and the spec disagree, **the spec wins**.
2. `docs/plans/2026-11-06-hosts-short-stays.md` — the approved plan: 21 tasks in 4 parts,
   each with exact files, interfaces (names, signatures, endpoints, permissions), tests with
   exact values, and verification commands. **Build this, in this order.**

## 3. Rules you must not break

1. **Never run `git commit`, `git push`, `git reset --hard`, `git clean`, or rewrite
   history.** The owner does all git. Leave every change uncommitted in the working tree.
   Where the plan says "Ledger — suggested commit …", write that message into the ledger
   (section 6) instead of committing.
2. **Never deploy and never touch the servers or the dev/prod databases.** No `gcloud`,
   no SSH, no `docker compose` on the VMs, no Cloudflare changes. Local only. Task 16 is
   *prepare and validate locally*, not deploy.
3. **No secrets in code, docs, logs or commits.** The Cloudflare token (`CF_API_TOKEN`)
   lives only in `/opt/hodi/edge/edge.env` on the servers — reference it by name only.
   Use clearly fake values in tests (`test@example.invalid`, `+254700000001`, `user_001`).
4. **Don't change behaviour for landlords, agencies, tenants or owners.** Every existing
   test must stay green. If a change to shared code (M-Pesa pipeline, roles, billing,
   expenses, uploads) is needed, it must be additive and covered by the existing suites.
5. **Keep existing contracts unchanged:** cookie `hodi_rt`, the JWT issuer, `HODI_JSON`,
   `X-Hodi-*` headers, the `HODI-` invoice prefix, existing API paths and response shapes.
6. **Migrations:** hand-written SQL in a **new** folder under `backend/prisma/migrations/`
   (timestamped, e.g. `20261106100000_hosts_short_stays`). Never edit an existing migration.
   Apply with `npx prisma migrate deploy`; regenerate the client with `npx prisma generate`.
7. **Test first.** For every task: write the failing test from the plan, run it, **see it
   fail for the expected reason**, implement, run it green, then run the wider suites the
   plan names. A test that passes before the code exists is a broken test — fix the test.
8. **Do not skip, weaken, or delete tests** to get green. Do not add `.skip`, `.only`,
   `// @ts-ignore`, `eslint-disable`/`oxlint-disable`, or `// ignore:` lints to pass checks.
9. **Do not invent scope.** No Airbnb sync, reviews, card payments, automatic refunds, custom
   domains, Swahili, or short stays inside landlord/agency orgs (spec §3 non-goals).
10. **Ask the owner before** anything destructive, security-sensitive, or outside the
    repository (installing global tools, changing system config). Adding normal project
    dependencies is fine only if the plan needs it — the plan deliberately needs none on the
    server for images.

## 4. Conventions in this codebase (follow them)

**Backend**
- Modules live in `backend/src/modules/<name>/` (controller, service, dto, module); register
  new modules in `backend/src/app.module.ts`. The new module is `src/modules/stays/`.
- **Org scoping:** every org-owned model must be added to `ORG_SCOPED_MODELS` in
  `src/prisma/org-scope.extension.ts`. Queries are auto-filtered by the caller's org.
  Public (signed-out) endpoints find the host by slug inside `withoutOrgScope(...)`, then
  run the rest inside `runWithContext(emptyContext({ orgId }), ...)`
  (`src/common/context/request-context.ts`) — see `stk.service.ts#sweep` for the pattern.
- Auth decorators in `src/modules/auth/decorators.ts`: `@Public()`,
  `@RequirePermission('resource:action')`, `@RequireAnyPermission(...)`. Permissions are
  declared in `src/modules/roles/permissions.ts`.
- Responses: `ok(data)` / `paginated(...)` from `src/common/http/response.ts`. Errors:
  `AppError` (`src/common/errors/app-error.ts`) — `AppError.conflict(message, CODE)`,
  `AppError.fieldInvalid(field, message)`. **Validation errors are HTTP 422**, not 400.
- **Money:** `BigInt` minor units (cents); JSON carries them as strings. M-Pesa takes whole
  shillings → every amount is a multiple of 100. Helpers in `src/common/money/money.ts`.
- **Dates:** `YYYY-MM-DD` date-only strings, Africa/Nairobi. Helpers in
  `src/common/dates/date-only.ts`. Never use the machine's local time zone in logic.
- Human codes: `nextCode(tx, orgId, name, prefix, width)` in `src/modules/portfolio/codes.ts`.
- Rate limiting: `RateLimitService.hit({ key, limit, windowSeconds })`.
- OTP: `OtpService.issue(target, purpose, userId|null)` / `verify(...)`;
  SMS: `NotificationsService.sendSms(phone, text)`; staff push/in-app:
  `NotificationsService.notifyOrgStaff(orgId, { kind, title, body, actionUrl })`.
- M-Pesa: `StkService` (`src/modules/mpesa/stk.service.ts`), `InboundService.receive`
  (`inbound.service.ts`), account-reference guesses in `matching.ts`. Daraja does not sign
  callbacks — the existing code re-queries before trusting a success; keep that.
- Scheduled jobs: `@Public() @UseGuards(JobsGuard) @Controller('internal/jobs')`
  (see `expenses.controller.ts#ExpenseJobsController`). Make every job idempotent.
- Audit every write with `AuditService.record({ action, entity, entityId, after })`.
- Unit tests: `*.spec.ts` next to the code (Vitest). E2E tests: `backend/test/*.e2e-spec.ts`
  using `test/helpers.ts` (`createTestApp`, `resetDb`, `onboardOrg`, `login`, `auth`,
  `lastCode`) and the in-memory SMS `outbox`. M-Pesa is faked by overriding `DarajaClient`
  (copy the `FakeDaraja` pattern from `test/mpesa.e2e-spec.ts`).

**Web**
- Navigation is one model in `frontend/src/app/navigation.ts` (sidebar, routes, palette,
  titles). Built screens are wired in `frontend/src/App.tsx` (`BUILT`). Group-level
  `orgKinds` already exists; the plan adds entry-level `orgKinds`.
- Data: TanStack Query with array keys; invalidation is by **prefix**, so nest related keys
  (e.g. `['stays','bookings', id]` under `['stays','bookings']`).
- API client: `frontend/src/lib/api/client.ts`; money display helpers in `lib/money.ts`.
- Lint (oxlint) is strict: no `setState` directly inside effects, files exporting components
  must only export components (move helpers to `.ts` files), comparators must be pure.
- Charts: `features/reports/TrendChart.tsx` measures its width — reuse it.
- Tests run in `TZ=Africa/Nairobi`.

**Mobile**
- Modes are chosen in `mobile/lib/core/auth/session_controller.dart` (`AppMode`), routing in
  `mobile/lib/core/router.dart` (`redirectFor` is pure and unit-tested).
- **go_router gotcha (this crashed the app before):** routes *inside* a
  `StatefulShellBranch` must not use `parentNavigatorKey: rootNavigatorKey`. Full-screen
  pages go as **top-level** routes instead (see `features/tenant/tenant_routes.dart`).
- **Overflow gotcha:** test key screens at text scale 1.3× and 2×; use `Expanded` for
  right-aligned amounts in rows; no fixed-height text containers.
- Name clash: the app has its own `Page` type — import Flutter material with `hide Page`
  where needed.
- Widget tests use `FakeAdapter` + `pumpWithApi` (see `mobile/test/features/tenant/`).
- Photos: `image_picker` (already a dependency) with `maxWidth: 1600, imageQuality: 80`.

**Copy:** plain English, short, friendly, no jargon, no Swahili. Brand is **KodiHub**.

## 5. Commands

```bash
# Backend (from backend/)
npm run lint && npm run typecheck
npm test                                  # unit
npm run test:e2e                          # e2e (uses its own e2e database)
npx vitest run --config ./vitest.config.e2e.ts test/<file>.e2e-spec.ts   # one e2e file
npx prisma generate && npx prisma migrate deploy
npm run build && node --env-file=.env dist/main.js   # local API on :8080
#   one-time sign-in codes appear in the API log: "sign-in code is NNNNNN"

# Web (from frontend/)
npm run lint && npm run typecheck && npm test && npm run build
npx vite --port 5173                      # guest site locally: http://<slug>.localhost:5173

# Mobile (from mobile/)
flutter analyze --fatal-infos
flutter test
dart format --set-exit-if-changed lib test
# Android emulator reaches the local API at http://10.0.2.2:8080/api/v1
```

Known flaky test: `backend/test/banks-payouts.e2e-spec.ts` has failed once under full-suite
load and passed on rerun. If it fails, rerun it alone and note it in the ledger; any other
failure is real.

## 6. How to work and record progress

Work through **Task 1 → Task 21 in order**. Within a task, do the plan's steps in order.

Keep a ledger at `.superpowers/sdd/2026-11-06-hosts-short-stays/progress.md`. First line:

```
# SDD ledger — plan: docs/plans/2026-11-06-hosts-short-stays.md
```

After each task, append one line:

```
Task <N>: complete (tests: <command> → <result, e.g. 14/14 pass>; suggested commit: <message>)
```

Whenever you deviate from the plan, or the plan is unclear or wrong and you have to decide,
append — before moving on:

```
Task <N>: Ruling: <what you found> — <what you decided and why> — <what it costs if wrong>
```

If a task cannot be finished, write `Task <N>: BLOCKED — <why, what you tried, the exact
error>` and stop to ask the owner rather than guessing past it. If you resume after a break,
read the ledger first and continue at the first task without a `complete` line — never redo
completed tasks.

**A task is complete only when:** every test the plan names exists and was seen failing and
then passing; the plan's `Expected:` outputs matched; lint/typecheck/analyze are clean for
the touched app; and every deviation has a `Ruling:` line.

## 7. Milestones (what "achieved" looks like)

- **After Part 1 (Tasks 1–6):** a person can sign up as a host on web and mobile, add
  properties and listings with photos, prices and rules, and reserve a web address; landlords
  and agencies see no change.
- **After Part 2 (Tasks 7–11):** the host can take bookings by hand, block dates, accept or
  decline requests, take M-Pesa/cash/bank payments, refund, check guests in and out; guests
  get SMS; double booking is impossible.
- **After Part 3 (Tasks 12–16):** at `http://<slug>.localhost:5173` a guest can browse, pick
  dates, confirm their phone, book and pay (with the fake M-Pesa in tests); unpaid holds and
  unanswered requests expire; links preview with photo and name; the Caddy config for
  wildcard HTTPS validates locally.
- **After Part 4 (Tasks 17–21):** expenses per unit, profit per unit/property, guest list,
  cleaning tasks and the how-to-test guide exist; all three apps' full suites are green.

## 8. When you finish (or stop)

Write a handoff report at `docs/plans/2026-11-06-hosts-short-stays-handoff.md` for the
verifying agent and the owner, containing:

1. Tasks completed, and any not completed (with why).
2. Every `Ruling:` from the ledger, verbatim.
3. Final test results with exact counts for: backend unit, backend e2e, frontend tests +
   build, mobile tests + analyze (paste the summary lines, not "all passed").
4. New migrations, new env variables (`SITE_DOMAIN`, `WEB_INDEX_URL`, `VITE_SITE_DOMAIN`,
   `CF_API_TOKEN` on the edge only), new cron jobs, new permissions.
5. What you checked by hand (browser, simulator/emulator) and what you did not.
6. Known gaps, shortcuts, or things you are unsure about. Be specific — the verifier will
   look there first.
7. A list of every file created or changed (`git status --short` output is fine).

Do not claim something works unless you ran it and saw it work. "Should work" is not done.
