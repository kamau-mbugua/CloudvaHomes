# Tenant Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner preference: inline, no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give tenants a side-menu portal (web) and a 5-tab app (mobile) with a home switcher and a dashboard that adds up every home they rent, plus Documents, Notices and My profile pages.

**Architecture:** The server keeps its per-landlord tenant accounts (`/tenant/accounts/:id/*`, ownership via `TenantPortalService.as`). A few read endpoints are added: per-home status in the overview, a monthly billed-vs-paid series, an activity feed, a tenancy filter on invoices, and tenant notices. The clients hold a **home scope** (`all` or one tenancy) stored on the device; pages fan out over the person's accounts when the scope is `all`.

**Status:** DONE (2026-11-05, uncommitted on `dev`) — see Outcome at the end.

**Tech Stack:** NestJS 12 + Prisma 7 (Postgres), Vitest; React 19 + Vite 8 + TanStack Query, Vitest (node); Flutter 3.41 + Riverpod + go_router + dio, flutter_test.

**Spec:** `docs/specs/2026-11-05-tenant-portal-redesign-design.md`

## Global Constraints

- Web layout A: side menu, switcher at the top of the menu labelled "All my homes (N) ▾"; mobile: bottom tabs Home, Bills, Payments, Repairs, More; switcher chip at the top of every tenant screen.
- Switcher options: "All my homes (N)" then one entry per tenancy with status `ACTIVE` or `NOTICE`, labelled `<unit>, <property> · <landlord/agency>`. No switcher and no strip when the person has exactly one such home.
- While one home is selected, every tenant page shows: "Showing only **<unit>, <property>** — Show all my homes".
- Scope is stored on the device per signed-in user (web `localStorage` via `readStored`/`writeStored`; mobile `flutter_secure_storage`), never on the server. Default: all.
- Owed and credit are never netted across landlords; every combined amount says who it is owed to.
- Every new tenant endpoint runs inside `TenantPortalService.as(tenantId, …)` or filters by the signed-in `userId`; anything not the person's own is 404.
- Notices shows tenant-facing notifications only (`UserNotification.tenantId IS NOT NULL`).
- Money: BigInt minor units on the server, numbers in JSON; display `KES 1,234.00` via existing `formatKES` / `formatKes`.
- The owner (landlord) portal and its `PortalShell` are not changed.
- No git commits — the owner commits. "Commit" steps below mean: stage nothing, record the task in the ledger.

## Review Focus

1. A person who is a tenant with two landlords and also staff somewhere: Notices must not show staff alerts, and the switcher must list homes from both landlords.
2. A tenant whose only tenancy has ENDED but still owes money: no homes in the switcher, but the dashboard still shows what is owed and to whom.
3. A stored scope pointing at a tenancy that has since ended or been removed: fall back to "all" silently, no blank page.
4. Two homes with the **same** landlord, one selected: Statement/Payments show the whole landlord account with the note "This account also covers <other home>".
5. A notification's `actionUrl` from before the redesign (`/tenant/requests`, `/tenant/invoices/:id`) still lands on the right page on web and mobile.

---

## Part 1 — API

### Task 1: Per-home status in the overviews

**Files:**
- Modify: `backend/src/modules/payments/payments.service.ts` (`openInvoices`: add `tenancyId`)
- Create: `backend/src/modules/tenant-portal/home-status.ts`
- Modify: `backend/src/modules/tenant-portal/tenant-portal.service.ts` (`overview`, `consolidatedOverview`)
- Test: `backend/src/modules/tenant-portal/home-status.spec.ts`, `backend/test/tenant-portal.e2e-spec.ts`

**Interfaces:**
- Produces: `homeStatus(open: { tenancyId: string; balance: bigint; dueDate: string }[], tenancyId: string, today: string): { due: bigint; overdue: bigint; daysLate: number; nextDueDate: string | null }`
- Produces: each tenancy in `GET /tenant/accounts/:id` and `GET /tenant/accounts/overview` gains `due`, `overdue`, `daysLate`, `nextDueDate`; each open invoice gains `tenancyId`. Consolidated tenancies already carry `tenantId`, `tenantCode`, `orgName`; consolidated response also gains `homes: number` (count of ACTIVE/NOTICE tenancies).

- [ ] **Step 1: Write the failing unit test** `home-status.spec.ts`: two open invoices for tenancy `t1` (5,000 due yesterday, 3,000 due in 10 days) and one for `t2`; `homeStatus(open, 't1', TODAY)` → `{ due: 800000n, overdue: 500000n, daysLate: 1, nextDueDate: <TODAY+10> }`; for a tenancy with none → `{ due: 0n, overdue: 0n, daysLate: 0, nextDueDate: null }`.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/modules/tenant-portal/home-status.spec.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `homeStatus` (days late = days since the oldest overdue due date) and wire it into both overviews; add `tenancyId` to `openInvoices` rows.
- [ ] **Step 4: Add e2e assertions** in the existing "sees only their own account" test: the tenancy has `due` equal to its open invoice balance and `overdue` 0 before the due date; `/tenant/accounts/overview` has `homes: 1`.
- [ ] **Step 5: Run** unit + `npm run test:e2e -- test/tenant-portal.e2e-spec.ts` — Expected: PASS.
- [ ] **Step 6: Ledger** `Task 1: complete`.

### Task 2: Billed-vs-paid series and activity feed

**Files:**
- Create: `backend/src/modules/tenant-portal/tenant-insights.ts` (pure helpers)
- Modify: `backend/src/modules/tenant-portal/tenant-portal.service.ts`, `tenant-portal.controller.ts`, `tenant-portal.dto.ts`
- Test: `backend/src/modules/tenant-portal/tenant-insights.spec.ts`, `backend/test/tenant-portal.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /tenant/accounts/overview/monthly?months=6|12&tenancyId=` → `{ period: 'YYYY-MM'; invoiced: number; paid: number }[]` oldest first, exactly `months` entries ending this month. `invoiced` = non-void invoice totals less credits by invoice `period`; `paid` = allocations by the payment's `receivedAt` month (reversals negative). With `tenancyId`: only that tenancy's invoices and allocations to them; 404 if the tenancy isn't the person's.
- Produces: `GET /tenant/accounts/overview/activity?limit=8&tenancyId=` → `{ kind: 'PAYMENT' | 'INVOICE' | 'RENT_CHANGE' | 'NOTICE'; at: string; title: string; amount: number | null; orgName: string; tenantId: string; link: string }[]` newest first. `link` values: `/tenant/payments`, `/tenant/invoices/<id>`, `/tenant`, `/tenant/notices`.
- Produces (pure): `monthlySeries(months: string[], invoices: { period: string; amount: bigint }[], allocations: { month: string; amount: bigint }[])`, `mergeActivity(items, limit)`.
- Routes `overview/monthly` and `overview/activity` must be declared **before** `:id` in the controller.

- [ ] **Step 1: Failing unit tests** in `tenant-insights.spec.ts`: `monthlySeries(['2026-10','2026-11'], [{period:'2026-11',amount:1600000n}], [{month:'2026-11',amount:1000000n},{month:'2026-11',amount:-200000n}])` → `[{period:'2026-10',invoiced:0n,paid:0n},{period:'2026-11',invoiced:1600000n,paid:800000n}]`; `mergeActivity` sorts newest first across kinds and cuts to `limit`.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, the two service methods (loop `mine()` accounts, each inside `as()`; NOTICE items from `UserNotification` where `userId` = me and `tenantId` in my tenant ids; RENT_CHANGE from scheduled `RentChange` rows on my tenancies) and the two routes with a DTO (`months` in {6,12}, default 6; `limit` 1–20, default 8; optional UUID `tenancyId`).
- [ ] **Step 4: e2e** in `tenant-portal.e2e-spec.ts` (after the M-Pesa payment test's setup): monthly has 6 entries and this month's `invoiced` equals the issued invoice, `paid` equals the payment; activity's first item is the PAYMENT; another tenant's `tenancyId` → 404.
- [ ] **Step 5: Run** unit + e2e file — Expected: PASS.
- [ ] **Step 6: Ledger.**

### Task 3: Invoices by home, and tenant notices

**Files:**
- Modify: `backend/src/modules/billing/invoices/invoices.dto.ts` (`ListInvoicesQueryDto.tenancyId?: string`, UUID), `invoices.service.ts` (`list` filters by it)
- Modify: `backend/src/modules/tenant-portal/tenant-portal.dto.ts` (`TenantInvoicesQueryDto.tenancyId`), `tenant-portal.service.ts` (`invoicesList` passes it)
- Create: `backend/src/modules/tenant-portal/tenant-notices.controller.ts` (`@Controller('tenant/notices')`), method on `TenantPortalService`: `notices(q: PaginationQueryDto & { tenantId?: string })`
- Test: `backend/test/tenant-portal.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /tenant/accounts/:id/invoices?tenancyId=` (only that tenancy's invoices).
- Produces: `GET /tenant/notices?page&pageSize&tenantId=` → paginated `{ id; kind; title; body; actionUrl; readAt; createdAt; orgName: string | null; tenantId: string }`, only rows with `userId` = me and `tenantId` not null (and = `tenantId` when given, which must be one of mine, else 404).

- [ ] **Step 1: e2e first:** a tenant with two tenancies under one landlord gets only tenancy A's invoices with `?tenancyId=A`; a notification created for the same user with `tenantId: null` (a staff alert) is absent from `/tenant/notices`, one with the tenant's id is present with `orgName`.
- [ ] **Step 2: Run** — Expected: FAIL (400 on unknown `tenancyId` / 404 on route).
- [ ] **Step 3: Implement.** Register the controller in `tenant-portal.module.ts`.
- [ ] **Step 4: Run** the e2e file and `npm test` — Expected: PASS.
- [ ] **Step 5: Ledger.**

## Part 2 — Web

### Task 4: Home scope model

**Files:**
- Create: `frontend/src/features/tenant/scope.ts`, `frontend/src/features/tenant/scope.test.ts`
- Modify: `frontend/src/features/tenant/types.ts` (add `due`, `overdue`, `daysLate`, `nextDueDate` to `PortalTenancy`; `ConsolidatedOverview` type for `/tenant/accounts/overview`; `MonthlyPoint`, `ActivityItem`, `TenantNotice`)

**Interfaces:**
- Produces: `type HomeScope = { kind: 'all' } | { kind: 'home'; tenantId: string; tenancyId: string }`
- Produces: `homeOptions(o: ConsolidatedOverview): { tenantId: string; tenancyId: string; label: string }[]` (ACTIVE/NOTICE only, label `"G1, Acacia Heights · Ivory Breeze"`)
- Produces: `resolveScope(stored: string | null, options): HomeScope` (unknown/ended → all), `serializeScope(s: HomeScope): string`, `scopeStorageKey(userId: string): string` = `kodihub:tenant-home:<userId>`
- Produces: `accountsInScope(o: ConsolidatedOverview, s: HomeScope): string[]` (tenantIds), `otherHomesOnAccount(o, s): string[]` (labels of the other homes on the selected home's landlord account — for the Statement/Payments note)

- [ ] **Step 1: Failing tests** covering: label format; ENDED tenancy excluded; `resolveScope` of a stored ended tenancy → `{kind:'all'}`; garbage string → all; `otherHomesOnAccount` returns the second home's label when two homes share a tenantId.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/tenant/scope.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Ledger.**

### Task 5: Tenant shell — side menu, switcher, strip

**Files:**
- Create: `frontend/src/features/tenant/TenantShell.tsx`, `frontend/src/features/tenant/TenantSidebar.tsx`, `frontend/src/features/tenant/useHomeScope.ts`
- Modify: `frontend/src/features/tenant/TenantPortal.tsx` (remove old `TenantShell`/`TABS`; pages read the new context), `frontend/src/App.tsx` (lazy import from `TenantShell.tsx`; new routes `documents`, `notices`, `profile`; `requests` stays the path for Maintenance), `frontend/src/styles/tenant.css`
- Test: `frontend/src/features/tenant/scope.test.ts` (shell logic lives in `scope.ts`)

**Interfaces:**
- Consumes: Task 4.
- Produces: outlet context `TenantContext = { overview: ConsolidatedOverview; scope: HomeScope; setScope(s: HomeScope): void; accounts: TenantAccount[] }` via `useTenantContext()`.
- Menu order: Dashboard `/tenant`, Invoices `/tenant/invoices`, Statement `/tenant/statement`, Payments `/tenant/payments`, Maintenance `/tenant/requests`, Documents `/tenant/documents`, Notices `/tenant/notices`, My profile `/tenant/profile`. Top bar keeps the bell, theme and Sign out. Below 1024px the menu is a drawer behind ☰ (reuse the staff `ms`/`sb__` classes).
- The old `?account=` query param is read once and turned into the scope of that account's first home, then dropped (old links keep working).

- [ ] **Step 1:** Add to `scope.test.ts`: `legacyAccountScope('acc2', overview)` → home scope of acc2's first ACTIVE tenancy; unknown → all. Run — FAIL.
- [ ] **Step 2: Implement** `legacyAccountScope` in `scope.ts`, then the shell, sidebar (switcher = `<select>` styled as the staff org switcher, hidden when ≤1 home), strip ("Showing only **…** — Show all my homes" button), and routes.
- [ ] **Step 3: Run** `npm run lint && npx tsc -b && npx vitest run src/features/tenant` — Expected: clean / PASS.
- [ ] **Step 4: Browser check** (local API + Vite, a tenant with two homes): menu shows 8 entries, switcher lists both homes, picking one shows the strip on every page, reload keeps it, "Show all my homes" clears it.
- [ ] **Step 5: Ledger.**

### Task 6: Dashboard and Pay now

**Files:**
- Create: `frontend/src/features/tenant/TenantDashboard.tsx`, `frontend/src/features/tenant/PayChooser.tsx`, `frontend/src/features/tenant/dashboard.ts`, `frontend/src/features/tenant/dashboard.test.ts`
- Modify: `frontend/src/features/tenant/api.ts` (`useConsolidatedOverview()`, `useTenantMonthly(months, tenancyId?)`, `useTenantActivity(limit, tenancyId?)`), `TenantPortal.tsx` (old `TenantHomePage` removed; `HowToPayCard` + `CopyRow` exported for reuse), `App.tsx`
- Reuse: `features/reports/TrendChart.tsx` — add an optional `series` prop so it can draw Billed/Paid only (default unchanged for staff).

**Interfaces:**
- Consumes: Tasks 1–2 endpoints, Task 5 context.
- Produces (pure, `dashboard.ts`): `toPayByLandlord(o: ConsolidatedOverview, s: HomeScope): { tenantId: string; orgName: string; owed: number; credit: number; canPayInApp: boolean }[]` (owed > 0 first, never summed across landlords into one row), `todoItems(o, inspections, today): { kind: 'INSPECTION' | 'OVERDUE' | 'LEASE_ENDING'; text: string; link: string }[]` (lease ending within 60 days), `heroTotal(rows)` (sum of `owed` for display "To pay across N homes", with the per-landlord breakdown underneath when >1 landlord).
- Blocks in order (spec §6.4): hero (Pay now) → My homes cards (scope all only; clicking a card sets the scope) → Billed vs paid (6 months; 12 at ≥1280px) → Recent activity → Maintenance (open count + latest two) → To do (hidden when empty) → Deposit held per landlord.
- Maintenance block and To-do inspections: client fan-out with `useQueries` over `accountsInScope` (`/tenant/accounts/:id/requests`, `/tenant/accounts/:id/tenancies/:tenancyId/inspections`) — a person has few accounts, so no new endpoint (spec §9 leaves this to the builder).
- Pay now: scope = one home → existing `PaySheet` for that account; scope = all → `PayChooser` (one row per landlord with owed > 0: name, amount, **Pay**, and "Other ways to pay" expanding `HowToPayCard`).

- [ ] **Step 1: Failing tests** in `dashboard.test.ts`: two landlords owing 16,000 and 25,500 and one with credit 1,000 → three rows, the credit row is not subtracted from the others; `todoItems` includes an unacknowledged MOVE_IN inspection and a lease ending in 30 days, excludes one ending in 90.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** helpers, hooks, components. **Step 4: Run** lint/tsc/tests — PASS.
- [ ] **Step 5: Browser check:** all-homes dashboard with two landlords shows two owed lines and Pay now opens the chooser; selecting a home shows only its figures and Pay now opens the M-Pesa sheet directly.
- [ ] **Step 6: Ledger.**

### Task 7: Pages follow the scope; Documents, Notices, My profile

**Files:**
- Modify: `TenantPortal.tsx` pages: Invoices (scope all → one list per account via `useQueries`, rows labelled with home + landlord; scope home → `?tenancyId=`), Statement and Payments (scope all → one section per account; scope home → that account with the `otherHomesOnAccount` note; Statement shows the account's **How to pay** card at the top), Maintenance (labelled by home; home scope filters by tenancy and pre-selects it in "Report a repair").
- Create: `frontend/src/features/tenant/TenantDocumentsPage.tsx` (per home: lease PDF and signed lease document if `hasSignedLease`, `TenantInspections` reused), `TenantNoticesPage.tsx` (paged `/tenant/notices`, filtered by `tenantId` when scoped; each row shows org name, time, opens `actionUrl`), `TenantProfilePage.tsx` (name via `PATCH /me`; phone/email read-only with "Ask <landlord> to change these"; change password via the existing password form; list of landlords).
- Modify: `frontend/src/app/NotificationBell.tsx` only if tenant `actionUrl`s need mapping — old `/tenant/requests` and `/tenant/invoices/:id` remain valid routes.
- Test: extend `frontend/src/features/tenant/tenant.test.ts` for any new pure helper (e.g. `noticeLink(actionUrl)`).

**Interfaces:**
- Consumes: Tasks 3–5.

- [ ] **Step 1: Failing test** for `noticeLink`: `/tenant/requests` → `/tenant/requests`; `/tenant/invoices/abc` → `/tenant/invoices/abc`; `null` → `null`; a staff URL `/app/…` → `null` (not opened from the tenant side).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** helper and pages. **Step 4: Run** lint/tsc/full `npx vitest run` and `npm run build` — PASS.
- [ ] **Step 5: Browser check:** two homes with the same landlord, one selected → Statement shows the note naming the other home; Notices lists a broadcast but not a staff alert; Documents shows the inspection with "I've checked this".
- [ ] **Step 6: Ledger.**

## Part 3 — Mobile

### Task 8: Home scope, switcher chip and strip

**Files:**
- Create: `mobile/lib/features/tenant/home_scope.dart`, `mobile/test/tenant/home_scope_test.dart`
- Modify: `mobile/lib/features/tenant/tenant_api.dart` (models gain `due`, `overdue`, `daysLate`, `nextDueDate`, `orgName`, `tenantId` per tenancy; `consolidatedOverview()` calls `GET /tenant/accounts/overview` instead of combining on the phone; replace `selectedTenantHomeKeyProvider`/`chosenTenantProvider` with `homeScopeProvider`)

**Interfaces:**
- Produces: `sealed class HomeScope` with `AllHomes` and `OneHome(tenantId, tenancyId)`; `List<HomeOption> homeOptions(TenantOverview o)`; `HomeScope resolveScope(String? stored, List<HomeOption> options)`; `String serializeScope(HomeScope s)`; storage key `tenant.home.<userId>` in `FlutterSecureStorage`; `homeScopeProvider` (`NotifierProvider<HomeScopeNotifier, HomeScope>`) that loads/saves it.
- Produces widgets: `HomeSwitcherChip` (opens a bottom sheet with the options; hidden for ≤1 home) and `HomeScopeStrip`.

- [ ] **Step 1: Failing tests** mirroring Task 4 (label, ended excluded, stale stored → all, garbage → all) plus a widget test: chip shows "All my homes (2)", choosing a home shows the strip text "Showing only G1, Acacia Heights".
- [ ] **Step 2: Run** `cd mobile && flutter test test/tenant/home_scope_test.dart` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `flutter analyze` clean.
- [ ] **Step 5: Ledger.**

### Task 9: Five tabs, More, and the dashboard

**Files:**
- Modify: `mobile/lib/features/tenant/tenant_shell.dart` (tabs: Home `/tenant`, Bills `/tenant/invoices`, Payments `/tenant/payments`, Repairs `/tenant/requests`, More `/tenant/more`; chip in every app bar), `tenant_routes.dart`, `tenant_home_screen.dart` (rebuilt as the dashboard: same blocks and rules as Task 6, stacked; Pay now = existing pay sheet for one home, a landlord chooser sheet for all)
- Create: `mobile/lib/features/tenant/tenant_more_screen.dart`, `mobile/lib/features/tenant/dashboard_rules.dart` (Dart ports of `toPayByLandlord`, `todoItems`)
- Test: `mobile/test/tenant/dashboard_rules_test.dart`, update `mobile/test/tenant/tenant_home_test.dart`

- [ ] **Step 1: Failing tests:** rules (same cases as Task 6 step 1); widget: home screen with two landlords shows two owed rows and five tabs; More lists Statement, Documents, Notices, My profile, Theme, Sign out.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** full `flutter test` + `flutter analyze` + `dart format --set-exit-if-changed lib test` — PASS.
- [ ] **Step 5: Ledger.**

### Task 10: Mobile pages follow the scope; Documents, Notices, Profile; deep links

**Files:**
- Modify: `tenant_invoices_screen.dart`, `tenant_payments_screen.dart`, `tenant_statement_screen.dart`, `tenant_requests_screen.dart` (same scope rules as Task 7)
- Create: `tenant_documents_screen.dart`, `tenant_notices_screen.dart`, `tenant_profile_screen.dart`; routes `/tenant/documents`, `/tenant/notices`, `/tenant/profile`
- Modify: `mobile/lib/core/notifications/push_service.dart` (`mobileRouteForActionUrl`: add `/tenant/notices`, `/tenant/documents`; keep existing tenant mappings)
- Test: `mobile/test/tenant/tenant_pages_test.dart`, `mobile/test/core/push_routes_test.dart` (or the existing push test file)

- [ ] **Step 1: Failing tests:** `mobileRouteForActionUrl('/tenant/notices')` → tenant mode `/tenant/notices`; `/tenant/requests` still → Repairs; notices screen lists a tenant notice and not a staff one (fake API); statement with one of two same-landlord homes selected shows "also covers".
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** full mobile checks — PASS.
- [ ] **Step 5: Ledger.**

### Task 11: Final verification and docs

- [ ] Backend: `npm run lint`, `npx tsc --noEmit`, `npx prettier --check "src/**/*.ts" "test/**/*.ts"`, `npm test`, `npm run test:e2e`, `npm run build`.
- [ ] Frontend: `npm run lint`, `npx tsc -b`, `npx vitest run`, `npm run build`.
- [ ] Mobile: `dart format --output=none --set-exit-if-changed lib test`, `flutter analyze --fatal-infos --fatal-warnings`, `flutter test`.
- [ ] Browser walk-through as a tenant with two landlords (web) and a simulator run of the tenant tabs (mobile).
- [ ] Add a "Tenant portal" section to `docs/testing/2026-11-05-phase-13-how-to-test.md`; mark this plan DONE with an Outcome section; self-review recorded in the ledger.

## Outcome (2026-11-05)

- Tasks 1–11 done, uncommitted on `dev`. Rulings and deferred minors: `.superpowers/sdd/2026-11-05-tenant-portal-redesign/progress.md`.
- Verification: backend lint/tsc/prettier clean, 190 unit + 136 e2e, build OK; frontend lint/tsc clean, 601 tests, build OK; mobile format/analyze (--fatal-infos) clean, 85 tests, iOS simulator build OK.
- Browser-checked locally with a tenant with two homes at one agency (switcher, strip, statement note, invoices narrowed, notices, dashboard). Not checked by hand: a tenant with two **different** landlords (Pay chooser) and an interactive simulator run — covered by unit/widget tests.
