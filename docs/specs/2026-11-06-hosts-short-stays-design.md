# Hosts and short stays — design

**Date:** 2026-11-06
**Status:** draft for owner approval
**Scope:** a third customer type, **host**, alongside landlords and agencies — backend, web
(host dashboard + public booking site) and mobile (host mode).

Throughout, *(owner)* marks what the owner decided; *(my call)* marks a default chosen while
writing this, for the owner to check.

## 1. Why

A real customer rents several units — from different landlords and agencies, some of them not
on KodiHub — and runs them as short-stay BNBs. KodiHub today only knows long-term monthly
tenancies (`rentAmount`, `billingDay`, invoice per `YYYY-MM` period), so it can track that
customer's costs but not their bookings or their income.

The owner's idea: hosts **build their own small BNB business** on KodiHub. Not an Airbnb
integration and not a marketplace — each host has their own branded booking site, guests book
and pay the host directly, and the host runs everything (calendar, bookings, money, cleaning,
expenses) from the KodiHub web and mobile apps. *(owner)*

## 2. Goals

1. **Host accounts.** A host signs up like an agency or landlord does and gets their own
   organisation of a new kind, `HOST`. *(owner)*
2. **Properties and units with nightly prices.** A host has properties; each property has
   units; each unit has its own price and rules. *(owner)* Pricing per unit *(my call, owner
   accepted)*: nightly price; optional weekend price (Friday and Saturday nights); optional
   discount for stays of 7+ nights; optional cleaning fee per stay; special prices for date
   ranges (holidays, high season); minimum nights; maximum guests.
3. **Bookings.** Income on a unit comes from stays: U1 in P1 can take KES 2,000 today,
   nothing tomorrow, then a guest books 7 nights. *(owner)* Each stay has dates, a guest, a
   price breakdown and payments. Two stays never overlap on the same unit.
4. **The host decides the rules.** *(owner)* Per host, overridable per unit *(my call)*:
   - **When the guest pays:** full amount upfront; a deposit upfront (percentage or fixed
     amount) with the balance due N days before check-in or on arrival; or everything on
     arrival.
   - **How bookings are confirmed:** instant, or by request (host accepts or declines).
   - **Cancellation and refunds:** host picks a preset — Flexible (full refund up to 1 day
     before check-in), Moderate (full refund up to 5 days before), Strict (50% refund up to
     7 days before, nothing after) — or sets their own "full refund until N days before, then
     X%". *(my call: presets + custom)*
5. **Expenses and profit.** Hosts record costs — cleaning, utilities, Wi-Fi, repairs and the
   rent they pay their own landlords — and see profit per unit and per property. *(owner)*
6. **Self-booking link.** The host shares a link; guests see the units **with photos**, pick
   dates, and book and pay without the host doing anything. *(owner)*
7. **Their own web address.** `{name}.kodihub.co.ke` in production and
   `{name}.dev.kodihub.co.ke` on dev. *(owner)*
8. **Web and mobile.** Hosts can do everything from both the web app and the mobile app.
   *(owner)* The guest booking site is web only, built for phone browsers. *(my call)*
9. **Running the place** *(my call, owner accepted)*: host staff (caretaker/cleaner) with
   limited access; check-in instructions sent to the guest; cleaning between stays; a guest
   list.

## 3. Non-goals

- **No Airbnb / Booking.com integration** — no calendar sync, no channel manager. *(owner)*
- No marketplace: no search across hosts, no KodiHub-branded listing directory.
- No guest reviews or ratings.
- No card payments; M-Pesa (and cash/bank recorded by the host) only, as for rent today.
- No automatic refunds. KodiHub works out and records the refund; the host sends the money.
- No host's own domain (e.g. `mybnb.co.ke`) in this version. *(my call)*
- No dynamic or automatic pricing.
- No short stays inside LANDLORD or AGENCY organisations in this version; the model must not
  prevent adding that later. *(my call)*
- No tax calculation (tourism levy, VAT, etc.). See §9.

## 4. Anti-goals (a failure even if it works)

- **KodiHub holds guest money.** Guest payments go straight to the host's own paybill/till,
  exactly as rent goes to a landlord's today. *(owner)*
- **A double booking.** Two confirmed or held stays on the same unit for overlapping nights
  must be impossible, including when two guests book the same dates in the same second.
- **A guest has to install an app or create an account** to book.
- **The booking site feels like KodiHub's, not the host's.** Host name, logo and photos lead;
  KodiHub appears only as a small "Powered by KodiHub" footer.
- **One host sees another host's data**, or a guest sees another guest's booking. Org scoping
  applies to every new table; guest booking pages are reachable only by an unguessable link.
- **Breaking landlords, agencies or tenants.** Nothing in the existing rent flow changes.

## 5. Who uses it

| Person | Where | What they do |
|---|---|---|
| Host (owner of the business) | Web app + mobile app | Everything |
| Host staff — manager | Web + mobile | Everything except billing with KodiHub and deleting the business |
| Host staff — caretaker/cleaner | Mobile (web too) | Today's arrivals and departures, check guests in/out, cleaning tasks. **No money, no prices, no guest phone numbers beyond today's stays.** |
| Guest | Host's booking site in a phone browser | Browse, book, pay, see/cancel their booking |

Reuse the existing roles (`OWNER`, `MANAGER`, `ACCOUNTANT`, `CARETAKER`) with new
permissions for listings, bookings, stay payments and the site. *(my call)*

A host can also be a tenant elsewhere (the original customer is): one sign-in, switching
between host mode and tenant mode, as staff and tenant modes work today. Must be tested.

## 6. What it looks like

### 6.1 Host — web and mobile (same features)

- **Today** (home screen): arrivals, departures, guests in-house, units needing cleaning,
  requests waiting for an answer, payments due; this month's income, occupancy and money
  still owed by guests.
- **Calendar:** all units on one timeline (units down the side, days across) on web; one unit
  per month on mobile with a unit picker. Tap empty nights to add a booking or block dates
  (owner use, repairs); tap a stay to open it.
- **Bookings:** list with filters (upcoming, in-house, requests, past, cancelled) and search
  by guest or booking code. A booking shows dates, guest, price breakdown, payments,
  status and history, and the actions: accept/decline (requests), send M-Pesa prompt, record
  cash/bank payment, check in, check out, cancel (with the refund the policy gives, editable
  by the host), mark no-show, message the guest by SMS.
- **Add a booking by hand** (phone and walk-in guests): same price calculation; host can
  change the total.
- **Listings:** properties and units — photos (upload from phone camera on mobile, reorder,
  pick the cover), description, amenities, max guests, beds/bathrooms, prices, special date
  prices, min nights, check-in/out times, check-in instructions, published on the site or not.
- **Guests:** list of everyone who booked, their stays and total spent, notes, and a
  "don't accept again" flag that turns their future bookings into requests.
- **Money:** stay payments, refunds, expenses (existing expenses, with the unit optional),
  and reports — income, expenses and profit per unit / property / month, occupancy rate,
  average nightly rate.
- **Cleaning:** a task appears for a unit when a guest checks out; the caretaker marks it
  done and the unit shows as ready. It does not block bookings. *(my call)*
- **Site settings:** web address, business name, logo, short "about", WhatsApp/phone
  contact, default rules (§2.4), and a preview of the site.
- **Notifications** (push on mobile, in-app on web): new booking, new request, payment
  received, cancellation, request about to expire.

### 6.2 Guest — the booking site

1. **Host home page** — logo, business name, about, contact button (WhatsApp/call), units as
   photo cards with "from KES X / night", and a date + guests search that shows which units
   are free.
2. **Unit page** — photo gallery, description, amenities, max guests, area/location,
   availability calendar, house rules, cancellation policy in plain words, and a price
   calculator that shows the full breakdown before booking. The exact address and check-in
   instructions are **not** shown publicly; they are sent once the stay is confirmed. *(my
   call, for the host's safety)*
3. **Book** — dates, number of guests, name, phone, optional email and note → confirm the
   phone with a one-time SMS code → summary (breakdown, what is paid now and later,
   cancellation policy) → pay or send request.
4. **Booking page** — a private link sent by SMS: status, dates, amount paid and still due
   (with a "pay balance" button), the host's contact, check-in instructions once confirmed,
   and "cancel booking" (shows the refund first; confirmed with a one-time code).

Link previews matter: hosts share these links on WhatsApp, so a shared host or unit link
must preview with the business name, unit name and cover photo.

## 7. How booking and payment work

### 7.1 Statuses

`HELD` (dates held while the guest pays) → `REQUESTED` (waiting for the host) →
`CONFIRMED` → `CHECKED_IN` → `COMPLETED`; or `EXPIRED`, `DECLINED`, `CANCELLED`, `NO_SHOW`.
`HELD`, `REQUESTED`, `CONFIRMED` and `CHECKED_IN` block the unit's nights; host blocks do
too.

### 7.2 Flows

- **Instant + money upfront:** guest confirms → `HELD` for **15 minutes** *(my call)* → M-Pesa
  prompt to the guest's phone → payment arrives → `CONFIRMED`, SMS to guest and host. No
  payment in time → `EXPIRED`, nights free again.
- **Instant + pay on arrival:** guest confirms → `CONFIRMED` straight away.
- **By request:** guest sends request → `REQUESTED`; **no money is taken yet** *(my call — avoids
  refunding declined guests)*. Host accepts → if money is due upfront the guest gets an SMS
  with the booking link and has **12 hours** to pay *(my call)*, else `CONFIRMED`. Host
  declines, or doesn't answer within **24 hours** *(my call)* → `DECLINED`/`EXPIRED`.
- **Balance:** reminder SMS when the balance falls due; the guest pays from the booking page,
  or the host records cash/bank at check-in. An unpaid balance never cancels the stay
  automatically — the host decides.
- **Host without M-Pesa API credentials** (no Daraja on their channel): the site shows the
  paybill/till number and the **booking code as the account number**; the hold lasts
  **2 hours** *(my call)*; the payment is matched automatically if the channel receives C2B
  confirmations, otherwise the host marks it paid.

### 7.3 Money rules

- Money is integer minor units (`BigInt`), as everywhere in KodiHub.
- Price per stay = each night at its price (special date price > weekend price > nightly
  price), minus the 7+ night discount, plus the cleaning fee. The breakdown is stored on the
  booking when it is made; later price changes never change existing bookings.
- Payments and refunds for a stay are recorded against the booking; the booking's paid,
  refunded and owed amounts always equal the sum of its records.
- Income reports count money when received (cash basis), and also show "booked for this
  month" by night. *(my call)*

### 7.4 Guarantees the builder must keep

- **No overlap, enforced by the database** (e.g. a Postgres exclusion constraint on the
  unit + date range for blocking statuses), not only by a check in code.
- **Hold expiry and request expiry run on the server** (scheduled job), not in the browser.
- **One M-Pesa pipeline.** Reuse the existing Daraja STK, callback and C2B matching; extend
  them so a payment can belong to a booking instead of a tenant's invoices. No second
  callback path.
- **Dates are nights in Africa/Nairobi.** Check-out day is free for the next check-in.

## 8. Web addresses

- Each host chooses a name: lowercase letters, digits and hyphens, 3–30 characters, unique.
  Reserved names can't be taken: `www`, `app`, `api`, `dapi`, `dev`, `landing`, `admin`,
  `mail`, `static`, `assets`, `help`, `support`, `status`, `blog`, `docs`. A changed name keeps redirecting for 30 days and stays reserved
  meanwhile. *(my call)*
- An unknown or unpublished name shows a plain "this page doesn't exist" page, never
  another host's site.
- **DNS:** one wildcard record per environment — `*.kodihub.co.ke` → production server,
  `*.dev.kodihub.co.ke` → dev server. Existing fixed names (`app`, `api`, `dev`, `dapi`,
  `landing`) keep their own records, which take precedence over the wildcard. Records stay
  **DNS-only (grey cloud)**, as all KodiHub records are today: Cloudflare's free proxy
  certificate does not cover `*.dev.kodihub.co.ke` (that would need its paid Advanced
  Certificate Manager), but DNS-only records and Caddy's own certificates cost nothing.
- HTTPS for every host name. The current edge is Caddy with one certificate per fixed host.
  Per-host certificates from Let's Encrypt are limited to about 50 new ones a week for
  `kodihub.co.ke` in total, so the builder should use **one wildcard certificate**
  (`*.kodihub.co.ke` in production, `*.dev.kodihub.co.ke` on dev). DNS for `kodihub.co.ke`
  is on **Cloudflare** (checked 2026-11-06), so Caddy gets the wildcard certificate with the Cloudflare DNS plugin. Owner prerequisite: a
  Cloudflare API token limited to *Zone → DNS → Edit* on `kodihub.co.ke`, stored on each
  server as a secret (never in the repo).
- The booking site is served by the existing web app, which shows the guest site when it is
  opened on a host's address. *(my call — one codebase, one deploy)*

## 9. Constraints

- Stack as today: NestJS + Prisma + Postgres backend, React web, Flutter mobile; Caddy edge
  on the GCP VMs.
- Org scoping on every new table; hand-written migrations; `ok()`/`paginated()` responses.
- **Guest personal data** (names, phones, emails, any ID numbers) is personal data under
  Kenya's Data Protection Act. Collect only what a booking needs; ID number optional and
  field-encrypted like tenants' IDs; guest data never leaves the host's organisation. Check
  retention and consent wording with Legal/Compliance before launch.
- **Public endpoints** (site, availability, booking, one-time codes) are rate-limited per IP
  and per phone, validate everything, and reveal only availability — never other guests'
  names or dates of other bookings beyond "not available".
- **Unit photos are public.** A new upload purpose for listing photos, served publicly
  (resized for phones); every other upload stays private as now. Uploads are images only,
  type-checked from the file content (the existing `sniffType`), with a size limit.
- **Tax:** KodiHub does not calculate short-stay taxes (tourism levy, VAT, etc.). Hosts are
  responsible; the owner should confirm with a tax adviser whether KodiHub needs to show any
  of this before launch.
- **SMS** through the existing notifications; push through the existing device tokens
  (Firebase setup on the owner's list still applies).
- Firebase/APNs and store listings stay as the owner's prerequisites.

## 10. Decisions taken on open questions

1. **Dev web address:** `{name}.dev.kodihub.co.ke` instead of `{name}-dev.kodihub.co.ke`,
   because one wildcard DNS record can route it to the dev server; `-dev` would need a DNS
   record per host. Free on Cloudflare as long as records stay DNS-only. *(owner, on
   condition of no paid Cloudflare upgrade — met)*
2. **KodiHub billing for hosts:** counted **per listed (published) unit per month**. *(owner)*
   Amounts are set by the owner in plans, as today.

## 11. Build order

One design, built in four parts, each usable on its own, each on backend + web + mobile:

1. **Host accounts and listings** — `HOST` organisations and sign-up, properties and units
   with photos, prices and rules, site name reserved.
2. **Bookings and calendar** — host-entered bookings and blocks, statuses, the no-overlap
   guarantee, stay payments (M-Pesa prompt, C2B match, cash/bank), refunds, SMS.
3. **The booking site** — host addresses and HTTPS, guest pages, self-booking, holds,
   requests and expiry jobs, guest booking page, link previews.
4. **Money and operations** — expenses per unit, reports and profit, guest list, cleaning
   tasks, host staff permissions, notifications, KodiHub billing for hosts.

## 12. Left to the builder

Table and field names; whether host units reuse the `Unit` table with a linked listing
record (recommended, so tenancy code never sees nightly units) or a separate table; screen
layouts within §6; how the web app detects a host address; how link previews are served;
image resizing approach; job scheduling details; exact SMS wording (plain English, no
jargon).
