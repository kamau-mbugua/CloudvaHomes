# Workspace Switcher Implementation Plan

> **For agentic workers:** implement task by task, in order, test-first. Steps use checkbox
> (`- [ ]`) syntax. The owner does ALL git: never `git commit` / `git push`; each task ends by
> listing the files it changed.

**Goal:** one sidebar switcher listing every organisation, home and landlord profile a person
has, whose choice is saved on the server and restored on every sign-in, refresh and device.

**Architecture:** the server already saves the last organisation / tenant account / landlord
(`User.defaultOrgId|defaultTenantId|defaultLandlordId`) via `POST /auth/switch-context`. Add
the *kind* of place (`defaultPlace`) and the chosen home (`defaultHomeId`), expose them plus
pending invitations in the session payload, and let web + mobile land by them. A pure
`workspaceList(session)` builds the switcher's rows; one `WorkspaceSwitcher` component renders
them in the staff sidebar, tenant sidebar and owner-portal header.

**Tech Stack:** NestJS 11 + Prisma 6 + Postgres (backend, vitest unit + e2e); React 18 + Vite +
TanStack Query (frontend, vitest); Flutter + Riverpod (mobile, flutter_test).

**Spec:** `docs/specs/2026-11-11-workspace-switcher-design.md` (approved 2026-11-11). Read it
first; it is the authority. This plan's rulings are marked **Ruling**.

## Global Constraints

- Switcher at the top of the side menu (staff app, tenant portal); owner portal: top-left of
  its header. Sales console / Platform admin stays in the profile (avatar) menu only.
- The pick persists across refresh, sign-out, sign-in and devices → stored on the server.
- Group labels exactly: **Organisations**, **Homes I rent**, **Landlord of**. Tag: **Invited**.
  Row second line: organisation `"<Kind> · <Role>"` (Kind: Landlord / Agency / Short stays),
  home `"Tenant · <organisation>"`, landlord `"Landlord · <agency>"`. "All my homes" row only
  with ≥2 homes. Search box only when there are more than 6 rows.
- Invited row → confirm "Join <organisation> as <role>?" → accept in place.
- A deep link (`/login?next=…`) beats the remembered place.
- Remembered place gone → fall back staff → tenant → owner → platform, never an error.
- Remove the per-device memory added earlier the same day: `frontend/src/lib/auth/lastPlace.ts`
  localStorage use + `useRememberPlace` calls; mobile `readLastMode/writeLastMode` + the
  `appModeProvider` listener in `session_controller.dart`.
- **Ruling:** the spec says one "Homes I rent" row per tenant account; rows are **per home
  (tenancy)** instead, because the tenant portal already scopes by home. So the server also
  saves `defaultHomeId` (a tenancy id). This replaces the tenant portal's device-only home
  choice (`kodihub:tenant-home:<userId>` localStorage), as the owner chose cross-device.
- Synthetic test data only (`*@example.invalid`, `+2547000000xx`).

## Review Focus

1. Remembered organisation left / deactivated → lands in another org or portal, no error
   (Task 3 test `homeFor falls back…`; backend `pickOrg` already handles org).
2. A second device / new sign-in lands where the first device switched (Task 1 e2e).
3. Invitation expired, revoked, or belonging to someone else → refused, nothing activated
   (Task 2 e2e).
4. Operator demoted while `defaultPlace = PLATFORM` → staff app, not a 403 page (Task 3).
5. Remembered home's tenancy ended → "All my homes" (Task 7 test).

---

### Task 1: Server remembers the kind of place and the home

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `User`)
- Create: `backend/prisma/migrations/20261111120000_user_default_place/migration.sql`
- Modify: `backend/src/modules/auth/auth.dto.ts` (`SwitchContextDto`), `auth.controller.ts`
  (`switchContext`), `sessions.service.ts` (`SessionPayload`, `start`, `refresh`,
  `switchContext`, `build`)
- Test: `backend/test/auth.e2e-spec.ts` (new `describe('remembered place')`)

**Interfaces — Produces:**
- Prisma enum `Place { STAFF TENANT OWNER PLATFORM }`; `User.defaultPlace Place?`,
  `User.defaultHomeId String? @db.Uuid`.
- `POST /auth/switch-context` body gains `place?: 'STAFF'|'TENANT'|'OWNER'|'PLATFORM'` and
  `homeId?: string | null` (tenancy id).
- `SessionPayload.user` gains `defaultPlace: Place | null`, `defaultHomeId: string | null`.
- `SessionPayload.invitations: { membershipId: string; organization: { id; name; kind };
  roleName: string }[]` — memberships with `status: 'INVITED'` for this user, org not CLOSED,
  with an invitation that is not accepted, not revoked and not expired.

- [ ] **Step 1: Write failing e2e tests** in `backend/test/auth.e2e-spec.ts`:
  - `saves the place and home and returns them on the next sign-in (another device)`: user
    staff in org A and tenant with one tenancy; `switch-context {tenantId, homeId, place:'TENANT'}`
    → response `user.defaultPlace === 'TENANT'`, `user.defaultHomeId === tenancyId`; a fresh
    `login()` (new session) returns the same two values.
  - `refuses a place the person does not have`: non-operator `{place:'PLATFORM'}` → 404
    (or 403, keep consistent with `AppError.notFound('Account')` style used there); `{homeId}`
    of someone else's tenancy → 404.
  - `lists pending invitations`: org created via `onboardOrg`-style invite for an existing
    user who is staff elsewhere → their session `invitations` has that org with `roleName`;
    after accept it is gone; an expired invitation (set `expiresAt` in the past via prisma) is
    not listed.
- [ ] **Step 2: Run** `cd backend && npx vitest run -c ./vitest.config.e2e.ts test/auth.e2e-spec.ts`
  — Expected: the new tests FAIL (unknown property / missing fields).
- [ ] **Step 3: Implement.** Schema + migration (`CREATE TYPE "Place" AS ENUM (...)`;
  `ALTER TABLE "users" ADD COLUMN "defaultPlace" "Place", ADD COLUMN "defaultHomeId" UUID;`),
  `npx prisma generate`. DTO: `@IsOptional() @IsIn([...]) place`, `homeId` like `tenantId`.
  `switchContext`: validate `place` (`PLATFORM` → user is operator; `TENANT` → has a tenant
  linked; `OWNER` → has an ACTIVE landlord; `STAFF` → has an ACTIVE membership), validate
  `homeId` (tenancy whose tenant has `userId`), and when `setAsDefault !== false` save
  `defaultPlace`/`defaultHomeId` when given. `build()` selects and returns them and the
  invitations list.
- [ ] **Step 4: Run** the file again → PASS; then `npm run lint && npm run typecheck &&
  npx prettier --check "src/**/*.ts" "test/**/*.ts" && npm test && npm run test:e2e` → all green.
- [ ] **Step 5:** list changed files for the owner.

### Task 2: Accept an invitation while signed in

**Files:** Modify `backend/src/modules/users/invitations.service.ts` (new
`acceptMine(userId, membershipId)`), `backend/src/modules/auth/auth.controller.ts`
(`POST /auth/memberships/:membershipId/accept`, bearer auth). Test: `backend/test/auth.e2e-spec.ts`.

**Interfaces — Produces:** `POST /auth/memberships/:membershipId/accept` → `200 { data: SessionPayload }`
switched into that organisation with `place: 'STAFF'` saved.

- [ ] **Step 1: Failing tests:** `accepts my own pending invitation and switches into it`
  (membership → ACTIVE, `joinedAt` set, open invitations `acceptedAt` set, audit
  `user.invitation_accept`, response `activeOrganization.id` = that org, `user.defaultPlace`
  = 'STAFF'); `refuses someone else's, an expired or a revoked invitation` → 404 / 410
  (reuse `INVITATION_INVALID` 410 for expired/revoked; 404 when the membership isn't the
  caller's); the emailed-token flow still passes (existing tests).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** in one transaction mirroring `accept()`
  (claim invitations with `updateMany where acceptedAt null, revokedAt null, expiresAt > now`;
  count 0 → `invalid()`), then `sessions.switchContext(userId, sessionId, ctx.orgId,
  { organizationId, place: 'STAFF' })`. No password needed (already signed in).
- [ ] **Step 4: Run** full backend checks (as Task 1 step 4) → green. **Step 5:** list files.

### Task 3: Web — session fields and the landing rule

**Files:** Modify `frontend/src/lib/auth/types.ts` (`SessionUser.defaultPlace`,
`defaultHomeId`; `SessionPayload.invitations`; `Session.invitations`), `lib/auth/session.ts`
(`toSession` maps `invitations ?? []`; `switchContext` input gains `place?`, `homeId?`; new
`acceptInvitation(membershipId): Promise<Session>` calling Task 2's endpoint),
rewrite `lib/auth/lastPlace.ts` → keep `homeFor`, delete storage helpers. Test: `lastPlace.test.ts`.

**Interfaces — Produces:** `type Place = 'STAFF'|'TENANT'|'OWNER'|'PLATFORM'`;
`homeFor(session: Session): '/app'|'/admin'|'/tenant'|'/owner'` (reads
`session.user.defaultPlace`); `setPlace(place: Place): Promise<Session>` = `switchContext({ place })`.

- [ ] **Step 1: Failing tests** (replace the old ones): `lands in the remembered place` for each
  of PLATFORM→/admin (operator), TENANT→/tenant, OWNER→/owner, STAFF→/app;
  `homeFor falls back when the place is gone` (PLATFORM but not operator → /app; TENANT
  without tenantOf → /app; null → /app; no org but tenantOf → /tenant via existing `landingFor`
  order).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/auth/lastPlace.test.ts` → FAIL.
- [ ] **Step 3: Implement**; update `LoginPage.tsx` and `guards.tsx` `HomeRedirect` to call
  `homeFor(session)`; remove every `useRememberPlace(...)` call and import (AppShell,
  AdminShell, TenantShell, PortalShell).
- [ ] **Step 4: Run** `npx tsc -b && npm run lint && npx vitest run` → green. **Step 5:** list files.

### Task 4: Web — the switcher's rows (pure)

**Files:** Create `frontend/src/app/workspaces.ts`, `workspaces.test.ts`.

**Interfaces — Produces:**
```ts
type WorkspaceRow =
  | { kind: 'org'; id: string; name: string; detail: string; current: boolean }
  | { kind: 'invited'; membershipId: string; orgId: string; name: string; detail: string; roleName: string }
  | { kind: 'home'; tenantId: string; homeId: string; name: string; detail: string; current: boolean }
  | { kind: 'all-homes'; name: string; detail: string; current: boolean }
  | { kind: 'landlord'; landlordId: string; name: string; detail: string; current: boolean };
type WorkspaceGroup = { label: 'Organisations' | 'Homes I rent' | 'Landlord of'; rows: WorkspaceRow[] };
function workspaceList(session: Session, here: 'staff' | 'tenant' | 'owner' | 'admin'): WorkspaceGroup[];
function currentWorkspace(session: Session, here): { badge: string; name: string; detail: string };
function initials(name: string): string; // "Makini Homes" → "MH"
```
Homes come from `session.tenantOf[].units` (add `units` to the `TenantOf` type — the API
already sends `{ tenancyId, unitNumber, propertyName }`); home name `"<unit>, <property>"`.
`current` = org row when `here==='staff'` and id is active; home row when `here==='tenant'`
and `homeId === user.defaultHomeId`; all-homes when tenant and no home chosen; landlord when
`here==='owner'` and id is `activeLandlordId` (add to Session if absent).

- [ ] **Step 1: Failing tests:** groups appear only with rows; labels/details exact (Global
  Constraints); invited rows carry `Invited` semantics (kind `invited`); "All my homes" only
  with ≥2 homes; `current` marking per `here`; kinds map LANDLORD→"Landlord", AGENCY→"Agency",
  HOST→"Short stays".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5:** list files.

### Task 5: Web — `WorkspaceSwitcher` in the three shells

**Files:** Create `frontend/src/app/WorkspaceSwitcher.tsx`, styles in
`frontend/src/styles/` (follow `sb__` naming, e.g. `styles/sidebar.css` or wherever `.sb__brand`
lives). Modify `app/Sidebar.tsx` (replace `sb__brandname` title with the switcher when a
`switcher` prop is passed; the admin area passes none and keeps "KodiHub admin"),
`app/AppShell.tsx`, `features/tenant/TenantSidebar.tsx` (replace the "Showing" `<select>`),
`app/PortalShell.tsx` (owner: replace the org name + landlord `<select>`).

**Interfaces — Consumes:** Task 3 `switchContext`, `acceptInvitation`; Task 4 `workspaceList`,
`currentWorkspace`. **Produces:** `<WorkspaceSwitcher here collapsed />`.

Behaviour: closed shows badge + name + detail + chevron; collapsed sidebar shows only the badge.
Open: a `role="menu"` popover, groups with `<h5>` labels, `menuitemradio` rows with tick on
current, search input when rows > 6 (filters by name/detail, case-insensitive), arrow keys /
Enter / Escape, focus back to trigger. Choosing:
- org → `switchContext({ organizationId, place: 'STAFF' })` → navigate `/app`;
- home → `switchContext({ tenantId, homeId, place: 'TENANT' })` → `/tenant`;
- all homes → `switchContext({ tenantId: null, homeId: null, place: 'TENANT' })` → `/tenant`;
- landlord → `switchContext({ landlordId, place: 'OWNER' })` → `/owner?landlord=<id>`;
- invited → confirm dialog "Join <name> as <role>?" (existing `Sheet` or `ConfirmDelete`-style
  component) → `acceptInvitation` → `/app`, toast "You joined <name>.".
Toast "Switched to <name>." on success; on error `toast.failed(errorMessage(e))`.

- [ ] **Step 1:** add any remaining pure logic (search filter `filterRows(groups, q)`) to
  `workspaces.ts` with tests first; run → FAIL → implement → PASS.
- [ ] **Step 2:** build the component and wire the three shells; `npx tsc -b && npm run lint &&
  npx vitest run && npm run build` → green.
- [ ] **Step 3: Browser check** (local stack: `backend: npm run build && node --env-file=.env
  dist/main.js`; `frontend: npx vite --port 5173`) with a local user who is staff in 2 orgs,
  tenant in 2 homes, and has 1 pending invite: every row present; switching each kind works;
  sign out → sign in returns to the last pick; open in a second browser profile → same place.
- [ ] **Step 4:** list files.

### Task 6: Web — profile menu clean-up

**Files:** Modify `app/SessionAccountMenu.tsx`, `app/AccountMenu.tsx`, `lib/auth/portals.ts`
(`menuPlaces`) and `portals.test.ts`.

- [ ] **Step 1: Failing tests** for `menuPlaces(session, here)`: outside the admin area →
  `{ organizations: 'none', staffApp: false, ownerPortal: false, tenantPortal: false, platform }`
  (switcher owns that); in the admin area → `backTo: { label: 'Back to <name>', … }` naming the
  remembered place (org name / home / landlord; fallback first available), and `list: true`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; "Sales console"/"Platform admin" click
  calls `setPlace('PLATFORM')` then navigates `/admin`; admin profile menu renders "Back to …"
  plus the same groups (reuse `workspaceList(session,'admin')` rendering from Task 5).
- [ ] **Step 4: Run** web checks → green. **Step 5:** list files.

### Task 7: Tenant portal home scope from the server

**Files:** Modify `features/tenant/useHomeScope.ts`, `features/tenant/scope.ts`,
`scope.test.ts`, `TenantShell.tsx`.

- [ ] **Step 1: Failing tests** in `scope.test.ts`: `resolveScope(session.user.defaultHomeId,
  options)` → that home when it is still lived in; ended tenancy or null → ALL_HOMES (Review
  Focus 5). Remove `scopeStorageKey`/`serializeScope` tests.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**: `useHomeScope` reads
  `session.user.defaultHomeId`; `setScope` calls `switchContext({ tenantId, homeId, place:
  'TENANT' })` (or nulls for all). Keep the legacy `?account=` link: convert it into that call
  once, then drop the param. Delete localStorage use.
- [ ] **Step 4: Run** web checks → green. **Step 5:** list files.

### Task 8: Mobile

**Files:** Modify `mobile/lib/core/auth/session.dart` (`SessionUser.defaultPlace`,
`defaultHomeId`; `Session.invitations`; `TenantAccountRef.units`), `session_controller.dart`
(`effectiveMode`: when `chosen == null`, map `defaultPlace` PLATFORM→platform (operator),
TENANT→tenant, OWNER→owner, STAFF→host/staff; `switchContext` gains `place`, `homeId`; new
`acceptInvitation(String membershipId)`, `setPlace(String place)`; **delete** `_restoreLastMode`
and the `ref.listen(appModeProvider…)` writer), `token_store.dart` (delete `readLastMode`,
`writeLastMode`, `lastModes`), `core/widgets/account_sheet.dart` (groups/labels from Global
Constraints; Invited rows with confirm; Platform card tap → `setPlace('PLATFORM')`; org/home/
landlord taps pass `place`). Tests: `test/core/session_test.dart`, `test/core/router_test.dart`.

- [ ] **Step 1: Failing tests:** replace `signing in again returns to the workspace chosen last`
  with `lands in the server's defaultPlace` (fake `/auth/login` returns `defaultPlace:
  'PLATFORM'` for a salesperson with an org → `modeProvider == AppMode.platform`; demoted
  operator → staff); account sheet test: Platform tap posts `/auth/switch-context` with
  `{place: 'PLATFORM'}`; invited row shows "Invited" and accept posts to
  `/auth/memberships/<id>/accept`.
- [ ] **Step 2: Run** `cd mobile && flutter test` → new tests FAIL.
- [ ] **Step 3: Implement.** **Step 4:** `dart format --set-exit-if-changed lib test &&
  flutter analyze && flutter test` → green. **Step 5:** list files.

### Task 9: Final verification

- [ ] Backend: `npm run lint && npm run typecheck && npx prettier --check "src/**/*.ts"
  "test/**/*.ts" && npm test && npm run test:e2e && npm run build`.
- [ ] Frontend: `npx tsc -b && npm run lint && npx vitest run && npm run build`.
- [ ] Mobile: `dart format --set-exit-if-changed lib test && flutter analyze && flutter test`.
- [ ] Walk the spec section by section; every requirement maps to a task above.
- [ ] Report to the owner: what changed, every **Ruling** made, anything not verified, and the
  full list of files to commit (including the new migration folder).
