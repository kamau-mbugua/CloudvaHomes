# Hosts — UI correction brief (for Antigravity)

> Read this whole file before changing anything. It is a follow-up to
> `docs/plans/2026-11-06-hosts-antigravity-brief.md`; every rule in that brief still applies
> (never commit/push/deploy, no DB or server access, test-first, no weakened tests, no extra
> scope, plain English, ignore `../CLAUDE.md`).

## Why this exists

The hosts feature works and its tests pass, but **eight web pages were built with Tailwind
utility classes** (`text-slate-500`, `rounded-xl`, `px-4`, `bg-white`, `grid-cols-3`, …).
**This project has no Tailwind.** Nothing defines those classes, so the pages render almost
unstyled and look nothing like the rest of KodiHub. The pop-up forms and list pages also
re-built shared parts instead of using them.

Your job: **make the host screens look and behave exactly like the existing app, using only
what the app already has.** No new features, no API changes, no new dependencies. Do **not**
install Tailwind or any CSS framework.

## What "done" means

- `grep -rnE "\b(text|bg|border)-(slate|gray|red|green|emerald|amber|blue)-[0-9]+|\brounded-(sm|md|lg|xl|full)\b|\b(px|py|mx|my|gap)-[0-9]+\b|\bgrid-cols-[0-9]\b|\btabular-nums\b" frontend/src/features/stays`
  returns **nothing**.
- Every host pop-up form uses `components/Sheet`.
- Bookings, Guests and Cleaning lists page with `components/Pager` (nothing silently cut off).
- Host money on the web uses `lib/money.ts`; `features/stays/money.ts` keeps only what
  `lib/money.ts` doesn't have (whole-shilling input parsing), or is deleted.
- Mobile: the drift items below are fixed.
- All checks green (commands at the end), and every page checked in the browser at desktop
  width **and** 390 px wide.

## Web — the reference pages to copy

Copy structure and class names from these files. Read them first.

| You are building | Copy from | What to take |
|---|---|---|
| A list page with filters, table, empty state, paging | `features/expenses/ExpensesPage.tsx` | `pg`, `ad__filters`, `ad__search`, `ad__select`, `py__daterange`, `bl__headbtns pg-push`, `ad__tablewrap`, `ad__table`, `num`, `ad__sub`, `ad__badge`, `ad__rowactions`, `nx-btn` variants, `ad__error`; `useListFilters()` from `features/portfolio/hooks.ts` for URL filters + page; `TableSkeleton`, `EmptyState`, `Pager` |
| A pop-up form | `features/expenses/ExpenseSheet.tsx` (and the void sheet at the bottom of `ExpensesPage.tsx`) | `<Sheet title footer busy onClose>`, form `id` + footer submit button, `fm__grid`, `fm__wide`, `Field` from `features/portfolio/ui`, `fld__err`, `nx-sheet__error`, `splitFormError` |
| A dashboard with stat tiles and action lists | `features/reports/DashboardPage.tsx`, `features/reports/ActionList.tsx` | `ad__stat`, `ad__stat__label`, `ad__stat__value num`, `ad__stat--link`, the tile grid and action-list markup |
| A report page | `features/reports/ReportsPage.tsx`, `TrendChart.tsx` | period controls, tables, chart (reuse `TrendChart` if the shape fits) |
| A detail page (header, facts, related tables, actions) | `features/payments/PaymentDetailPage.tsx`, `features/tenants/TenantDetailPage.tsx`, `features/portfolio/PropertyDetailPage.tsx` | page header, fact rows, section tables, action buttons |
| Status chips | existing `ad__badge` + tone classes used in `ExpensesPage.tsx` / `features/billing` | one badge style for booking statuses; plain-English labels ("Waiting for payment", not "HELD") |

Tables must use `ad__table`: `main.tsx` adds column labels so tables turn into cards on phones.
Don't build your own phone layout.

### Files to rework

| File | What's wrong | Fix |
|---|---|---|
| `features/stays/TodayPage.tsx` | Tailwind throughout | Rebuild like `DashboardPage`: stat tiles (this month's income, occupancy, owed) + action lists (arrivals, departures, in-house, requests waiting with time left, units to clean, balances due) |
| `features/stays/CalendarPage.tsx` | Tailwind; own modal for the quick-add menu | Grid layout in a new `styles/stays.css` (see below); quick-add opens `BookingSheet` / `BlockSheet` |
| `features/stays/BookingsPage.tsx` | Tailwind; loads first 50 only | Copy `ExpensesPage`: filters (status, unit, dates, search) in the URL via `useListFilters`, `ad__table`, `Pager` |
| `features/stays/BookingDetailPage.tsx` | Tailwind | Copy `PaymentDetailPage` / `TenantDetailPage` structure; breakdown and payments as `ad__table`; actions as `nx-btn` |
| `features/stays/GuestsPage.tsx` | Tailwind; first 50 only | As `BookingsPage`; money column only when present (keep the existing "—"/hidden behaviour) |
| `features/stays/GuestDetailPage.tsx` | Tailwind | Detail-page pattern; keep the "Total paid" tile hidden when the API omits it |
| `features/stays/CleaningPage.tsx` | Tailwind; first 100 only | List pattern + `Pager` |
| `features/stays/HostReportsPage.tsx` | Tailwind (152 classes) | Copy `ReportsPage` |
| `BookingSheet.tsx`, `BlockSheet.tsx`, `PaymentSheet.tsx`, `RefundSheet.tsx`, `CancelSheet.tsx`, `SpecialPricesSheet.tsx` | Copy `Sheet`'s markup (`<div className="sh" role="dialog">`) instead of using it, so there's no Escape, no focus trap, no portal and no "busy" guard | Use `<Sheet>`; pass `busy={mutation.isPending}` |

Leave these alone; they already follow the design: `ListingsPage`, `ListingEditorPage`,
`PhotoManager`, `SiteSettingsPage`, `RulesFields`. Also leave the guest site (`src/site/`)
alone: it is meant to carry the host's own look, with its own `site.css`.

### New styles

Only the calendar grid (and anything truly new, such as booking bars) needs new CSS:

- Create `frontend/src/styles/stays.css`, add `@import './styles/stays.css';` to `index.css`
  next to the other feature sheets.
- Use the variables in `styles/tokens.css` (`--card`, `--foreground`, `--primary`, borders,
  radii, spacing); **no hard-coded hex colours**.
- Prefix classes `st__` (e.g. `st__cal`, `st__cal__bar--confirmed`), like `ex__` / `rp__`.
- Before adding a class, search `styles/*.css` for an existing one that does the job.

### Must not change

- Behaviour, API calls, query keys, routes, permissions, or what each page shows. Existing
  tests in `features/stays/*.test.ts` keep passing unchanged. If a pure helper is unused after
  the rework, delete it together with its test, and say so in the ledger.
- Money hidden without `stay-payments:view` (caretakers): never show "KES 0" instead.

## Mobile — small fixes

| File | Fix |
|---|---|
| `features/host/bookings_screen.dart`, `guests_screen.dart`, `cleaning_screen.dart` (+ `host_api.dart`) | Use `core/widgets/paged_list.dart` `PagedList` (see `features/tenant/tenant_payments_screen.dart`) instead of a fixed `pageSize` of 50–100; API methods take `page` and return `PageResult` |
| `features/host/payment_sheet.dart` (M-Pesa prompt part) | Use `core/widgets/stk_sheet.dart` `StkPaySheet` (see `features/staff/tenants/tenants_screens.dart:531`); keep the manual "record payment" form |
| `features/host/host_models.dart` `formatHostKes` | Delete; use `core/money.dart` `formatKes` everywhere |
| `features/host/calendar_screen.dart` (and the few `Colors.*` in `cleaning_screen`, `guests_screen`, `host_reports_screen`, `listings_screen`) | Theme colours from `core/theme` / `Theme.of(context).colorScheme` instead of `Colors.green.shade50` and similar |

Keep the existing text-scale tests passing (1.3× with no overflow), and add a `PagedList`
"loads page 2" widget test for bookings.

## Order of work

1. Sheets → `Sheet` (smallest, unblocks the pages that open them).
2. Bookings list, Guests list, Cleaning list (list pattern + `Pager`).
3. Booking detail, Guest detail.
4. Today, Reports.
5. Calendar + `stays.css`.
6. Mobile fixes.

After each step: tests, lint, typecheck, then **look at it in the browser** next to the
reference page at desktop width and 390 px. Then add a ledger line.

## Ledger and handoff

- Append to `.superpowers/sdd/2026-11-06-hosts-short-stays/progress.md` under a heading
  `## UI correction (2026-11-07)`, one line per step:
  `UI <n>: complete (files…, tests: <command> → <result>; checked in browser: desktop + 390px)`.
  Every departure from this brief gets a `Ruling:` line.
- When done, write `docs/plans/2026-11-07-hosts-ui-correction-handoff.md`: what changed per
  file, the empty Tailwind grep output, screenshots or a note per page that you compared it with
  its reference, exact test counts, and `git status --short`.

## Commands

```bash
# Web
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
# Mobile
cd mobile && flutter analyze --fatal-infos && dart format --set-exit-if-changed lib test && flutter test
# Backend (should be untouched; run to prove it)
cd backend && npm run lint && npm run typecheck && npm test && npm run test:e2e
```

Expected baseline before you start: web 622 tests, mobile 107, backend 239 unit + 165 e2e.
