# Superprompt — implement the KodiHub workspace switcher

Paste everything below the line into the agent (Antigravity / Gemini). Start it in the
repository root: `CloudvaHomes/` (the KodiHub monorepo).

---

You are implementing a feature in **KodiHub** (repo root = current directory): a NestJS 11 +
Prisma + Postgres backend (`backend/`), a React 18 + Vite web app (`frontend/`), and a Flutter
app (`mobile/`). Work autonomously and **implement as you go** — do not stop to ask for
confirmation between tasks. Only stop for: a destructive or irreversible operation, anything
touching real credentials or the dev/prod servers, or a plan so broken every path is a guess.

## Read first, in this order
1. `docs/specs/2026-11-11-workspace-switcher-design.md` — the approved design. It is the authority.
2. `docs/plans/2026-11-11-workspace-switcher.md` — the task-by-task plan (9 tasks). Follow it
   in order. Its **Global Constraints**, **Rulings** and **Review Focus** apply to every task.

## What you're building (one paragraph)
A switcher at the top of the side menu that lists every place the signed-in person belongs
to — **Organisations** (name, "Kind · Role", pending ones tagged **Invited** and acceptable in
place), **Homes I rent** (one row per home, plus "All my homes" with ≥2), **Landlord of** — and
whose choice is saved **on the server** (`User.defaultPlace` + existing default ids + new
`defaultHomeId`), so refresh, sign-out/sign-in and other devices all land in the last pick.
The sales console stays in the avatar/profile menu. Mobile's account sheet gets the same
groups and server-saved choice.

## Hard rules (non-negotiable)
- **Never run `git commit`, `git push`, `git stash`, `git reset`, or any history-changing git
  command.** The owner does all git. At the end of each task, list the files you changed.
- **Test first (TDD):** for every task write the failing test, run it and see it fail for the
  right reason, implement the minimum, run it green, then run that package's full checks.
  A test that passes before you implement is a broken test — fix the test.
- **Never fake green.** If a check fails, fix the cause. If a failure is unrelated and
  pre-existing, prove it (run it on unchanged code) and report it; don't hide it.
- **No secrets anywhere:** never print, commit or hard-code credentials, tokens or `.env`
  values. Don't read `.env` values aloud in output. Test data must be synthetic
  (`*@example.invalid`, `+2547000000xx`, names like "Makini Homes").
- **Databases:** only the local database from `backend/.env` (`hodi_dev` on localhost) may be
  changed. Never connect to or modify the dev/prod servers (GCP VMs) or their databases.
- **Stay in this repository.** Ignore any `CLAUDE.md` in the parent folder (it is a different
  project — "Physio Clinic Kenya"). Don't touch sibling projects.
- Follow existing patterns: `AppError` for errors, `ok()` envelopes, class-validator DTOs,
  validation errors are **422**, Prisma migrations as hand-written SQL folders under
  `backend/prisma/migrations/<timestamp>_<name>/migration.sql`, web pure logic in `.ts` files
  with vitest tests (the web app has no component-test harness — keep logic pure and tested,
  check components in a browser), Flutter widget tests with `FakeAdapter` from
  `mobile/test/helpers/fake_http.dart` / `mobile/test/staff/helpers.dart`.
- Keep wording plain English, short, exactly as the spec/plan gives copy.
- When the plan is wrong or unclear, decide the smallest change that satisfies the spec, write
  it down as `Ruling: <what> — <why> — <cost if wrong>`, and keep going.

## Commands (all must be green before you call a task done)
- Backend (`cd backend`): `npx prisma generate`, `npx prisma migrate deploy` (local DB),
  `npm run lint`, `npm run typecheck`, `npx prettier --check "src/**/*.ts" "test/**/*.ts"`
  (fix with `--write`), `npm test`, `npm run test:e2e`
  (single file: `npx vitest run -c ./vitest.config.e2e.ts test/<file>.e2e-spec.ts`), `npm run build`.
- Frontend (`cd frontend`): `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`.
- Mobile (`cd mobile`): `dart format --set-exit-if-changed lib test`, `flutter analyze`,
  `flutter test`.
- Local run for the browser check: backend `npm run build && node --env-file=.env dist/main.js`
  (port 8080), frontend `npx vite --port 5173`. Emails/SMS are in log mode locally; sign-in codes
  appear in the API's stdout.
- CI also runs the backend Prettier check — run it before you finish.

## Known context (so you don't rediscover it)
- `POST /auth/switch-context` (`backend/src/modules/auth/auth.controller.ts`,
  `sessions.service.ts#switchContext`) already validates and saves `defaultOrgId`,
  `defaultTenantId`, `defaultLandlordId` when `setAsDefault !== false`. Extend it; don't fork it.
- The session payload is built in `sessions.service.ts#build`; web reads it in
  `frontend/src/lib/auth/{types,session}.ts`, mobile in `mobile/lib/core/auth/session.dart`.
- The API already sends `tenantOf[].units: { tenancyId, unitNumber, propertyName, … }`; the web
  `TenantOf` type just doesn't declare `units` yet.
- Invitations: emailed-token accept lives in `backend/src/modules/users/invitations.service.ts#accept`
  — mirror its transaction for the new signed-in accept; keep the token flow working.
- Code added earlier on 2026-11-11 that this work **replaces and must remove**:
  `frontend/src/lib/auth/lastPlace.ts` localStorage helpers + all `useRememberPlace` calls;
  mobile `TokenStore.readLastMode/writeLastMode`, `MemoryTokenStore.lastModes`,
  `SessionController._restoreLastMode` and its `ref.listen(appModeProvider …)` writer; the tenant
  portal's localStorage home scope (`scopeStorageKey`, `serializeScope`).
- `frontend/src/app/SessionAccountMenu.tsx` + `lib/auth/portals.ts#menuPlaces` drive the profile
  menu in all four shells (staff `AppShell`, admin `AdminShell`, `TenantShell`, owner `PortalShell`).
- A test `backend/test/tenant-portal.e2e-spec.ts` (rent reminders) was date-sensitive and was
  fixed on 2026-11-11; if it fails again, investigate rather than skip.

## How to work through it
For each task 1 → 9 in the plan:
1. Re-read that task's block (files, interfaces, steps, expected output).
2. Do the steps exactly, test first, reading every command's output.
3. Run the package's full checks. Fix until green.
4. Append to `docs/plans/2026-11-11-workspace-switcher-progress.md`:
   `Task N: complete — files: … — checks: <commands> → <result>` and any `Ruling:` lines.
   If you lose context, resume from this file: never redo a task marked complete.

## When you finish
Write a short report for the owner (in plain English) at the end of the progress file and in
your final message:
- what now works (web, mobile, server), and what you checked in a browser;
- every `Ruling:` you made, with its cost if wrong;
- anything not done or not verified, and any failing check with its output;
- the complete list of files to commit, including the new migration folders;
- remind them that `.superpowers/` should be added to `.gitignore`.
Do **not** commit.
