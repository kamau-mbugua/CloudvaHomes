# Phase 13 — Bug fixes, staff UX and missing features (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner preference: native/inline, no subagents) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-11-04
**Depends on:** phases 0–12 (done)
**Status:** DONE (2026-11-04, uncommitted on `dev`) — Parts A, B and C implemented; C3 WhatsApp dropped by the owner; C9 push needs owner Firebase/APNs/FCM setup before a real-device check
**Goal:** Fix the four bugs found in the 2026-11-04 system review, make the staff web app faster to work in, and add late fees (per-agreement recipients), lease terms and rent changes, tenant broadcasts (SMS, email, in-app, push), a rental income tax (MRI) report, move-in/move-out inspections (web and mobile), offline meter readings and push on mobile (after renaming the app id to co.ke.kodihub), and an installable web app.

**Architecture:** Follows the existing module rules in `backend/README.md`: org-scoped `Db`, `RequirePermission`, audit, money as BigInt minor units, pure rule files (`*.ts` + `*.spec.ts`) next to services, org preferences in `Organization.settings` JSON read through a `readX(settings)` function (same as `readReminders`), scheduled work as `POST /internal/jobs/<name>` + a line in `infra/vm/cron/crontab`. Frontend tests stay pure (Vitest, node env, no DOM), so every UI decision that can be wrong lives in a tested pure helper and the component is checked in the browser.

**Tech Stack:** NestJS 12, Prisma 7 + Postgres 16, Vitest; React 19 + Vite 8 + TanStack Query; Flutter (Riverpod, go_router, dio).

**Spec:** the 2026-11-04 review (bugs 1–4, UX list, missing features 1, 2, 3, 5, 6, 7, 8, 9) plus `docs/specs/2026-10-27-hodi-platform-design.md` for naming. Swahili (missing feature 4) is out of scope.

## Global constraints

- Owner does all git operations. Each **Part** ends with a "stop for owner commit" step; do not run `git commit`/`git push`.
- Money is `BigInt` minor units (cents) end to end; percentages are basis points (`Int`, 750 = 7.5%).
- New migrations: write SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into `prisma/migrations/<timestamp>_<name>/migration.sql`, then `npx prisma migrate deploy` (memory: `migrate dev` refuses non-interactively on warnings).
- e2e tests run only against a DB whose name contains `test` (`TEST_DATABASE_URL`).
- Naming per design doc: Organization, Unit, Tenant, Tenancy. User-facing copy: plain English, "KodiHub" brand.
- Never cache `/api/*` responses in the browser (PWA) — this is a money app.
- Verification for each part: backend `npm run lint && npm run typecheck && npm test && npm run test:e2e`; frontend `npm run lint && npm run typecheck && npm test && npm run build`; mobile `flutter analyze --fatal-infos --fatal-warnings && flutter test`.

## Decisions (owner answers 2026-11-04 marked ✔)

| # | Topic | Default chosen | Why / what to confirm |
|---|---|---|---|
| D1 ✔ | Late fee rule | Off by default. Per org: `FLAT` amount or `PERCENT` of the invoice's unpaid balance, charged **once** per overdue MONTHLY invoice after `graceDays` (default 5). Issued as its own invoice (kind `LATE_FEE`) so staff can void it to waive. | Owner: once per invoice. |
| D2 ✔ | Who gets late-fee income (agencies) | **Per management agreement, no default.** `ManagementAgreement.lateFeeRecipient` = `LANDLORD` \| `AGENCY` \| unset. In an AGENCY organisation a property gets **no late fees at all** until the agreement covering it says who keeps them; the settings page, the agreement sheet and the run result say so plainly. The recipient is snapshotted on each fee invoice (`Invoice.lateFeeKeptBy`); `AGENCY` fees never touch the landlord ledger. LANDLORD organisations (no agreements) just charge the fee. | Owner: per agreement; "no default, they must be set, only active when the agreement is set; should clearly state this." |
| D3 | Voiding an invoice with a late fee | Voiding the original also voids its late fee if the fee is unpaid. | Avoids orphan penalties. |
| D4 | Rent changes | Scheduled `RentChange` rows (new rent from the first day of a future period). Applied by the invoice run before it bills. Renewal = new `leaseEndDate` (+ optional rent change); no new tenancy. | Keeps one tenancy per stay, so deposits and history stay together. |
| D5 ✔ | WhatsApp | **Dropped from this phase** (task C3 removed). Messages stay SMS, email, in-app and push. | Owner: skip WhatsApp for now. |
| D6 ✔ | Broadcasts | Current tenants (ACTIVE or NOTICE tenancy) of the chosen properties, one message per tenant even with several units. Ignores `remindersOff` (automatic rent reminders only). **Channels: SMS always + optional email copy + in-app notice and push for tenants with portal access** (`NotificationsService.notifyUser` does both). Sent in the background with a 1-minute sweep for retries. | Owner: SMS + optional email + in-app + push. |
| D7 ✔ | MRI basis | Cash basis: rent **received** in the month on RESIDENTIAL properties, i.e. payment allocations in the month × the invoice's rent share. Rate stored in platform settings, default 750 bps (7.5%), due the 20th of the next month. The report is labelled an estimate. | Matches our understanding of the Finance Act 2023 rules, **but confirm the rate, thresholds and basis with a tax advisor / Compliance before release.** |
| D8 | Property use | New `Property.use` = `RESIDENTIAL` (default) or `COMMERCIAL`, property-level only. | MRI applies to residential rent. Mixed-use buildings can be split later (unit-level override is out of scope). |
| D9 ✔ | Inspections | One MOVE_IN and one MOVE_OUT inspection per tenancy; a checklist of areas with condition + note + up to 6 photos each; tenant can view and acknowledge in the portal; PDF export. **Filled in from the web app (C6) and the Flutter staff app (C6m).** | Owner: web and mobile app. |
| D10 | Offline mobile scope | Only meter readings queue offline (incl. photo). Everything else still needs a connection. | Readings are the field task done without signal; the API upserts by `(meterId, period)` so resending is safe. |
| D11 ✔ | Push setup | **Rename the app id `com.qnex.hodi` → `co.ke.kodihub`** (Android `applicationId`, iOS bundle id, dev flavour `co.ke.kodihub.dev`), then `firebase_core` + `firebase_messaging` replace the unimplemented `co.ke.kodihub.push` method channel. **Owner prerequisites:** Firebase project for `co.ke.kodihub` (+ `.dev`), `flutterfire configure`, APNs key, `FCM_PROVIDER=fcm` + service account on the VMs. | Owner: rename to co.ke.kodihub. The backend FCM sender already exists. |
| D12 | PWA | `vite-plugin-pwa`, `registerType: 'prompt'` (a "New version — Reload" toast), precache the app shell only, `/api/*` never cached or served by the worker. | Installable without risking stale money data. |

## Review focus

The failure modes most likely to hurt real users that no happy-path test covers. Each has a test in the owning task.

1. **Late fee on an invoice that changed after it went overdue** — partly paid (fee on the remaining balance), fully paid (no fee), voided (no fee; an existing unpaid fee is voided too), run twice the same day (one fee); in an agency, a property whose agreement doesn't say who keeps fees gets none, and an agency-kept fee never reaches the owner statement. → Task C1.
2. **Rent change dated into a period that is already invoiced** — must be refused with a clear message, never silently re-bill. → Task C2.
3. **Broadcast recipients** — a tenant with two current units gets one message; ended tenants get none; a send failure for one tenant doesn't stop the rest. → Task C4.
4. **Offline queue duplicates** — saving the same meter/period twice offline keeps only the latest; a reading the server rejects (e.g. already billed) stays visible with the server's message instead of disappearing. → Task C8.
5. **Stale-chunk reload loop** — reload happens at most once per tab session; a second failure shows the error screen with a Reload button. → Task A2.

---

## Part A — Bugs

### Task A1: App config request (maintenance banner, signup link, register gate)

**Files:**
- Modify: `frontend/src/features/auth/useAppConfig.ts`
- Modify: `frontend/src/features/auth/RegisterPage.tsx:51`
- Create: `frontend/src/features/auth/appConfig.test.ts`

**Interfaces:**
- Produces: `fetchAppConfig(): Promise<AppConfigPayload>`; `signupOpen(cfg: AppConfigPayload | undefined): boolean`.

- [ ] **Step 1: Write failing tests** in `appConfig.test.ts`:
  - `fetchAppConfig calls /api/v1/auth/app-config with no query string` — stub `globalThis.fetch`, call, assert the requested URL `=== '/api/v1/auth/app-config'`.
  - `signupOpen is false while loading or on error` — `signupOpen(undefined) === false`; `signupOpen({ ...cfg, allowPublicSignup: false }) === false`; `signupOpen({ ...cfg, allowPublicSignup: true }) === true`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/auth/appConfig.test.ts` — expect FAIL (exports missing).
- [ ] **Step 3: Implement.** `fetchAppConfig` calls `api.get('/auth/app-config')` (no second argument — `api.get`'s second parameter is the query). `useAppConfig` uses it as `queryFn`. `RegisterPage` shows the "Sign-up is closed" state unless `signupOpen(config.data)`; while `config.isPending` it shows the spinner, not the form.
- [ ] **Step 4: Run** the test file — PASS. Then in the browser: `/login` has no 422 in the console; turning on `allowPublicSignup` (admin settings) shows the "Create account" link; maintenance mode shows the banner.

### Task A2: Error boundary and stale-chunk recovery

**Files:**
- Create: `frontend/src/lib/chunkReload.ts`, `frontend/src/lib/chunkReload.test.ts`
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx` (wrap each shell's `<Suspense>`/`<Outlet>`), `frontend/src/styles/pages.css`

**Interfaces:**
- Produces: `isChunkLoadError(err: unknown): boolean`; `reloadOnce(store: Pick<Storage, 'getItem' | 'setItem'>, reload: () => void, now?: number): boolean` (returns whether it reloaded; key `kodihub:chunk-reload`, at most once per 5 minutes); `<ErrorBoundary>` (class component — the only one in the codebase; React has no hook for this).

- [ ] **Step 1: Write failing tests** in `chunkReload.test.ts`:
  - `isChunkLoadError` is true for messages `Failed to fetch dynamically imported module: …`, `Importing a module script failed.`, `error loading dynamically imported module`, and for an `Event` whose `type === 'vite:preloadError'`; false for `TypeError('x is undefined')`.
  - `reloadOnce reloads the first time and not again within 5 minutes` — fake store; first call returns `true` and calls `reload` once; second call at `now + 60_000` returns `false`; call at `now + 301_000` returns `true`.
- [ ] **Step 2: Run** `npx vitest run src/lib/chunkReload.test.ts` — FAIL.
- [ ] **Step 3: Implement.** `main.tsx` adds `window.addEventListener('vite:preloadError', (e) => { if (reloadOnce(sessionStorage, () => location.reload())) e.preventDefault(); })`. `ErrorBoundary.componentDidCatch`: if `isChunkLoadError(error)` and `reloadOnce(...)` → reload; else render a card: "Something went wrong on this page." + "Reload" button + "Go to dashboard" link (portal-aware `homePath` prop). Wrap the routed content of `AppShell`, `AdminShell`, `TenantShell`, `OwnerShell` (inside the shell, so the sidebar survives a page crash).
- [ ] **Step 4: Run** tests — PASS. Browser check: throw from a page temporarily → the card shows, sidebar stays.

### Task A3: Tables readable on phones

**Files:**
- Create: `frontend/src/components/DataTable.tsx`, `frontend/src/lib/tableLabels.ts`, `frontend/src/lib/tableLabels.test.ts`
- Modify: `frontend/src/styles/admin.css` (`.ad__table`), every page using `<table className="ad__table">` (find with `grep -rln 'className="ad__table' frontend/src`)

**Interfaces:**
- Produces: `cellLabels(headers: { text: string; colSpan: number }[]): string[]` (one label per column after expanding colSpan); `<DataTable className? aria-label?>{thead, tbody}</DataTable>` — renders the same `<table class="ad__table">` and, in a layout effect keyed on its children, stamps `data-label` on each `td` from `cellLabels`.

- [ ] **Step 1: Write failing test** `cellLabels expands colSpan and blanks the actions column`: input `[{text:'Invoice',colSpan:1},{text:'Amount',colSpan:2},{text:'',colSpan:1}]` → `['Invoice','Amount','Amount','']`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `cellLabels` and `DataTable`. CSS under `@media (max-width: 640px)`: `.ad__table { min-width: 0 }`, `thead` visually hidden, each `tr` a card (`display:block`, border, radius, padding), each `td` `display:flex; justify-content:space-between; gap` with `td::before { content: attr(data-label); color: var(--muted); }`, empty label → no `::before`, `.ad__rowactions` full width at the bottom. Replace `<table className="ad__table">` with `<DataTable>` on every page.
- [ ] **Step 4: Run** tests — PASS. Browser at 390×844: invoices, payments, tenants, units, reconciliation show amount and status without sideways scrolling; at 1200px tables look unchanged.

### Task A4: Tenant/owner portal tabs reachable on phones

**Files:**
- Modify: `frontend/src/app/PortalShell.tsx`, `frontend/src/styles/tenant.css` (or the file holding `.ow__tabs`)

- [ ] **Step 1: Implement.** `.ow__tabs`: `overflow-x:auto; scroll-snap-type:x proximity; scrollbar-width:none`, a right-edge fade (`mask-image: linear-gradient(to right, #000 85%, transparent)`) only when it overflows (toggle class `is-overflowing` via a `ResizeObserver`). On route change, `activeTab.scrollIntoView({ inline: 'center', block: 'nearest' })`.
- [ ] **Step 2: Verify** in the browser at 390px: on `/tenant/requests` the "Maintenance" tab is visible and highlighted; the fade shows on `/tenant` and disappears at 1200px.
- [ ] **Step 3: Part A verification** — run the frontend verification command from Global constraints; all green. **Stop for owner commit** (suggested message: `fix(web): app config query, chunk-error recovery, phone tables, portal tabs`).

---

## Part B — Staff web UX

### Task B1: Dashboard "Needs attention" list

**Files:**
- Modify: `backend/src/modules/reports/report-math.ts`, `report-math.spec.ts`, `reports.service.ts` (`dashboard()`)
- Modify: `frontend/src/features/reports/types.ts`, `DashboardPage.tsx`; Create: `frontend/src/features/reports/ActionList.tsx`

**Interfaces:**
- Produces (backend, pure): `type ActionKind = 'INVOICE_RUN_PENDING' | 'UNMATCHED_PAYMENTS' | 'OVERDUE_TENANTS' | 'NOTICE_ENDING' | 'REMITTANCES_TO_APPROVE' | 'LEASES_EXPIRING'`; `interface ActionItem { kind: ActionKind; count: number; amount?: bigint }`; `buildActionItems(input: ActionInput): ActionItem[]` — drops zero counts, fixed order as listed. `ActionInput = { uninvoicedTenancies: number; unmatchedInbound: number; overdueTenants: number; overdueAmount: bigint; noticeEndingIn14Days: number; draftRemittances: number; leasesExpiringIn60Days: number }`.
- `GET /reports/dashboard` response gains `actions: ActionItem[]`. `LEASES_EXPIRING` is fed `0` until Task C2.
- Frontend: `actionLink(kind): { label(count): string; to: string; permission: string }` in `features/reports/rules.ts`.

- [ ] **Step 1: Failing spec** `buildActionItems` — zero counts are dropped; order is fixed; `OVERDUE_TENANTS` carries `amount`.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/modules/reports/report-math.spec.ts` — FAIL.
- [ ] **Step 3: Implement** `buildActionItems`; in `dashboard()` compute the inputs (respecting `propertyId` scope): uninvoiced = ACTIVE/NOTICE tenancies whose billing date for the current period is ≤ today with no live MONTHLY invoice for the period (a count query in reports — reports must not import billing services); unmatched = `InboundTransaction` `UNMATCHED`; overdue from the existing `arrears()`; notice ending = NOTICE tenancies with `endDate` ≤ today+14; draft remittances = `Remittance.status = 'DRAFT'` (AGENCY only).
- [ ] **Step 4: Frontend failing test** in `reports.test.ts`: `actionLink('UNMATCHED_PAYMENTS')` → `to: '/app/reconciliation'`, permission `reconciliation:view`, label for 1 = "1 M-Pesa payment to match", for 3 = "3 M-Pesa payments to match"; `INVOICE_RUN_PENDING` → `/app/invoices/run`; `OVERDUE_TENANTS` → `/app/reports?tab=arrears`; `NOTICE_ENDING` → `/app/tenancies?status=NOTICE`; `REMITTANCES_TO_APPROVE` → `/app/remittances?status=DRAFT`; `LEASES_EXPIRING` → `/app/tenancies?expiring=60`.
- [ ] **Step 5: Implement** `ActionList` above the stat cards: hidden items the user lacks permission for; empty → a single "You're all caught up" line.
- [ ] **Step 6: Run** both test suites — PASS. Browser: Agency dashboard for Nov 2026 shows "Invoice run: N tenancies not billed yet" and "1 M-Pesa payment to match".

### Task B2: Dashboard polish

**Files:** Modify `frontend/src/features/reports/DashboardPage.tsx`, `frontend/src/styles/reports.css`

- [ ] **Step 1:** Property scope uses the shared `ad__select` style with the label above it (`ad__label` block); row button "Switch" → "View property" with `aria-label="View {name} on the dashboard"`; table headers use the same font as the other headers (remove the mono class from `<th>`).
- [ ] **Step 2: Verify** in the browser at 1200px and 390px.

### Task B3: Sortable lists and a balance column on tenants

**Files:**
- Backend: `src/modules/portfolio/tenants/tenants.dto.ts` + `tenants.service.ts` (`list`), `src/modules/billing/invoices/invoices.dto.ts` + `invoices.service.ts` (`list`), `src/modules/payments/**/payments.dto.ts` + service `list`; e2e in `test/portfolio.e2e-spec.ts`, `test/billing.e2e-spec.ts`, `test/payments.e2e-spec.ts`
- Frontend: Create `frontend/src/lib/sort.ts`, `sort.test.ts`, `frontend/src/components/SortHeader.tsx`; Modify `TenantsPage.tsx`, `InvoicesPage.tsx`, `PaymentsPage.tsx`

**Interfaces:**
- Query param `sort=<field>` or `sort=-<field>` (minus = descending). Allowed: tenants `name | balance` (default `name`); invoices `issueDate | dueDate | total | number` (default `-issueDate`); payments `receivedAt | amount` (default `-receivedAt`). Unknown → 422 via `@IsIn`.
- Frontend: `parseSort(raw: string | null, allowed: readonly string[], fallback: string): { field: string; desc: boolean }`; `nextSort(current, field): string` (asc → desc → asc); `<SortHeader field label sort onSort />` renders a `<th aria-sort>` with a button.

- [ ] **Step 1: Failing frontend tests** — `parseSort('-balance', ['name','balance'], 'name')` → `{field:'balance',desc:true}`; unknown → fallback; `nextSort('balance','balance') === '-balance'`, `nextSort('-balance','balance') === 'balance'`, `nextSort('name','balance') === '-balance'` (money columns start descending — pass `firstDesc` set `['balance','total','amount']`).
- [ ] **Step 2: Failing e2e** — `GET /tenants?sort=-balance` returns the tenant owing most first; `GET /invoices?sort=total` ascending by total; `GET /tenants?sort=bogus` → 422.
- [ ] **Step 3: Implement backend.** Tenants sorted by balance: compute balances for the scoped tenant ids (`this.balances(ids)` already exists) and sort in memory before paging when `sort` is balance (fine at this scale; note it in a comment); other fields map to Prisma `orderBy`.
- [ ] **Step 4: Implement frontend.** Tenants table gains a **Balance** column: owing → red amount; credit → green "KES X credit"; zero → muted "—". Sort state lives in the URL (`filters.setFilter({ sort })`).
- [ ] **Step 5: Run** all three test suites — PASS.

### Task B4: Clear action hierarchy (primary buttons, overflow menus, safe bulk actions)

**Files:**
- Create: `frontend/src/components/MoreMenu.tsx` (button + popover menu: `role="menu"`, arrow-key navigation, Esc closes and returns focus, items `{ label; onSelect; danger?; disabled? }`, a separator before danger items)
- Create: `frontend/src/features/tenants/actionLayout.ts`, `actionLayout.test.ts`
- Modify: `TenancyActions.tsx`, `TenantDetailPage.tsx`, `TenantsPage.tsx`
- Backend: `POST /tenants/run-reminders` accepts `{ dryRun?: boolean }` and returns the same counts without sending (`tenant-portal.controller.ts`, `tenant-accounts.service.ts#runReminders`); e2e in `test/tenant-portal.e2e-spec.ts`.

**Interfaces:**
- Produces: `tenancyActionLayout(status: TenancyStatus, can: { update: boolean; delete: boolean; invoice: boolean }): { buttons: TenancyAction[]; menu: TenancyAction[] }` where `TenancyAction = 'notice' | 'changeNotice' | 'moveOut' | 'leasePdf' | 'attachLease' | 'moveInInvoice' | 'renew' | 'rentChange' | 'inspection' | 'delete'` (`renew`, `rentChange`, `inspection` used from Part C; return them only when an `extras` argument lists them — added in C2 and C6). `tenantPrimaryAction(status: TenantStatus): 'recordPayment' | 'moveIn'`.

- [ ] **Step 1: Failing tests** — ACTIVE → buttons `['notice','moveOut']`, menu ends with `'delete'`; NOTICE → buttons `['moveOut','changeNotice']`; ENDED → buttons `[]`, menu `['leasePdf']`; without `delete` permission `'delete'` is absent; never more than 2 buttons. `tenantPrimaryAction('CURRENT') === 'recordPayment'`, PAST/PROSPECT → `'moveIn'`.
- [ ] **Step 2: Failing e2e** — `run-reminders` with `dryRun: true` returns counts and writes no `messages` rows.
- [ ] **Step 3: Implement.** Tenancy rows render `buttons` + `MoreMenu(menu)`. Tenant detail header: primary = `tenantPrimaryAction`, "Move in" moves into the More menu for current tenants. Tenants list rows: "Move in" only for PAST/PROSPECT. Tenants toolbar keeps filters + "Add tenant"; "Import CSV", "Send due reminders", "Give portal access…" move into a `MoreMenu`. "Send due reminders" opens a confirm sheet that first calls `dryRun` and says "This will text N tenants (X due soon, Y overdue)."
- [ ] **Step 4: Run** tests — PASS. Browser: keyboard-only pass over a tenancy row's menu (Tab, Enter, arrows, Esc).

### Task B5: Readable numbers, long text and page titles

**Files:** Modify `frontend/src/styles/tokens.css`, the stylesheets using `var(--font-num)`, `TenantDetailPage.tsx` (profile grid); Create `frontend/src/lib/useDocumentTitle.ts`; Modify the detail pages listed in `App.tsx` `BUILT[*].children` and `AppShell.tsx:68`.

**Interfaces:** `useDocumentTitle(title: string | undefined): void` — sets `"{title} · KodiHub"` while mounted, restores the shell title on unmount.

- [ ] **Step 1:** `.num` uses the body font with `font-variant-numeric: tabular-nums; white-space: nowrap;` (keep `--font-num` only for codes like `T00001`/`INV-…` via a new `.code` class — replace `num` with `code` where the value is an identifier). Profile values: `min-width:0; overflow:hidden; text-overflow:ellipsis` with `title` = full value.
- [ ] **Step 2:** Call `useDocumentTitle` with the entity name on tenant, unit, property, landlord, invoice (number), payment, remittance detail pages.
- [ ] **Step 3: Verify** in the browser: tenancy table shows "KES 25,000.00" on one line; long emails end in "…" with the full value on hover; tab title reads "Achieng Otieno · KodiHub".
- [ ] **Step 4: Part B verification** — backend + frontend verification commands green. **Stop for owner commit** (`feat(web): dashboard actions, sorting, balances, action menus`).

---

## Part C — Missing features

### Task C1: Late fees

**Files:**
- Schema/migration `…_late_fees`: `InvoiceKind` + `LATE_FEE`; `LineKind` + `LATE_FEE`; `enum LateFeeRecipient { LANDLORD AGENCY }`; `Invoice.lateFeeForId String? @unique @db.Uuid`, `Invoice.lateFeeKeptBy LateFeeRecipient?`; `ManagementAgreement.lateFeeRecipient LateFeeRecipient?` (no default — D2).
- Create: `backend/src/modules/billing/late-fees/late-fees.ts` (pure), `late-fees.spec.ts`, `late-fees.service.ts`; register in `billing.module.ts`.
- Modify: `invoices.service.ts` (void hook voids the unpaid linked fee — D3), `organizations.dto.ts` + `organizations.service.ts` (`lateFees` settings), `agency/agency.dto.ts` + `agreements.service.ts` (`lateFeeRecipient` on create and `PATCH /agreements/:id`), `agency/landlord-ledger.service.ts` (`onAllocated`/`onIssued` return early for invoices with `lateFeeKeptBy = 'AGENCY'`), `agency.module.ts` (registers the late-fee eligibility hook, below), `jobs.controller.ts` (`POST internal/jobs/late-fees`), `infra/vm/cron/crontab` (`45 0 * * *`).
- Frontend: `features/settings/OrganizationPage.tsx` "Late fees" section (agency warning, below); `features/agency/AgreementSheet.tsx` + `AgreementsPage.tsx` ("Late fees go to" field and column); `features/billing/labels.ts` (kind label "Late fee"); invoice detail shows "Late fee for INV-…" and, in agencies, "Kept by the agency" / "Goes to the landlord".
- Test: `backend/test/billing.e2e-spec.ts` (new `describe('late fees')`) and `backend/test/agency.e2e-spec.ts` (agreement cases).

**Interfaces:**
- `interface LateFeeSettings { enabled: boolean; mode: 'FLAT' | 'PERCENT'; amount: bigint /* FLAT, minor units */; percentBps: number /* PERCENT */; graceDays: number }`; `DEFAULT_LATE_FEES = { enabled:false, mode:'PERCENT', amount:0n, percentBps:500, graceDays:5 }`.
- `readLateFees(settings: unknown): LateFeeSettings`.
- `lateFeeFor(inv: { kind: InvoiceKind; status: InvoiceStatus; dueDate: string; balance: bigint }, s: LateFeeSettings, today: string): bigint | null` — null unless enabled, kind MONTHLY, status not VOID/PAID, balance > 0 and `today >= dueDate + graceDays`; PERCENT rounds half-up to whole cents.
- Eligibility hook (billing must not import agency): `LateFeesService.onEligibility(hook: (tx, invoice: { propertyId: string; dueDate: Date }) => Promise<{ allowed: boolean; keptBy: LateFeeRecipient | null }>)`. Agency registers it: AGENCY org → the agreement applicable to the property on the run date (`AgreementsService.applicable`); no agreement or `lateFeeRecipient` null → `{ allowed:false }`; else `{ allowed:true, keptBy }`. LANDLORD org (no hook result / no landlord) → `{ allowed:true, keptBy:null }`.
- `LateFeesService.run(today?: string): Promise<{ created: number; skippedNoAgreement: number }>` (current org); `runAll(today?)` like `InvoiceRunService.runAll`. Issues through `InvoiceIssuer.issue` with `kind:'LATE_FEE'`, one line `{ kind:'LATE_FEE', description:'Late payment fee for INV-…' }`, `lateFeeForId`, `lateFeeKeptBy`, due date = today + org `invoiceDueDays`. Unique violation on `lateFeeForId` → skip.
- `GET /organization` (late-fee section) also returns `lateFees.agreementsMissingRecipient: number` for AGENCY orgs (current agreements with `lateFeeRecipient` null).
- Settings API: `PATCH /organization` accepts `lateFees: { enabled, mode, amount, percentBps, graceDays }` (graceDays 0–60, percentBps 1–2500, amount ≥ 0). Agreement DTOs accept `lateFeeRecipient: 'LANDLORD' | 'AGENCY' | null`; changing it affects only fees issued afterwards (snapshot).
- Copy (exact): settings, AGENCY org — "Late fees are only charged on properties whose management agreement says who keeps them. {N} of your current agreements don't say yet, so their properties get no late fees." (+ link "Set it on the agreements"); agreement sheet field "Late fees go to" with options "Not set — no late fees on these properties", "The landlord", "The agency".

- [ ] **Step 1: Failing spec** `late-fees.spec.ts`: disabled → null; day `due+4` with grace 5 → null, `due+5` → fee; FLAT 50000n → 50000n; PERCENT 500 bps of 1_000_050n → 50_003n (half-up); balance 0 → null; ADHOC/MOVE_IN/LATE_FEE kinds → null; VOID → null.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement `late-fees.ts` — PASS.
- [ ] **Step 4: Failing e2e** (Review focus 1) — landlord org: enable 5% grace 5 → run at due+5 creates one LATE_FEE invoice for the unpaid balance; running again creates none; partly paid invoice → fee on remaining balance; fully paid → none; voiding the original voids its unpaid fee; void of a fee leaves the original untouched; tenant sees the fee in the tenant portal. Agency org: agreement without `lateFeeRecipient` → no fee, `skippedNoAgreement: 1`, `agreementsMissingRecipient: 1`; set `LANDLORD` → fee issued and its payment appears as a COLLECTION on the owner statement; set `AGENCY` on another landlord's agreement → fee issued with `lateFeeKeptBy: 'AGENCY'`, its payment writes no landlord ledger entry; changing an agreement's recipient later leaves already-issued fees as they were.
- [ ] **Step 5:** Implement service, hook, ledger skips, job, void hook, DTOs; add the migration. Run e2e — PASS.
- [ ] **Step 6:** Frontend: settings section (toggle, mode radio, amount/percent, grace days, a live example: "A KES 25,000 invoice unpaid 5 days after its due date gets a KES 1,250 late fee", and the agency warning above); agreement sheet field + "Late fees" column on the agreements list showing "Not set" in the warning colour; labels. Browser check.

### Task C2: Lease end dates, renewals and rent changes

**Files:**
- Migration `…_lease_terms`: `Tenancy.leaseEndDate DateTime? @db.Date`; model `RentChange { id, orgId, tenancyId, effectivePeriod String /* "2027-01" */, newRent BigInt, note String?, appliedAt DateTime?, createdById String? @db.Uuid, createdAt }` with `@@unique([tenancyId, effectivePeriod])`, `@@index([orgId, appliedAt])`.
- Create: `backend/src/modules/portfolio/tenancies/rent-changes.ts` (pure) + `.spec.ts`, `rent-changes.service.ts`.
- Modify: `tenancies.controller.ts`/`.service.ts`/`.dto.ts` (move-in accepts `leaseEndDate`; `POST /tenancies/:id/renew`; `POST /tenancies/:id/rent-changes`; `DELETE /tenancies/:id/rent-changes/:changeId` (unapplied only); `GET /tenancies?expiring=<days>`), `invoice-run.service.ts#run` (apply due changes first — through an `onBeforeRun` hook registered by portfolio, since portfolio must not import billing and vice versa: billing exposes `InvoiceRunService.onBeforeRun(hook)`), `reports.service.ts` (`leasesExpiringIn60Days`), lease PDF shows the end date.
- Frontend: `MoveInSheet.tsx` (lease end date), `actionLayout.ts` (+`renew`, `rentChange`), new `RenewLeaseSheet.tsx`, `RentChangeSheet.tsx`, `TenancyTable.tsx` ("Lease ends" column, "Rent changes to KES X from Jan 2027" sub-line), `TenanciesPage.tsx` (`expiring` filter), tenant portal "Your home" shows lease end and any scheduled change.
- Tests: `backend/test/portfolio.e2e-spec.ts`, `billing.e2e-spec.ts`.

**Interfaces:**
- `earliestChangePeriod(t: { lastBilledPeriod: string | null; currentPeriod: string }): string` — the first period not yet invoiced (`max(next(lastBilledPeriod), currentPeriod)`).
- `validateRentChange(effectivePeriod: string, earliest: string): 'OK' | 'ALREADY_BILLED'`.
- `RentChangesService.applyDue(orgId: string, period: string, tx?)` — sets `tenancy.rentAmount = newRent`, `appliedAt = now()` for unapplied changes with `effectivePeriod <= period`, audit `tenancy.rent_changed`.
- Renew DTO `{ leaseEndDate: string; newRent?: number; effectivePeriod?: string; notifyTenant?: boolean }`; rent change DTO `{ newRent: number; effectivePeriod: string; note?: string; notifyTenant?: boolean }`. `notifyTenant` sends via `MessagesService.sms` (kind `RENT_CHANGE` — add to `MessageKind`) the text "Your rent for {unit} changes from KES X to KES Y from {Month YYYY}."

- [ ] **Step 1: Failing spec** (Review focus 2): `earliestChangePeriod({lastBilledPeriod:'2026-11', currentPeriod:'2026-11'}) === '2026-12'`; with null last billed → current period; `validateRentChange('2026-11','2026-12') === 'ALREADY_BILLED'`.
- [ ] **Step 2: Run** — FAIL; implement — PASS.
- [ ] **Step 3: Failing e2e:** schedule 30,000 from next period → that period's invoice run bills 30,000 and `rentAmount` updates; scheduling into a billed period → 409 `ALREADY_BILLED` with message "Rent for Nov 2026 is already invoiced — choose Dec 2026 or later."; renew sets `leaseEndDate`; `GET /tenancies?expiring=60` lists it; dashboard `actions` includes `LEASES_EXPIRING`.
- [ ] **Step 4:** Implement migration, services, hook, endpoints — PASS.
- [ ] **Step 5:** Frontend sheets, columns, filter, portal line; extend `actionLayout` tests for `renew`/`rentChange` in the menu for ACTIVE and NOTICE. Browser check.

### Task C3: WhatsApp channel — DROPPED

Removed by the owner on 2026-11-04 (D5). Nothing to build; later tasks use SMS, email, in-app and push only.

### Task C4: Broadcast messages to tenants

**Files:**
- Migration `…_broadcasts`: model `Broadcast { id, orgId, propertyIds String[] @db.Uuid, text, alsoEmail Boolean @default(false), status BroadcastStatus /* QUEUED SENDING DONE */, recipients Int, sent Int @default(0), failed Int @default(0), emailed Int @default(0), notified Int @default(0), createdById String @db.Uuid, createdAt, finishedAt DateTime? }`; `MessageKind` + `BROADCAST`; `Message.broadcastId String? @db.Uuid` + index.
- Create: `backend/src/modules/tenant-portal/broadcasts.service.ts`, `broadcasts.controller.ts`, `broadcast-rules.ts` + `.spec.ts`.
- Modify: `roles/permissions.ts` (`messages:send` "Send messages to tenants" in the Tenants group; add to owner and manager system roles), `tenant-portal.module.ts`, `jobs` (`POST internal/jobs/broadcast-sweep`, crontab `* * * * *`).
- Frontend: `navigation.ts` (Tenants group: `{ label:'Messages', to:'/app/messages', permission:'tenants:view', phase:'13', hint:'Texts to tenants: reminders and notices' }`), `App.tsx` BUILT entry, Create `features/messages/MessagesPage.tsx` (history: broadcasts + reminders, filters) and `BroadcastSheet.tsx`, `features/messages/rules.ts` + `messages.test.ts`.

**Interfaces:**
- `broadcastRecipients(rows: { tenantId: string; phone: string; status: TenancyStatus }[]): { tenantId: string; phone: string }[]` — current only, de-duplicated by tenant.
- `smsSegments(text: string): number` — GSM-7 160/153, UCS-2 70/67 when any non-GSM character.
- Endpoints (all `messages:send`): `POST /broadcasts/preview { propertyIds: string[] }` → `{ recipients: number }`; `POST /broadcasts { propertyIds, text (1–480 chars), alsoEmail? }` → 202 + broadcast; `GET /broadcasts` (paged); `GET /broadcasts/:id` (+ its messages). Rate limit: one broadcast per org per minute (`RateLimitBucket`).
- `BroadcastsService.process(id)` per recipient: SMS via `MessagesService.sms` (kind `BROADCAST`, counts `sent`/`failed`); if `alsoEmail` and the tenant has an email, `NotificationsService.sendRawEmail` (subject "Notice from {org name}", counts `emailed`); if the tenant has portal access (`userId`), `NotificationsService.notifyUser({ kind:'BROADCAST', title:'Notice from {org name}', body:text, actionUrl:'/tenant' })` — in-app notice + push (counts `notified`). One channel failing never stops the others. Started with `setImmediate` after create; `sweep()` picks QUEUED/SENDING older than 2 minutes.

- [ ] **Step 1: Failing spec** (Review focus 3): a tenant with two current tenancies appears once; ENDED-only tenants are excluded; `smsSegments('a'.repeat(160)) === 1`, `161 → 2`; text containing `✓` (non-GSM): 70 chars → 1, 71 chars → 2.
- [ ] **Step 2: Failing e2e:** preview count matches (`{ recipients, withEmail, withPortal }`); sending to one property texts only its current tenants; `alsoEmail` emails only tenants with an email; tenants with portal access get a `UserNotification` (and a push in the outbox); one forced SMS failure → `failed: 1` and the rest sent, and that tenant still gets the email/in-app copy; second broadcast within a minute → 429; a user without `messages:send` → 403; property-restricted staff can only target their properties.
- [ ] **Step 3:** Implement — PASS.
- [ ] **Step 4:** Frontend: compose sheet with property multi-select, live recipient count ("23 tenants · 18 have email · 11 use the tenant app"), "Also send by email" tick box, character + SMS segment counter ("2 SMS per tenant · about 46 SMS"), confirm step; history list with status and per-channel counts. Tenant portal and mobile tenant app show the notice in notifications (already wired via `notifyUser`). Frontend test for the counter label. Browser check.

### Task C5: Rental income tax (MRI) report

**Files:**
- Migration `…_property_use_mri`: `enum PropertyUse { RESIDENTIAL COMMERCIAL }`, `Property.use PropertyUse @default(RESIDENTIAL)`; `PlatformSettings.mriRateBps Int @default(750)`.
- Modify: property DTO/service/sheet (use selector), platform settings (rate field, superadmin only), `reports.controller.ts` + `reports.service.ts` (`GET /reports/rental-income-tax?period=YYYY-MM&landlordId?&format=csv`), `report-math.ts` + spec.
- Frontend: `ReportsPage.tsx` new tab "Rental income tax", `PropertySheet.tsx` (use), `AdminSettingsPage.tsx` (rate).

**Interfaces:**
- `rentShare(allocated: bigint, invoiceRent: bigint, invoiceTotal: bigint): bigint` — `allocated × invoiceRent / invoiceTotal`, half-up; 0 when total is 0.
- `mriDue(grossRent: bigint, rateBps: number): bigint` — half-up to whole cents.
- Row: `{ landlordId: string | null; landlordName: string; kraPin: string | null; grossRentReceived: bigint; rateBps: number; taxDue: bigint; dueDate: string /* 20th of next month */ }`. AGENCY → one row per landlord (filterable); LANDLORD org → one row for the organisation. Only allocations dated in the period (cash basis, D7) on RESIDENTIAL properties; LATE_FEE/CHARGE/MOVE_IN lines excluded.

- [ ] **Step 1: Failing spec:** `rentShare(10_000n, 25_000n, 30_000n) === 8_333n`; `rentShare(10_000n, 0n, 0n) === 0n`; `mriDue(2_500_000n, 750) === 187_500n`.
- [ ] **Step 2: Failing e2e:** a payment in Nov for an Oct invoice counts in Nov; commercial property excluded; water charges excluded; agency gets one row per landlord; CSV has headers `Landlord,KRA PIN,Gross rent received (KES),Rate,Tax due (KES),Due date`.
- [ ] **Step 3:** Implement — PASS.
- [ ] **Step 4:** Frontend tab: month picker, table, CSV download, notice: "Estimate based on rent received for residential properties at {rate}%. Confirm with your tax advisor before filing on KRA iTax." Browser check.

### Task C6: Move-in and move-out inspections

**Files:**
- Migration `…_inspections`: `enum InspectionKind { MOVE_IN MOVE_OUT }`, `enum ItemCondition { GOOD FAIR POOR DAMAGED }` (stored inside JSON, enum used by DTO validation), model `Inspection { id, orgId, tenancyId, unitId, kind, inspectedOn DateTime @db.Date, items Json, notes String?, inspectorName String?, tenantAcknowledgedAt DateTime?, createdById, createdAt, updatedAt }` `@@unique([tenancyId, kind])`; `UploadPurpose` + `INSPECTION_PHOTO`.
- Create: `backend/src/modules/portfolio/inspections/` (`inspections.controller.ts`, `.service.ts`, `.dto.ts`, `inspection-pdf.ts`, `inspection-rules.ts` + `.spec.ts`); register in `portfolio.module.ts`; tenant-portal endpoints for view/acknowledge/photos.
- Frontend: `features/tenants/InspectionSheet.tsx`, `InspectionCompare.tsx`, `features/tenants/inspections.ts` + test; `actionLayout.ts` (+`inspection`); tenant portal "Your home" card; reuse `features/uploads` for photos.

**Interfaces:**
- `DEFAULT_AREAS = ['Living room','Kitchen','Bedrooms','Bathroom & toilet','Doors & locks','Windows & grilles','Walls & paint','Floors','Electrical fittings','Plumbing & taps']`.
- Item: `{ area: string (1–60); condition: ItemCondition; note?: string (≤500); photoUploadIds: string[] (≤6) }`; ≤30 items.
- `PUT /tenancies/:id/inspections/:kind` (upsert; permission `tenancies:update`; refused with 409 once the tenant acknowledged, unless `reopen: true` which clears the acknowledgement and is audited); `GET /tenancies/:id/inspections`; `GET /tenancies/:id/inspections/:kind/pdf`; `GET …/photos/:uploadId`. Tenant: `GET /tenant-portal/:tenantId/tenancies/:tenancyId/inspections`, `POST …/:kind/acknowledge`.
- `compareItems(moveIn: Item[], moveOut: Item[]): { area: string; before?: ItemCondition; after?: ItemCondition; worse: boolean }[]` (frontend pure helper, condition order GOOD<FAIR<POOR<DAMAGED).

- [ ] **Step 1: Failing tests:** backend rules spec (31 items → invalid; 7 photos → invalid; photo ids must be INSPECTION_PHOTO uploads of the org); frontend `compareItems` marks GOOD→POOR worse, keeps areas present in only one inspection.
- [ ] **Step 2: Failing e2e:** create move-in inspection with a photo; tenant sees and acknowledges it; edit after acknowledgement → 409 unless `reopen`; PDF responds `application/pdf`; another org's tenant → 404.
- [ ] **Step 3:** Implement (PDF with pdfkit Helvetica — WinAnsi only, no arrows). Run tests — PASS.
- [ ] **Step 4:** Frontend: checklist sheet that pre-fills `DEFAULT_AREAS` (add/remove areas), photo capture uses the phone camera (`accept="image/*" capture="environment"`); move-out sheet shows the move-in condition beside each area and flags worse items. Browser check at 390px.

### Task C6m: Inspections in the mobile staff app

Depends on C6's API. Same rules, so a mobile-made inspection is identical to a web one.

**Files:**
- Create: `mobile/lib/features/staff/tenants/inspection_screen.dart` (checklist editor), `inspection_compare.dart` (move-out view with move-in conditions), `mobile/lib/features/staff/inspections.dart` (pure: `defaultAreas`, `compareItems`, `validateInspection`), `mobile/test/staff/inspections_test.dart`.
- Modify: `staff_api.dart` (`inspections(tenancyId)`, `saveInspection(tenancyId, kind, body)`, upload with purpose `INSPECTION_PHOTO`), `staff_models.dart` (`Inspection`, `InspectionItem`), tenancy actions on the tenant/unit screens ("Move-in inspection", "Move-out inspection"), `photo.dart` (reuse camera + compression for up to 6 photos per area).

**Interfaces:**
- Dart mirrors of C6: `const defaultAreas = [...]` (same list and order as `DEFAULT_AREAS`), `List<CompareRow> compareItems(List<InspectionItem> moveIn, List<InspectionItem> moveOut)`, `String? validateInspection(List<InspectionItem> items)` (null = ok; "At most 30 areas" / "At most 6 photos for {area}").

- [ ] **Step 1: Failing tests** `inspections_test.dart`: `defaultAreas` equals the web list; `compareItems` flags GOOD→POOR as worse and keeps areas only in one inspection; 31 items → "At most 30 areas"; 7 photos → "At most 6 photos for Kitchen".
- [ ] **Step 2: Run** `flutter test test/staff/inspections_test.dart` — FAIL; implement — PASS.
- [ ] **Step 3:** Screens: checklist with condition chips (Good/Fair/Poor/Damaged), note, camera photos; save uploads photos first, then `PUT`; an acknowledged inspection opens read-only with "Reopen" (confirm). Move-out screen shows the move-in condition under each area and highlights worse ones.
- [ ] **Step 4: Verify** on the iOS simulator against the local API: create a move-in inspection with a photo on the phone → it shows on the web tenant page and in the tenant portal.

### Task C7: Installable web app (PWA)

**Files:**
- `frontend/package.json` (dev deps `vite-plugin-pwa`, `@vite-pwa/assets-generator`), Create `frontend/pwa.config.ts` + `frontend/src/lib/pwa.test.ts`, Modify `frontend/vite.config.ts`, `frontend/index.html` (theme-color, apple-touch-icon), Create `frontend/src/app/UpdatePrompt.tsx` (uses `virtual:pwa-register/react`), generated icons in `frontend/public/` (192, 512, maskable 512, apple 180) from `favicon.svg`.
- Check `infra/vm/stack` web server config: `/sw.js` and `/manifest.webmanifest` served with `Cache-Control: no-cache`.

**Interfaces:** `export const PWA_OPTIONS: Partial<VitePWAOptions>` — `registerType:'prompt'`, `manifest:{ name:'KodiHub', short_name:'KodiHub', start_url:'/', display:'standalone', theme_color:<navy token hex>, background_color:<surface hex>, icons:[…] }`, `workbox:{ navigateFallback:'/index.html', navigateFallbackDenylist:[/^\/api\//], runtimeCaching:[] , globPatterns:['**/*.{js,css,html,svg,woff2,png}'] }`.

- [ ] **Step 1: Failing test** `pwa.test.ts`: `PWA_OPTIONS.workbox.navigateFallbackDenylist` matches `/api/v1/tenants`; `runtimeCaching` is empty; `registerType === 'prompt'`.
- [ ] **Step 2:** Implement; `UpdatePrompt` shows a toast "A new version of KodiHub is ready." with "Reload" — mounted in all four shells. This also reduces Task A2's stale-chunk cases.
- [ ] **Step 3: Verify:** `npm run build && npx vite preview`; in the browser: manifest loads, service worker registers, "Install" is offered; offline reload shows the app shell and API calls fail with the normal error (not cached data).

### Task C8: Mobile — offline meter readings

**Files:**
- Create: `mobile/lib/features/staff/more/reading_queue.dart`, `mobile/test/staff/reading_queue_test.dart`
- Modify: `meters_screen.dart` (`_save`), `staff_api.dart` (no change to `saveReading` signature), `more_screen.dart` / meters list (pending banner), `mobile/lib/app.dart` (flush on resume via `AppLifecycleListener`).

**Interfaces:**
- `class PendingReading { String meterId; String propertyId; String period; String current; String? note; String? photoPath; DateTime savedAt; String? lastError; }` (+ `toJson`/`fromJson`).
- `class ReadingQueue { ReadingQueue(Directory dir); Future<List<PendingReading>> pending(); Future<void> enqueue(PendingReading r); Future<void> remove(String meterId, String period); Future<FlushResult> flush(StaffApi api); }` — file `pending_readings.json` + photos copied into `dir/photos/`; key = `meterId|period`, enqueue replaces the same key; flush uploads photo (`api.upload('METER_PHOTO', file)`) then `saveReading`; network error → stop and keep; server error → keep with `lastError` = server message; success → remove + delete photo copy.
- `class FlushResult { int sent; int failed; int remaining; }`; provider `readingQueueProvider` (dir from `getApplicationSupportDirectory()`).

- [ ] **Step 1: Failing tests** (Review focus 4): enqueue same meter/period twice → one item with the latest value; flush with fake api succeeding → `sent:1, remaining:0` and photo copy deleted; fake api throwing `ApiError.network()` → `sent:0, remaining:1`, no `lastError`; fake api throwing a 409 `ALREADY_BILLED` → item kept with `lastError` = the API message, `failed:1`.
- [ ] **Step 2: Run** `flutter test test/staff/reading_queue_test.dart` — FAIL; implement — PASS.
- [ ] **Step 3:** `_save`: on `isNetworkError`, enqueue and show "No connection — saved on this phone. It will upload when you're back online." Meters screen shows "N readings waiting to upload · Upload now" and lists items with `lastError` (edit or discard). Flush on screen open and app resume.
- [ ] **Step 4: Verify** on the iOS simulator: airplane-mode save → banner; reconnect → reading appears on the web Meter readings page.

### Task C9: Mobile — Firebase push

**Step 0 is mine (app id rename); the Firebase prerequisites in D11 are the owner's.** Until the Firebase files exist, the code stays behind the existing `PushTokenSource` so the app still builds without them.

**Files:**
- App id rename: `mobile/android/app/build.gradle.kts` (`applicationId = "co.ke.kodihub"`, dev suffix stays `.dev`), Android `namespace` + `MainActivity` package path (`android/app/src/main/kotlin/co/ke/kodihub/…`), `ios/Runner.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER = co.ke.kodihub`, tests `co.ke.kodihub.RunnerTests`), any hard-coded `com.qnex.hodi` (grep the repo incl. `infra/` and `.github/`).
- `mobile/pubspec.yaml` (`firebase_core`, `firebase_messaging`), Create `mobile/lib/core/notifications/firebase_push.dart`, `mobile/test/core/firebase_push_test.dart`; Modify `push_service.dart` (provider picks Firebase when `Firebase.apps.isNotEmpty`), `main_dev.dart`/`main_prod.dart` (`Firebase.initializeApp` with generated `firebase_options.dart`, guarded), Android `AndroidManifest.xml` (`POST_NOTIFICATIONS`), iOS push capability + background mode.
- Infra: `infra/vm/README.md` — document `FCM_PROVIDER=fcm`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` in `/opt/hodi/envs`.

**Interfaces:**
- `class FirebasePushTokenSource implements PushTokenSource { FirebasePushTokenSource(FirebaseMessaging m); }` — requests permission once, returns `(token, platform)`; null if denied.
- `void wirePushHandlers(FirebaseMessaging m, {required void Function() onForeground, required void Function(String? actionUrl) onOpen})` — foreground → refresh the notifications provider; tap (`onMessageOpenedApp` + `getInitialMessage`) → `mobileRouteForActionUrl(data['actionUrl'])`.

- [ ] **Step 0: Rename the app id.** `grep -rn "com.qnex.hodi" mobile infra .github` must return nothing afterwards; `flutter build apk --debug` and `flutter build ios --simulator --no-codesign` succeed; the installed app shows the new id (`adb shell pm list packages | grep kodihub`).
- [ ] **Step 1: Failing tests** with a fake `FirebaseMessaging` (mocktail or a hand fake): permission denied → `currentToken()` null; granted → token + platform; `onOpen` receives `actionUrl` from message data.
- [ ] **Step 2:** Implement — PASS.
- [ ] **Step 3: Verify** on a real Android device with the dev backend set to `FCM_PROVIDER=fcm`: "Send test notification" from the account screen arrives; tapping it opens the right screen.
- [ ] **Step 4: Part C verification** — all three verification commands green; update `docs/plans` Status to DONE with an Outcome section; update `backend/README.md` (new jobs, settings keys) and `infra/vm/cron/crontab`. **Stop for owner commit** (one commit per task is fine: `feat: late fees`, `feat: lease terms and rent changes`, …).

---

## Not in this phase

- Swahili / translations (missing feature 4).
- WhatsApp (missing feature 3) — dropped by the owner 2026-11-04.
- Bulk rent increase across a whole property (one tenancy at a time here).
- Unit-level residential/commercial override; MRI filing on iTax itself.
- Inspection capture in the Flutter app; offline mode beyond meter readings.

## Done when

- The four review bugs no longer reproduce (console clean on `/login`; phone-width tables and portal tabs usable; old tabs recover after a deploy).
- An agency owner sees what needs doing on the dashboard, can sort tenants by balance, and never sees more than two buttons per tenancy row.
- Late fees (with per-agreement recipients), rent changes, broadcasts (SMS + email + in-app + push), the MRI report and inspections (web and mobile) work end to end in e2e tests and in the browser / simulator.
- The mobile app queues meter readings offline and receives push on a real device (after D11 prerequisites).
- The web app installs from Chrome on Android.

## Outcome (2026-11-04)

- All tasks A1–C9 implemented (C3 dropped; C6m added). Uncommitted on `dev` for the owner to review and commit.
- Final verification: backend lint/typecheck/prettier clean, 183 unit + 132 e2e tests, build OK; frontend lint/typecheck clean, 585 tests, build OK; mobile analyze clean, 70 tests; Android dev APK (`co.ke.kodihub.dev`) and iOS simulator build (`co.ke.kodihub`) succeed.
- Not verified: push on a real device — needs the owner's Firebase project, APNs key and FCM env on the VMs (see infra/vm/README.md).
- Rulings and deferred minors: `.superpowers/sdd/2026-11-04-phase-13-fixes-ux-and-gaps/progress.md`.
