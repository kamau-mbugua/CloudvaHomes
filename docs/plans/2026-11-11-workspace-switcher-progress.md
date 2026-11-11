# Workspace Switcher — Implementation Progress

Started: 2026-11-11

- Task 1: complete — files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261111120000_user_default_place/migration.sql`, `backend/src/modules/auth/auth.dto.ts`, `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/sessions.service.ts`, `backend/test/helpers.ts`, `backend/test/auth.e2e-spec.ts` — checks: `npx prisma migrate deploy && npx prisma generate && npm run lint && npm run typecheck && npx prettier --check "src/**/*.ts" "test/**/*.ts" && npm test && npm run test:e2e && npm run build` → all green (48 unit files / 266 tests; 31 e2e files / 219 tests)
- Task 2: complete — files: `backend/src/modules/users/invitations.service.ts`, `backend/src/modules/auth/auth.controller.ts`, `backend/test/auth.e2e-spec.ts` — checks: `npm run lint && npm run typecheck && npx prettier --check "src/**/*.ts" "test/**/*.ts" && npm test && npm run test:e2e && npm run build` → all green (48 unit files / 266 tests; 31 e2e files / 221 tests)
- Task 3: complete — files: `frontend/src/lib/auth/types.ts`, `frontend/src/lib/auth/session.ts`, `frontend/src/lib/auth/lastPlace.ts`, `frontend/src/lib/auth/lastPlace.test.ts`, `frontend/src/app/guards.tsx`, `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/app/AppShell.tsx`, `frontend/src/features/admin/AdminShell.tsx`, `frontend/src/features/tenant/TenantShell.tsx`, `frontend/src/app/PortalShell.tsx` — checks: `npx tsc -b && npm run lint && npx vitest run && npm run build` → all green (61 test files passed, 0 lint warnings/errors, build succeeded)
- Task 4: complete — files: `frontend/src/lib/auth/types.ts`, `frontend/src/app/workspaces.ts`, `frontend/src/app/workspaces.test.ts` — checks: `npx tsc -b && npm run lint && npx vitest run && npm run build` → all green (62 test files passed, 0 lint warnings/errors, build succeeded)
  - Ruling: When `session.tenantOf` has accounts with zero active `units` (e.g., an ended tenancy where the tenant still has past statements/receipts), `workspaceList` includes a fallback `all-homes` row named after the organisation — prevents violating Spec §8 anti-goal ("A place the person belongs to that they cannot find from the switcher") — cost if wrong: 8 lines in `frontend/src/app/workspaces.ts` to drop the fallback branch.
- Task 5: complete — files: `frontend/src/app/workspaces.ts`, `frontend/src/app/workspaces.test.ts`, `frontend/src/app/useWorkspaceActions.ts`, `frontend/src/app/WorkspaceSwitcher.tsx`, `frontend/src/app/Sidebar.tsx`, `frontend/src/app/AppShell.tsx`, `frontend/src/features/tenant/TenantSidebar.tsx`, `frontend/src/features/tenant/TenantShell.tsx`, `frontend/src/app/PortalShell.tsx`, `frontend/src/features/owner/OwnerPortal.tsx`, `frontend/src/styles/sidebar.css` — checks: `npx tsc -b && npm run lint && npx vitest run && npm run build` + real Google Chrome browser check against local backend + Vite → all green
  - Ruling: Updated `OwnerPortal.tsx` to fall back to `session.activeLandlordId ?? session.user.defaultLandlordId` when `?landlord=` is absent so landing at `/owner` from `homeFor` opens the server-remembered landlord (`Spec §5`) rather than always `ownerOf[0]` — cost if wrong: 1 line in `frontend/src/features/owner/OwnerPortal.tsx`.
  - Ruling: Extracted `useWorkspaceActions` into `frontend/src/app/useWorkspaceActions.ts` because `oxlint --deny-warnings` enforces `react(only-export-components)` on `.tsx` files — cost if wrong: none (pure file split).
- Task 6: complete — files: `frontend/src/lib/auth/portals.ts`, `frontend/src/lib/auth/portals.test.ts`, `frontend/src/lib/auth/lastPlace.ts`, `frontend/src/app/SessionAccountMenu.tsx`, `frontend/src/app/AccountMenu.tsx`, `frontend/src/styles/shell.css`, `frontend/src/app/PortalShell.tsx` — checks: `npx tsc -b && npm run lint && npx vitest run && npm run build` → all green (62 test files passed, 0 lint warnings/errors, build succeeded)
  - Ruling: Removed the redundant vague `"Staff app"` / `"Owner portal"` / `"Tenant portal"` footer links in `PortalShell.tsx` (and in `TenantShell.tsx` in Task 7) because clicking them bypassed `switchContext`, leaving `User.defaultPlace` stale and contradicting Spec §4 ("the switcher is the one place for that") and Spec §8 anti-goal ("Landing somewhere other than the last pick") — cost if wrong: ~10 lines in `PortalShell.tsx` / `TenantShell.tsx` to restore footer links.
  - Ruling: Recorded the non-admin place in tab memory (`notePriorPlace` in `frontend/src/lib/auth/lastPlace.ts`, no `localStorage`) right before `setPlace('PLATFORM')` overwrites `User.defaultPlace` to `'PLATFORM'`, so `"Back to <name>"` in `/admin`'s profile menu names the exact place the operator just left (e.g. `"Back to All my homes"` when entering from `/tenant`) while cold reloads of `/admin` still fall back to the active/first place — cost if wrong: ~20 lines across `lastPlace.ts`, `portals.ts`, and `SessionAccountMenu.tsx`.
- Task 7: complete — files: `frontend/src/features/tenant/scope.ts`, `frontend/src/features/tenant/scope.test.ts`, `frontend/src/features/tenant/useHomeScope.ts`, `frontend/src/features/tenant/TenantShell.tsx` — checks: `npx tsc -b && npm run lint && npx vitest run && npm run build` → all green (62 test files passed, 0 lint warnings/errors, build succeeded)
- Task 8: complete — files: `mobile/lib/core/auth/session.dart`, `mobile/lib/core/auth/token_store.dart`, `mobile/lib/core/auth/session_controller.dart`, `mobile/lib/core/widgets/account_sheet.dart`, `mobile/lib/features/tenant/tenant_api.dart`, `mobile/test/core/session_test.dart`, `mobile/test/core/router_test.dart` — checks: `dart format --set-exit-if-changed lib test && flutter analyze && flutter test` → all green (0 format diffs, 0 analyzer issues, 150 tests passed)
  - Ruling: Updated `mobile/lib/features/tenant/tenant_api.dart` so `homeScopeProvider` falls back to `session.user.defaultHomeId` when no local override is set, and `currentTenantIdProvider` returns `null` before watching `homeScopeProvider` when `tenantOf` is empty — keeps mobile's tenant home strip aligned with the server-saved home across devices and avoids firing `/tenant/accounts/overview` for non-tenant users opening `AccountSheet` — cost if wrong: 12 lines in `mobile/lib/features/tenant/tenant_api.dart`.
- Task 9: complete — full verification across `backend`, `frontend`, and `mobile` + real Chrome check + spec walk → all green

---

## Owner Report

### 1. What now works
- **Server (`backend/`):**
  - `User` now stores `defaultPlace` (`STAFF | TENANT | OWNER | PLATFORM`, nullable) and `defaultHomeId` (tenancy UUID, nullable) via migration `20261111120000_user_default_place`.
  - `POST /auth/switch-context` validates and saves `place` and `homeId` (ensuring callers actually belong to the requested place/tenancy, returning `404` otherwise).
  - Every session payload (`POST /auth/login`, `/auth/login/2fa`, `/auth/otp/verify`, `/auth/refresh`, `/auth/switch-context`, `GET /me`) returns `user.defaultPlace`, `user.defaultHomeId`, and `invitations` (pending `INVITED` memberships whose organisation is open and whose invitation is unaccepted, unrevoked, and unexpired).
  - `POST /auth/memberships/:membershipId/accept` lets a signed-in user accept their own pending invitation in one transaction, records `user.invitation_accept` in the audit log, and switches straight into that organisation with `defaultPlace = 'STAFF'`. The emailed invitation link continues to work unchanged.
- **Web (`frontend/`):**
  - A single `WorkspaceSwitcher` sits at the top of the staff sidebar (`/app`), the tenant sidebar (`/tenant`, replacing the old `"Showing"` `<select>`), and top-left of the owner portal header (`/owner`, replacing the old landlord `<select>`). Collapsed sidebars show the initials badge and open the menu beside it.
  - Closed, it shows initials badge, place name, and second line (`"<Kind> · <Role>"`, `"Tenant · <org>"`, `"All my homes (N)"`, or `"Landlord · <agency>"`). Open, it shows `Organisations` (including `Invited` rows that ask `"Join <org> as <role>?"` and accept in place), `Homes I rent` (one row per lived-in home plus `"All my homes"` when ≥2), and `Landlord of`, with a search box whenever there are more than 6 rows and full keyboard navigation (`ArrowUp`/`ArrowDown`/`Home`/`End`/`Enter`/`Escape`).
  - Profile menu outside `/admin` keeps only who you are, Appearance, `"Sales console"` / `"Platform admin"` (for operators, saving `PLATFORM`), My account, and Sign out. Inside `/admin` (which keeps `"KodiHub admin"` and has no sidebar switcher), the profile menu offers `"Back to <name>"` plus the full grouped workspace list.
  - Tenant home scope and sign-in/root landing (`homeFor`) read from the server session and fall back cleanly (`staff → tenant → owner → platform`, or `ALL_HOMES` if a tenancy ended) with all `localStorage` last-place and tenant-home-scope helpers deleted. Deep links (`/login?next=…`) still win.
- **Mobile (`mobile/`):**
  - `Session`, `SessionController`, and `effectiveMode` read `defaultPlace`, `defaultHomeId`, `invitations`, and `tenantOf[].units` from the server, with all device-only `readLastMode`/`writeLastMode` code removed.
  - `AccountSheet` ("Where do you want to go?") uses the exact groups and copy (`Organisations` with `"<Kind> · <Role>"` and `"Invited"` tag + `"Join <org> as <role>?"` dialog, `Homes I rent` with per-home rows and `"All my homes"` when ≥2, `Landlord of` with `"Landlord · <agency>"`, and `Platform` last for operators), saving choices via `/auth/switch-context` and `/auth/memberships/:id/accept`.
- **Checked in real Google Chrome against local Postgres + NestJS + Vite:**
  - Signed in as a synthetic user with 2 active orgs (`HOST` Owner + `AGENCY` Manager), 1 pending invite (`LANDLORD` Caretaker), 2 homes (`G1, Acacia Heights` + `B4, Palm Gardens`), 1 landlord profile (`Grace Holdings`), and `SALESPERSON` operator role (7 rows total).
  - Verified all 3 group headings, `"Invited"` tag, search box appearing at 7 rows (>6) and filtering to `"B4, Palm Gardens"`, switching between orgs, switching to the owner portal header switcher (old `<select>` gone), confirming `"Join WS Savannah Courts as Caretaker?"` and landing in the newly joined org, switching to a tenant home (old `"Showing"` `<select>` gone, `"Showing only B4, Palm Gardens"` banner shown), signing out and back in to return to `/tenant` on `B4, Palm Gardens`, opening a brand-new second Chrome profile (second device) and landing directly on `/tenant` scoped to `B4, Palm Gardens`, clicking `"Show all my homes"` to sync the switcher to `"All my homes (2)"`, and opening `"Sales console"` from the profile menu into `/admin` (no sidebar switcher; `/admin` profile menu showing `"Back to All my homes"` + all 3 workspace groups). All synthetic rows were cleaned up afterwards.

### 2. Rulings made (and cost if wrong)
1. **Plan Ruling (Global Constraints):** `"Homes I rent"` rows are per lived-in home (tenancy) rather than per tenant account, backed by `User.defaultHomeId` on the server, because the tenant portal scopes by home — *cost if wrong:* revert `defaultHomeId` and group by `tenantId` (~40 lines across backend/web/mobile).
2. **Ended-tenancy fallback row (`Task 4`):** When `session.tenantOf` has an account with zero active `units` (e.g., an ended tenancy with historical statements/receipts), `workspaceList` (and mobile `AccountSheet`) renders a fallback row named after the organisation so the tenant portal is never unreachable — *cost if wrong:* 8 lines in `frontend/src/app/workspaces.ts` (and 15 lines in `mobile/lib/core/widgets/account_sheet.dart`).
3. **Owner portal server-default fallback (`Task 5`):** `OwnerPortal.tsx` falls back to `session.activeLandlordId ?? session.user.defaultLandlordId` when `?landlord=` is absent in the URL so landing at `/owner` from `homeFor` opens the remembered landlord profile — *cost if wrong:* 1 line in `frontend/src/features/owner/OwnerPortal.tsx`.
4. **Hook file split for lint (`Task 5`):** Extracted `useWorkspaceActions` into `frontend/src/app/useWorkspaceActions.ts` to satisfy `oxlint --deny-warnings` `react(only-export-components)` on `.tsx` files — *cost if wrong:* none.
5. **Removed portal footer links (`Tasks 6 & 7`):** Removed the redundant vague `"Staff app"` / `"Owner portal"` / `"Tenant portal"` footer links in `PortalShell.tsx` and `TenantShell.tsx` so clicking them cannot bypass `switchContext` and leave `defaultPlace` stale — *cost if wrong:* ~10 lines in `PortalShell.tsx` and `TenantShell.tsx`.
6. **In-tab prior place for `/admin` `"Back to …"` (`Task 6`):** Recorded the non-admin place in module memory (`notePriorPlace` in `frontend/src/lib/auth/lastPlace.ts`, no `localStorage`) before `setPlace('PLATFORM')` sets `User.defaultPlace = 'PLATFORM'`, so `/admin`'s profile menu names the exact place the operator just came from (while cold reloads fall back to active/first place) — *cost if wrong:* ~20 lines across `lastPlace.ts`, `portals.ts`, and `SessionAccountMenu.tsx`.
7. **Mobile tenant home scope sync (`Task 8`):** `homeScopeProvider` in `mobile/lib/features/tenant/tenant_api.dart` falls back to `session.user.defaultHomeId` when no local override is set, and `currentTenantIdProvider` returns `null` early when `tenantOf` is empty — *cost if wrong:* 12 lines in `mobile/lib/features/tenant/tenant_api.dart`.

### 3. Anything not done, not verified, or failing
- **Failing checks:** None. Every check in all three packages is green:
  - `backend`: `prisma generate`, `prisma migrate deploy`, `npm run lint` (0 warnings/errors), `npm run typecheck`, `prettier --check` (clean), `npm test` (48 files / 266 tests), `npm run test:e2e` (31 files / 221 tests), `npm run build` — all green.
  - `frontend`: `npx tsc -b`, `npm run lint` (0 warnings/errors), `npx vitest run` (62 files passed), `npm run build` — all green.
  - `mobile`: `dart format --set-exit-if-changed lib test` (0 changes needed), `flutter analyze` (0 issues), `flutter test` (150 tests passed) — all green.
- **Not verified on a physical phone/simulator:** Mobile changes are verified via `flutter analyze` and widget/unit tests (`test/core/session_test.dart`, `test/core/router_test.dart`, and the full 150-test suite), not on a running iOS/Android emulator.

### 4. Complete list of files to commit
**Backend (8 files, including migration folder):**
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261111120000_user_default_place/migration.sql`
- `backend/src/modules/auth/auth.dto.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/sessions.service.ts`
- `backend/src/modules/users/invitations.service.ts`
- `backend/test/helpers.ts`
- `backend/test/auth.e2e-spec.ts`

**Frontend (26 files):**
- `frontend/src/app/AccountMenu.tsx`
- `frontend/src/app/AppShell.tsx`
- `frontend/src/app/PortalShell.tsx`
- `frontend/src/app/SessionAccountMenu.tsx`
- `frontend/src/app/Sidebar.tsx`
- `frontend/src/app/WorkspaceSwitcher.tsx`
- `frontend/src/app/guards.tsx`
- `frontend/src/app/useWorkspaceActions.ts`
- `frontend/src/app/workspaces.ts`
- `frontend/src/app/workspaces.test.ts`
- `frontend/src/features/admin/AdminShell.tsx`
- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/owner/OwnerPortal.tsx`
- `frontend/src/features/tenant/TenantShell.tsx`
- `frontend/src/features/tenant/TenantSidebar.tsx`
- `frontend/src/features/tenant/scope.ts`
- `frontend/src/features/tenant/scope.test.ts`
- `frontend/src/features/tenant/useHomeScope.ts`
- `frontend/src/lib/auth/lastPlace.ts`
- `frontend/src/lib/auth/lastPlace.test.ts`
- `frontend/src/lib/auth/portals.ts`
- `frontend/src/lib/auth/portals.test.ts`
- `frontend/src/lib/auth/session.ts`
- `frontend/src/lib/auth/types.ts`
- `frontend/src/styles/shell.css`
- `frontend/src/styles/sidebar.css`

**Mobile (7 files):**
- `mobile/lib/core/auth/session.dart`
- `mobile/lib/core/auth/session_controller.dart`
- `mobile/lib/core/auth/token_store.dart`
- `mobile/lib/core/widgets/account_sheet.dart`
- `mobile/lib/features/tenant/tenant_api.dart`
- `mobile/test/core/router_test.dart`
- `mobile/test/core/session_test.dart`

**Docs (1 file — spec, plan, and superprompt are already committed in `3ad92a8`):**
- `docs/plans/2026-11-11-workspace-switcher-progress.md`

### 5. `.gitignore` reminder
- Reminder: ensure `.superpowers/` is in `.gitignore` so brainstorm mockups are never committed (verified: `.superpowers/` is currently present on line 30 of `.gitignore` and ignored by git).
