# Hosts UI Correction — Handoff Report (2026-11-07)

## 1. Summary of Changes by File

### Web (`frontend/`)
- **`frontend/src/features/stays/money.ts`**:
  - Removed duplicate `formatKes`; kept only whole-shilling input helpers `toMinorString` and `fromMinor`. All host display money now uses `formatKES` from `frontend/src/lib/money.ts`.
- **`frontend/src/features/stays/calendar.ts` & `frontend/src/features/stays/calendar.test.ts`**:
  - Updated `bookingStatusBadge` to return design-system `ad__badge ad__badge--*` classes (`--warn`, `--part`, `--ok`, `--info`, `--off`, `--bad`), plain-English `'Waiting for payment'` for `HELD`, and `st__cal__bar--*` classes for calendar bars.
- **`frontend/src/features/stays/BookingSheet.tsx`**:
  - Rebuilt with `<Sheet>` (`components/Sheet.tsx`), `<Field>` (`features/portfolio/ui.tsx`), `fm__grid`, `fm__input`, `fm__select`, `fm__textarea`, `sh__submit`, `sh__cancel`, `sh__error`, and `formatKES(Number(...))`.
- **`frontend/src/features/stays/BlockSheet.tsx`**:
  - Rebuilt with `<Sheet>`, `<Field>`, `fm__grid`, `fm__input`, `fm__select`, `sh__submit`, `sh__cancel`, and `sh__error`.
- **`frontend/src/features/stays/PaymentSheet.tsx`**:
  - Rebuilt with `<Sheet>`, `<Field>`, M-Pesa STK prompt section (`POST /host/bookings/:id/mpesa-prompt`) + manual payment form (`POST /host/bookings/:id/payments`), `fm__grid`, `fm__input`, `fm__select`, and `formatKES`.
- **`frontend/src/features/stays/RefundSheet.tsx`**:
  - Rebuilt with `<Sheet>`, `<Field>`, `fm__grid`, `fm__input`, `fm__select`, `fm__textarea`, and `formatKES`.
- **`frontend/src/features/stays/CancelSheet.tsx`**:
  - Rebuilt with `<Sheet>`, `<Field>`, dry-run refund preview box (`rp__totals`), `fm__input`, `fm__textarea`, `pf__dangerbtn`, and `formatKES`.
- **`frontend/src/features/stays/SpecialPricesSheet.tsx`**:
  - Rebuilt with `<Sheet>`, `ad__tablewrap`, `ad__table`, `<Field>`, `fm__grid`, `fm__input`, `sh__submit`, `sh__cancel`, and `formatKES`.
- **`frontend/src/features/stays/BookingsPage.tsx`**:
  - Rebuilt to match `ExpensesPage.tsx` / `PaymentsPage.tsx`: `<div className="pg">`, `useListFilters()`, `ad__filters`, `PropertySelect`, status/date/search inputs, `ad__tablewrap`, `ad__table` (`data-label` on cells, `ad__code`, `ad__num`, `ad__badge`), `TableSkeleton`, `EmptyState`, `<Pager>`, and caretaker money-hiding (`can('stay-payments:view')`).
- **`frontend/src/features/stays/GuestsPage.tsx`**:
  - Rebuilt to match `TenantsPage.tsx`: `<div className="pg">`, `useListFilters()`, `ad__filters` search input, `ad__tablewrap`, `ad__table`, `ad__badge ad__badge--bad` (`Do not accept`), `TableSkeleton`, `EmptyState`, `<Pager>`, and caretaker money-hiding.
- **`frontend/src/features/stays/CleaningPage.tsx`**:
  - Rebuilt to match `MaintenancePage.tsx`: `<div className="pg">`, `useListFilters()`, `ad__filters`, `PropertySelect`, status select (`OPEN` / `DONE`), `ad__tablewrap`, `ad__table`, `ad__linkbtn` (`Mark done`), `TableSkeleton`, `EmptyState`, `<Pager>`, and `<Sheet>` for adding a cleaning task.
- **`frontend/src/features/stays/BookingDetailPage.tsx`**:
  - Rebuilt to match `InvoiceDetailPage.tsx` / `PaymentDetailPage.tsx`: `<div className="pg pf__page">`, `<Breadcrumbs>`, `<div className="pf__head">`, `<div className="sl__headactions">`, `<div className="ad__stats pf__stats bl__stats">` (Total, Paid, Refunded, Balance owed — hidden without `stay-payments:view`), `<section className="fm__section">` with `<dl className="pf__facts">` and `<Fact>`, `ad__table` for price breakdown (`<tfoot>` total row) and payments/refunds with inline void action, plus `PaymentSheet`, `RefundSheet`, and `CancelSheet`.
- **`frontend/src/features/stays/GuestDetailPage.tsx`**:
  - Rebuilt to match `TenantDetailPage.tsx`: `<div className="pg pf__page">`, `<Breadcrumbs>`, `<div className="pf__head">`, `<div className="sl__headactions">`, `<section className="fm__section">` with `<dl className="pf__facts">` (`Phone`, `Email`, `ID / Passport`, `Stays`, `Total paid` when permitted, `Notes`), `ad__table` for past & upcoming stays, and `<Sheet>` for editing guest details.
- **`frontend/src/features/stays/TodayPage.tsx`**:
  - Rebuilt to match `DashboardPage.tsx`: `<div className="pg">`, `ad__filters` with `PropertySelect` and quick actions (`+ New booking`, `Block dates`), `ad__stats` stat cards (`Arrivals today`, `Departures today`, `In-house now`, `Requests waiting`, plus `Collected this month` & `Balances owed` when `stay-payments:view` is present), and `<section className="fm__section">` tables (`ad__table`) for `Arriving today`, `Departing today`, `In-house`, `Units to clean` (with inline `Mark done`), and `Requests waiting` (with time remaining).
- **`frontend/src/features/stays/HostReportsPage.tsx`**:
  - Rebuilt to match `ReportsPage.tsx`: `<div className="pg">`, `useListFilters()`, `ad__filters` (`PropertySelect`, `from`, `to`), `ad__stats` summary cards (`Received`, `Booked value`, `Expenses`, `Net profit`, `Occupancy`), `TrendChart` for monthly received vs. net profit, `ad__table rp__table` with `<tfoot data-testid="host-reports-totals-row">` for per-unit profit, and `ad__table` for shared property expenses.
- **`frontend/src/features/stays/CalendarPage.tsx`**:
  - Rebuilt with `<div className="pg">`, `ad__filters` (`PropertySelect`, month picker, `Prev`/`Next`), `st__cal` grid classes (`st__cal__table`, `st__cal__cell`, `st__cal__cell--turnover`, `st__cal__bar--*`), `<Sheet>` for free-date action picker, `BookingSheet`, and `BlockSheet`.
- **`frontend/src/styles/stays.css` & `frontend/src/index.css`**:
  - Created `frontend/src/styles/stays.css` with `st__*` classes using only CSS tokens from `styles/tokens.css` (zero hard-coded hex colours) and imported it in `frontend/src/index.css`.
- **`frontend/src/features/stays/{ListingsPage.tsx,ListingEditorPage.tsx,PhotoManager.tsx,SiteSettingsPage.tsx}`**:
  - Replaced all inline hex colours with CSS variables (`var(--border)`, `var(--surface-muted)`, `var(--muted-foreground)`, `var(--primary)`) and replaced `formatKes` imports with `formatKES` from `lib/money.ts`.
- **`frontend/src/site/{booking.ts,BookingPage.tsx,BookPage.tsx,HomePage.tsx,UnitPage.tsx}`**:
  - Updated guest site money formatting to use `formatMinorKES` (backed by `formatKES` from `lib/money.ts`) instead of importing from `features/stays/money.ts`.

### Mobile (`mobile/`)
- **`mobile/lib/features/host/host_models.dart`**:
  - Deleted `formatHostKes` and unused `intl` formatters.
- **`mobile/lib/features/host/host_api.dart`**:
  - Updated `bookings`, `guests`, and `cleaningTasks` to accept `int page = 1` (`pageSize: 25`) and return `Future<PageResult<T>>` (`({List<T> rows, bool hasMore})`).
  - Updated `sendMpesaPrompt` to return `Future<StkStatus>` and added `stkStatus(String id)` for `StkPaySheet` polling.
- **`mobile/lib/features/host/bookings_screen.dart`**:
  - Switched from `FutureBuilder` to `PagedList<HostBooking>` (`core/widgets/paged_list.dart`) and `formatKes` (`core/money.dart`).
- **`mobile/lib/features/host/guests_screen.dart`**:
  - Switched from `FutureBuilder` to `PagedList<HostGuest>` and replaced `Colors.black54` with `Theme.of(context).colorScheme.onSurfaceVariant`.
- **`mobile/lib/features/host/cleaning_screen.dart`**:
  - Switched from `FutureBuilder` to `PagedList<HostCleaningTask>` and replaced `Colors.black54` with `Theme.of(context).colorScheme.onSurfaceVariant`.
- **`mobile/lib/features/host/payment_sheet.dart` & `mobile/lib/features/host/booking_detail_screen.dart`**:
  - Added `showHostMpesaPromptSheet` using `StkPaySheet` (`core/widgets/stk_sheet.dart`) while preserving `showHostPaymentSheet` for manual payment/refund recording; replaced all `formatHostKes` calls with `formatKes`.
- **`mobile/lib/features/host/{today_screen.dart,listings_screen.dart,host_reports_screen.dart,calendar_screen.dart}`**:
  - Replaced `formatHostKes` with `formatKes` and replaced hard-coded `Colors.*` shades with `HodiColors.*` (`core/theme.dart`) and `Theme.of(context).colorScheme.*`.
- **`mobile/test/features/host/booking_detail_test.dart`**:
  - Added widget test `'bookings list uses PagedList and loads page 2'`.

### Backend (`backend/`)
- **`backend/src/modules/stays/cleaning/{cleaning.dto.ts,cleaning.service.ts,cleaning.controller.ts}`**:
  - Extended `ListCleaningQueryDto` with `PaginationQueryDto` and returned `paginated(items, total, q)` so `GET /host/cleaning` supports `?page=&pageSize=` and returns `{ data, meta }`.

---

## 2. Tailwind Grep Output

Command:
```bash
grep -rnE "\b(text|bg|border)-(slate|gray|red|green|emerald|amber|blue)-[0-9]+|\brounded-(sm|md|lg|xl|full)\b|\b(px|py|mx|my|gap)-[0-9]+\b|\bgrid-cols-[0-9]\b|\btabular-nums\b" frontend/src/features/stays
```
Output:
```text
(empty — 0 matches)
```

---

## 3. Page-by-Page Reference Comparison Notes (Desktop + 390 px)

- **`TodayPage.tsx` vs `DashboardPage.tsx`**:
  - Verified `<div className="pg">` layout, `ad__filters` toolbar with `PropertySelect` and action buttons, `ad__stats` stat cards, and `fm__section` + `ad__table` tables for arrivals, departures, in-house, units to clean, and waiting requests at desktop (1280 px) and mobile (390 px, stacked responsive table cards via `data-label`).
- **`CalendarPage.tsx` vs `styles/stays.css` + `Sheet.tsx`**:
  - Verified `<div className="pg">`, `ad__filters` toolbar, horizontally scrollable `st__cal` table with sticky unit column, status bars (`st__cal__bar--*`), turnover split cell (`st__cal__cell--turnover`), and `<Sheet>` popups (`BookingSheet`, `BlockSheet`, and free-date action picker) at desktop and 390 px.
- **`BookingsPage.tsx` vs `ExpensesPage.tsx` / `PaymentsPage.tsx`**:
  - Verified `useListFilters()`, `ad__filters`, `ad__tablewrap`, `ad__table`, `ad__badge`, `EmptyState`, and `<Pager>` at desktop and 390 px.
- **`BookingDetailPage.tsx` vs `InvoiceDetailPage.tsx` / `PaymentDetailPage.tsx`**:
  - Verified `<div className="pg pf__page">`, `<Breadcrumbs>`, `pf__head`, `sl__headactions`, `ad__stats pf__stats bl__stats`, `fm__section` + `pf__facts` (`<Fact>`), `ad__table` line items and payments/refunds, and `<Sheet>` modals (`PaymentSheet`, `RefundSheet`, `CancelSheet`) at desktop and 390 px.
- **`GuestsPage.tsx` & `GuestDetailPage.tsx` vs `TenantsPage.tsx` & `TenantDetailPage.tsx`**:
  - Verified `useListFilters()`, `ad__filters`, `ad__table`, `<Pager>`, `<Breadcrumbs>`, `<dl className="pf__facts">`, stays table, and `<Sheet>` edit form at desktop and 390 px.
- **`CleaningPage.tsx` vs `MaintenancePage.tsx`**:
  - Verified `useListFilters()`, `ad__filters`, `PropertySelect`, `ad__table`, inline `Mark done` action, `<Pager>`, and `<Sheet>` for new cleaning task at desktop and 390 px.
- **`HostReportsPage.tsx` vs `ReportsPage.tsx`**:
  - Verified `useListFilters()`, `ad__filters`, `ad__stats` KPI cards, `TrendChart`, `ad__table rp__table` with `<tfoot>` totals row (`data-testid="host-reports-totals-row"`), and shared property expenses table at desktop and 390 px.

---

## 4. Exact Test & Verification Counts

- **Web (`frontend/`)**:
  - `npm run lint`: **0 warnings, 0 errors** (328 files)
  - `npm run typecheck`: **0 errors**
  - `npm test`: **49/49 test files passed, 622/622 tests passed**
  - `npm run build`: **clean build** (`dist/assets/GuestSiteApp-*.js` isolated chunk)
- **Mobile (`mobile/`)**:
  - `flutter analyze --fatal-infos`: **No issues found**
  - `dart format --set-exit-if-changed lib test`: **0 changed**
  - `flutter test`: **108/108 tests passed** (107 baseline + 1 new `bookings list uses PagedList and loads page 2` test)
- **Backend (`backend/`)**:
  - `npm run lint`: **0 warnings, 0 errors** (309 files)
  - `npm run typecheck`: **0 errors**
  - `npm test`: **44/44 unit test files passed, 239/239 unit tests passed**
  - `npm run test:e2e`: **29/29 e2e test files passed, 165/165 e2e tests passed**

---

## 5. `git status --short`

```text
 M .superpowers/sdd/2026-11-06-hosts-short-stays/progress.md
 M backend/prisma/schema.prisma
 M backend/src/app.module.ts
 M backend/src/config/env.ts
 M backend/src/modules/auth/auth.dto.ts
 M backend/src/modules/auth/auth.service.ts
 M backend/src/modules/auth/otp.service.ts
 M backend/src/modules/expenses/expenses.dto.ts
 M backend/src/modules/expenses/expenses.service.ts
 M backend/src/modules/files/uploads.controller.ts
 M backend/src/modules/files/uploads.service.ts
 M backend/src/modules/identity.module.ts
 M backend/src/modules/mpesa/inbound.service.ts
 M backend/src/modules/mpesa/matching.spec.ts
 M backend/src/modules/mpesa/matching.ts
 M backend/src/modules/mpesa/mpesa.module.ts
 M backend/src/modules/mpesa/stk.service.ts
 M backend/src/modules/notifications/notifications.service.ts
 M backend/src/modules/organizations/organizations.dto.ts
 M backend/src/modules/organizations/organizations.service.ts
 M backend/src/modules/platform/platform-admin.service.ts
 M backend/src/modules/platform/platform-billing.service.ts
 M backend/src/modules/platform/platform-reports.service.ts
 M backend/src/modules/portfolio/id-numbers.ts
 M backend/src/modules/portfolio/tenancies/tenancies.service.ts
 M backend/src/modules/roles/permissions.spec.ts
 M backend/src/modules/roles/permissions.ts
 M backend/src/modules/roles/roles.service.ts
 M backend/src/prisma/org-scope.extension.ts
 M backend/test/helpers.ts
 M frontend/src/App.tsx
 M frontend/src/app/Sidebar.tsx
 M frontend/src/app/navigation.test.ts
 M frontend/src/app/navigation.ts
 M frontend/src/features/auth/RegisterPage.tsx
 M frontend/src/features/expenses/ExpenseSheet.tsx
 M frontend/src/features/expenses/expenses.test.ts
 M frontend/src/features/expenses/labels.ts
 M frontend/src/features/expenses/rules.ts
 M frontend/src/features/expenses/types.ts
 M frontend/src/index.css
 M frontend/src/lib/auth/types.ts
 M frontend/src/main.tsx
 M frontend/vite.config.ts
 M infra/vm/README.md
 M infra/vm/cron/crontab
 M infra/vm/edge/Caddyfile
 M infra/vm/edge/compose.yml
 M infra/vm/server-setup.sh
 M mobile/lib/core/auth/session.dart
 M mobile/lib/core/auth/session_controller.dart
 M mobile/lib/core/notifications/push_service.dart
 M mobile/lib/core/router.dart
 M mobile/lib/core/widgets/account_sheet.dart
 M mobile/lib/core/widgets/side_drawer.dart
 M mobile/lib/features/auth/register_screen.dart
 M mobile/lib/features/staff/more/expenses_screens.dart
 M mobile/lib/features/staff/staff_widgets.dart
 M mobile/test/core/push_routes_test.dart
?? backend/prisma/migrations/20261106100000_hosts_short_stays/
?? backend/src/modules/stays/
?? backend/test/stays-bookings.e2e-spec.ts
?? backend/test/stays-hosts.e2e-spec.ts
?? backend/test/stays-jobs.e2e-spec.ts
?? backend/test/stays-listings.e2e-spec.ts
?? backend/test/stays-ops.e2e-spec.ts
?? backend/test/stays-payments.e2e-spec.ts
?? backend/test/stays-public.e2e-spec.ts
?? backend/test/stays-reports.e2e-spec.ts
?? backend/test/stays-schema.e2e-spec.ts
?? docs/plans/2026-11-06-hosts-antigravity-brief.md
?? docs/plans/2026-11-06-hosts-short-stays-handoff.md
?? docs/plans/2026-11-06-hosts-short-stays.md
?? docs/plans/2026-11-07-hosts-ui-correction-brief.md
?? docs/plans/2026-11-07-hosts-ui-correction-handoff.md
?? docs/specs/2026-11-06-hosts-short-stays-design.md
?? docs/testing/2026-11-06-hosts-how-to-test.md
?? frontend/.env.example
?? frontend/src/features/stays/
?? frontend/src/site/
?? frontend/src/styles/stays.css
?? infra/vm/edge/Dockerfile
?? mobile/lib/features/host/
?? mobile/test/core/router_test.dart
?? mobile/test/features/
```
