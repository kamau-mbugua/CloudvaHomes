# Tenant portal redesign — design

**Date:** 2026-11-05
**Status:** draft for owner approval
**Scope:** tenant side of the web app (`/tenant`) and of the mobile app (tenant mode)

## 1. Why

The owner finds the tenant side "so basic": one long page (balance, how to pay, your home)
plus a row of tabs. Tenants who rent more than one home — sometimes from different
landlords or agencies — have no single place to see where they stand, and switching between
landlords is a small dropdown in the header. The goal is a portal that feels as complete as
the staff app: a proper menu, a detailed dashboard, and easy switching between homes, with a
consolidated view across all of them.

## 2. Goals

- A **side menu** on the web, like the staff app, with a **home switcher at the top**.
- A **detailed dashboard** that, by default, adds up **all the tenant's homes** across every
  landlord/agency they rent from.
- **Switching to one home** narrows the dashboard and the other pages to that home, clearly
  labelled, with a way back to "All my homes".
- The **same structure on mobile**, adapted to the phone: **bottom tabs** with the home
  switcher at the top of every screen.
- Three new pages: **Documents**, **Notices**, **My profile**.

## 3. Non-goals

- No change to how money is recorded, allocated or reconciled; this is a read and
  presentation layer over what exists, plus the existing tenant actions (pay, report a repair,
  acknowledge an inspection).
- No paying several landlords in one M-Pesa transaction (impossible: different paybills).
- No tenant-to-staff chat or replies to notices.
- No Swahili (still out of scope platform-wide).
- No change to the staff app or the owner (landlord) portal.

## 4. Anti-goals (would be a failure even if it works)

- A tenant sees anything belonging to another tenant, or a home they no longer have access
  to. Every new endpoint goes through the existing `as(tenantId, …)` ownership check.
- The combined total silently mixes money owed to different landlords so the tenant pays the
  wrong one. The combined view always shows **who** each amount is owed to.
- The narrowed view (one home) is easy to miss and makes the tenant think bills or payments
  are missing — the same problem staff just hit with property narrowing.

## 5. Decided by the owner

| Topic | Decision |
|---|---|
| Web layout | **Layout A**: side menu; switcher at the top of the menu ("All my homes (N) ▾"); dashboard leads with the total to pay, then one card per home, then chart, activity, maintenance and to-do. |
| Mobile layout | **Bottom tabs**: Home, Bills, Payments, Repairs, More; home switcher chip at the top of every screen. |
| Consolidated view | Default view = all homes, across all landlords/agencies. |
| Pay now | One home selected → straight to the M-Pesa prompt for that landlord. All homes → a list with one line per landlord/agency (amount + **Pay**), paybill/bank details kept for manual payers. |
| Platforms | Web and mobile. |

## 6. Structure

### 6.1 Menu (web side menu / mobile tabs + More)

| Page | Web | Mobile |
|---|---|---|
| Dashboard | menu | tab "Home" |
| Invoices | menu | tab "Bills" |
| Statement | menu | under More |
| Payments | menu | tab "Payments" |
| Maintenance | menu | tab "Repairs" |
| Documents (new) | menu | under More |
| Notices (new) | menu | under More |
| My profile (new) | menu | under More |

Sign out, theme and the notification bell stay in the top bar (web) / More (mobile; bell in
the top bar). On phone-width web, the side menu collapses behind a ☰ button like the staff
app.

### 6.2 The home switcher

- Options: **All my homes (N)**, then one entry per **current or notice tenancy**, labelled
  "`<unit>, <property>` · `<landlord/agency>`". Past tenancies are not listed (their history
  stays visible in Statement/Payments/Invoices under All my homes).
- The choice is remembered on the device (per signed-in user) and restored on return; it
  is **not** a server session setting. Default for a new device: All my homes.
- While one home is selected, every page shows a strip under the top bar: "Showing only
  **G1, Acacia Heights** — Show all my homes". (Mirrors the staff property strip.)
- A tenant with exactly one home sees no switcher and no strip.

### 6.3 What "one home" narrows

A home is a tenancy. Invoices belong to a tenancy; the statement, payments, credit and
deposit belong to the tenant account with that landlord (one account per landlord, which can
cover several homes).

| Page | All my homes | One home selected |
|---|---|---|
| Dashboard | everything, every landlord | that home + its landlord's account totals |
| Invoices | all, each row labelled with home and landlord | that home's invoices |
| Statement | one section per landlord account | that landlord's account statement, with a note when it also covers other homes with the same landlord |
| Payments | all, labelled by landlord | that landlord's account payments (same note) |
| Maintenance | all requests, labelled by home | that home's requests; "Report a repair" pre-selects it |
| Documents | all homes, grouped by home | that home |
| Notices | all | notices from that home's landlord |

### 6.4 Dashboard (web; mobile shows the same blocks stacked)

Top to bottom:

1. **To pay** hero: total owed across the selected scope, the next due date, **Pay now**.
   Credit shown when the tenant is ahead. Owed and credit are never netted **across**
   landlords.
2. **My homes** cards (All my homes only): one per current/notice tenancy — home, landlord,
   status (Paid up / KES X due / KES X overdue, N days late), rent a month, lease end,
   upcoming rent change. Clicking a card selects that home.
3. **Billed vs paid** chart: last 6 months (12 on wide screens), per month invoiced vs
   paid, for the selected scope.
4. **Recent activity**: latest ~8 events in the scope — payments received, invoices issued,
   rent changes scheduled, notices — newest first, each linking to its page.
5. **Maintenance**: open requests count and the latest two with status; link to all.
6. **To do**: things waiting on the tenant — inspections to acknowledge, overdue bills,
   lease ending within 60 days. Hidden when empty.
7. **Deposit held** (small figure) per landlord.

The "How to pay" block moves off the dashboard into the Pay now sheet and a **How to pay**
section on each landlord's statement page (paybill/account, bank details, copy buttons).

### 6.5 New pages

- **Documents**: per home — lease agreement (generated PDF and/or the uploaded signed
  lease), move-in and move-out inspections (open, PDF, "I've checked this"), past invoice
  and receipt PDFs are **not** repeated here (they live on Invoices/Payments).
- **Notices**: the tenant's notification history (what the bell shows, but complete and
  paged): broadcasts from staff, rent change notices, reminders, inspection requests. Each
  shows the landlord it came from and when.
- **My profile**: name (editable via existing `PATCH /me`), phone and email (shown; changing
  them is a staff action — say so), password change (existing flow), and the list of
  landlords/agencies the person rents from.

### 6.6 Pay now

- One home selected: the existing M-Pesa prompt flow (`POST /tenant/accounts/:id/pay`) for
  that landlord account, amount pre-filled with what is owed (editable).
- All my homes: a sheet listing each landlord account with an amount owed > 0: name, amount,
  **Pay** (opens the same prompt flow for that account), and "Other ways to pay" (paybill /
  bank details with copy buttons).

## 7. Data and API

What exists and is reused: `GET /tenant/accounts`, `GET /tenant/accounts/overview`
(consolidated balance/credit/deposit/tenancies/open invoices across accounts),
`GET /tenant/accounts/:id` and its invoices, statement, payments, pay, requests, inspections,
lease PDF / lease document routes; `GET /notifications`; `GET/PATCH /me`; password change.

New, all under the existing tenant ownership checks:

- **Billed vs paid series**: `GET /tenant/accounts/overview/monthly?months=6|12[&tenancyId]`
  → per month: invoiced, paid (allocations by payment date), across the tenant's accounts or
  one tenancy's account.
- **Activity feed**: `GET /tenant/accounts/overview/activity?limit=8[&tenancyId]` → merged,
  newest-first events (payment, invoice, rent change, notice) with a link target.
- **Per-home status** in the consolidated overview: for each tenancy, amount due and amount
  overdue from its own open invoices, days late, next due date.
- **Maintenance across accounts**: either a consolidated list endpoint or the client calls
  each account's `requests` (builder's call; few accounts per person).
- **Notices**: `GET /notifications` already returns the user's notifications (each has an
  `orgId` and `actionUrl`); the Notices page needs paging and the org name per notification,
  and must show only **tenant-facing** notifications — a person who is also staff somewhere
  must not see staff alerts in their tenant Notices.
- **Links from notifications and push** (`actionUrl`, and the mobile app's
  `mobileRouteForActionUrl`) must keep landing on the right page after the routes change.

Money stays BigInt minor units on the server, numbers in JSON as today.

## 8. Mobile

- Replace the 3-tab tenant shell with the 5 tabs above; More lists Statement, Documents,
  Notices, My profile, theme and Sign out.
- Switcher chip at the top of every tenant screen opens a bottom sheet with the same options
  as the web; the choice is stored on the phone.
- Same dashboard blocks, stacked; chart simplified to bars.
- Uses the same new endpoints. Offline: none beyond what the app already does.

## 9. Left to the builder

- Exact visual styling within KodiHub's existing tokens (navy/lime, Lufga, `--font-figures`
  for amounts), icons, empty states and loading skeletons.
- Whether maintenance-across-accounts is one endpoint or client fan-out.
- Paging sizes, chart library (the staff dashboard's existing chart component on web).
- Route paths for the new pages (keep `/tenant/...`).

## 10. My calls (not discussed with the owner — check these)

1. Past tenancies are not in the switcher; their history appears under All my homes.
2. The switcher choice is stored on the device, not on the server, so it can't "stick"
   invisibly across devices the way the staff property default did.
3. Statement and Payments, when one home is selected, show the whole landlord account with a
   note (payments aren't tied to one home).
4. "How to pay" moves from the dashboard into the Pay now sheet and the statement page.
5. Notices = the tenant's full notification history (no new message store).
6. Phone and email are read-only for tenants (changing them stays a staff action, since they
   are how the landlord reaches the tenant and how the tenant signs in).
7. Owed and credit are not netted across different landlords.
8. Notices shows only tenant-facing notifications (not staff alerts for people who are also
   staff).
9. Build order: web first, then mobile, in one plan; the API additions land with the web
   part.
10. Documents is read-only for tenants (no tenant uploads of IDs etc. in this round).
