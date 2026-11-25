# Roadmap features — design

Date: 2026-11-24 · Status: draft, for the owner's review · Revised 2026-11-24 after a check
against the code (corrections marked *Revised*).

## 0. What this covers

The owner picked these items from the competitor comparison (2026-11-24). Each one becomes a
phase with its own plan in `docs/plans/` before it is built. Numbers in brackets are the
numbers in the comparison list.

| Phase | Feature | Priority |
|---|---|---|
| 14 | Notice to vacate and move-out, with the deposit refund [3] | 1 |
| 15 | Vacancy listings and applicants [4] | 1 |
| 16 | Service charges for apartments and estates [5] | 1 |
| 17 | E-signed leases and renewals [6] | 2 |
| 18 | Vendors and work orders [8] | 2 |
| 19 | Caretaker mobile app, with meter OCR [9] | 2 |
| 20 | iCal sync with Airbnb and Booking.com [11] | 3 |
| 21 | Pricing rules for stays [12] | 3 |
| 22 | Guest self check-in and reviews [13] | 3 |
| 23 | Partner financial products [15] | 4 |
| 24 | Accounting export (QuickBooks, Xero, general ledger) [16] | 4 |
| 25 | Public API and webhooks [17] | 4 |
| 26 | Two-factor sign-in and approvals for money [18] | 4 |
| 27 | Visitors and gate passes [19] | 4 |

Items not picked are listed in §15, to be planned in due time.

### Quick wins (first slices, built before the full phases)

Ten small pieces that reuse what exists. Each is ticked when built and tested.

- [x] 1. Tenant gives notice in the portal, with the organisation's notice period and rent in
  lieu of short notice (phase 14). *Done 2026-11-24.*
- [x] 2. Dashboard: move-outs this week, deposit refunds due (phase 14). *Done 2026-11-24:*
  `MOVE_OUTS_THIS_WEEK` (0–7 days, `NOTICE_ENDING` now 8–14) and `DEPOSIT_REFUNDS_PENDING`
  (ended, deposit still held, with the amount), each linking to a tenancy-list filter.
- [x] 3. Calendar export (iCal) per listing for Airbnb and Booking.com (phase 20, export half).
  *Done 2026-11-24:* `Listing.icalToken`, `GET /public/ical/<id>/<token>.ics` (held, requested,
  confirmed and checked-in stays and blocks; dates only), and a copy / new-link box on the
  listing page (web).
- [x] 4. Monthly (28+ night) discount and extra-guest fee (phase 21). *Done 2026-11-24:*
  `Listing.monthlyDiscountBps` (replaces the weekly discount from 28 nights),
  `extraGuestFee` per extra guest per night above `guestsIncluded`; used by every quote (host,
  public site) and kept in each booking's frozen `lines`; fields on the web listing editor.
- [x] 5. Guest register export (phase 22). *Done 2026-11-24:* `GET /host/reports/guest-register`
  (CSV, stays checking in within the dates; ID numbers masked, or full for people who can edit
  guests; every export audited) and a "Guest register" button on the web host reports page.
- [x] 6. Payment history certificate for tenants (phase 23, the part with no partner).
  *Done 2026-11-24:* `PaymentCertificate` (figures frozen at issue, one per tenant, period and
  day), `GET /tenant/accounts/:id/payment-certificate/pdf`, public check at
  `GET /public/certificates/:code` and the web page `/verify/<code>`; on the tenant's
  Documents page (web) and as a document tile (app). No partner, so no Play changes.
- [x] 7. "My devices" page and new-device sign-in alerts (phase 26). *Done 2026-11-24:*
  `GET /me/sessions`, `DELETE /me/sessions/:id`; a Devices tab on the web account page (and on
  the tenant profile), "Your devices" in the app's account menu; a sign-in from a device the
  account hasn't used in 180 days sends an email (SMS if no email) and an in-app notice, never
  on the first sign-in. `/account` now opens the person's own account page.
- [x] 8. Two-factor for organisations' staff (phase 26). *Done 2026-11-24:*
  `Organization.staffTwoFactor` (off / staff who handle money / all staff; changing it needs a
  step-up code), set under Settings → Organisation → Details. After a password sign-in the
  existing second-code challenge (`ADMIN_2FA`, SMS first) applies to those staff; code-only
  sign-in is already a second factor. Authenticator apps (TOTP) remain for the full phase.
- [x] 9. House manual and door code on the guest page (phase 22). *Done 2026-11-24:*
  `Listing.houseManual` and `Listing.accessCodeEnc` (encrypted; the host sees it on request,
  audited). The guest page shows the manual once confirmed and the code only from check-in
  day to check-out day with nothing owed, else a note saying when. Edited on the web listing
  editor.
- [x] 10. Vendor list and assigning maintenance jobs (phase 18, first step). *Done 2026-11-24:*
  `Vendor` (name, phone, trades, archive), `/vendors`, `POST /maintenance-requests/:id/assign`
  (texts the vendor from the organisation's SMS units, with the organisation's number, not the
  tenant's), response times by priority (urgent 1 day, high 3, medium 7, low 14) with a "Late
  only" filter and `WORK_ORDERS_OVERDUE` on the dashboard; Properties → Vendors on the web.

### Rules that apply to every phase

These come from the platform design (`2026-10-27-hodi-platform-design.md`) and apply to every phase:

- Money is in integer minor units (`BigInt`). Dates without a time are `@db.Date`, Africa/Nairobi.
- Every row has an `orgId` and is org-scoped. Every route has a permission check. Every create,
  update or delete that touches money, people or access is written to `AuditLog`.
- Personal data (ID numbers, bank details, signatures, guest IDs) is field-encrypted like
  `Tenant.idNumberEnc`. Files go through `Upload` with a new `UploadPurpose`, are stored
  privately and are served with signed URLs.
- Notifications go through `NotificationsService` (SMS, email, push, in-app) using the
  existing templates and the organisation's SMS route.
- Anything that moves money reuses the ledger (`Payment`, `DepositTransaction`,
  `LandlordLedgerEntry`, `Payout`) and never writes balances directly.
- Each phase adds `ActionKind`s to the dashboard's "Needs attention" list where it makes
  sense (`backend/src/modules/reports/report-math.ts`).
- *Revised.* Anything customers or partners see is named **KodiHQ**, not Hodi or KodiHub:
  headers, event names, docs and messages. This matters most for the public API (phase 25),
  where names can't change once partners build on them.
- *Revised.* When the server fetches or calls a URL a customer typed in (iCal feeds in
  phase 20, webhooks and bank callbacks in phase 25), it guards against server-side request
  forgery: HTTPS only; no private, loopback, link-local or metadata addresses, checked after
  DNS resolution and again on every redirect; a short timeout and a size limit; and no
  credentials or internal headers sent.

---

## 1. Phase 14 — Notice to vacate and move-out [3]

### Why
Today staff can put a tenancy into `NOTICE` (`endDate`, `noticeGivenAt`), record a `MOVE_OUT`
inspection and record a `REFUNDED` deposit transaction, but these are separate screens and
nothing connects them. Competitors run move-out as one guided flow, and the "notice ending"
item on the dashboard should lead somewhere.

### Flow
1. **Notice.** The tenant gives notice in the portal (`/me` → "I'm moving out": move-out
   date, reason, forwarding phone or M-Pesa number), or staff record it. Rules:
   - The minimum notice comes from a new `Organization.noticeDays` setting (default 30), which
     each tenancy can override with `noticeDays`.
   - *Revised.* **Short notice is allowed but paid for:** if the move-out date is sooner than
     the notice period allows, the tenant is billed rent up to the end of the notice period
     ("rent in lieu of notice") unless staff waive it, with a reason that is audited. The
     tenant sees the amount before confirming.
   - The tenancy moves to `NOTICE`. The landlord, the agency staff and the caretaker are told.
   - Staff can withdraw the notice; the tenancy goes back to `ACTIVE`.
2. **Final billing.** The next invoice run pro-rates rent up to `endDate` (the existing
   pro-rating rule) and bills a final meter reading. The caretaker is asked for that reading
   on move-out day.
3. **Exit inspection.** The existing `MOVE_OUT` inspection gets each item compared with the
   `MOVE_IN` one ("was good, now damaged"), with photos. The tenant acknowledges it in the
   portal (`tenantAcknowledgedAt` already exists).
4. **Deposit settlement.** A new `DepositSettlement` per tenancy:
   - Starts from `depositHeld`, minus deductions (damage lines from the inspection, unpaid
     invoices, cleaning and similar fees, each with a reason and an optional photo), giving
     `refundDue`. When the deductions exceed the deposit, the remainder stays as the
     tenant's balance.
   - Status: `DRAFT → SENT_TO_TENANT → AGREED | DISPUTED → APPROVED → PAID`. The tenant can
     agree or dispute in the portal; a dispute stays open until staff resolve it.
   - On approval: unpaid invoices are paid with `APPLIED` deposit transactions, deductions
     are booked as income (and posted to the landlord ledger for agencies), and the refund
     goes out as a `REFUNDED` transaction.
   - The refund is paid through the existing payout rails (M-Pesa B2C or bank) or marked as
     paid manually. The person who approves cannot also release the payout when the
     approval rules in §13 are on.
5. **Close.** The tenancy moves to `ENDED`, the unit becomes vacant (and, with phase 15,
   can be listed straight away), and the tenant gets a final statement PDF. Their portal
   access stays read-only for 12 months *(my call)*.

### Progress (2026-11-25)
- [x] `Organization.noticeDays` (default 30), set in Settings → Organisation → Billing.
- [x] A tenancy can have its own notice period (`Tenancy.noticeDays`), through the API.
- [ ] A screen to set a tenancy's own notice period.
- [x] Tenants give notice in the portal (web dashboard, app profile), with a preview of the
  notice period and any rent in lieu; reason and forwarding phone kept.
- [x] Staff can still record notice (`noticeSource` STAFF) and withdraw it (back to `ACTIVE`).
- [x] Staff get an in-app and push notice when a tenant gives notice.
- [ ] The landlord is told (agencies).
- [x] Short notice: rent in lieu billed up to `noticeEndsOn`, even after move-out (rent only).
- [x] Staff can waive short-notice rent (audited).
- [x] Tenancy list shows who gave notice, the short-notice end and the forwarding number, with
  a "Moving out" filter.
- [x] Dashboard: `MOVE_OUTS_THIS_WEEK` and `DEPOSIT_REFUNDS_PENDING`.
- [ ] Final billing: a final meter reading, with the caretaker asked on move-out day.
- [ ] Exit inspection compared with the move-in one, with photos; tenant acknowledges it.
- [ ] Deposit settlement (`DepositSettlement`, `DepositDeduction`, tenant agrees or disputes,
  approval, refund payout).
- [ ] Close: final statement PDF; portal read-only for 12 months.

### Data
- `Tenancy`: add `noticeSource` (TENANT/STAFF), `forwardingPhone`, `noticeDays?`.
- New `DepositSettlement` (tenancyId unique, status, refundDue, approvedById/At, payoutId?)
  and `DepositDeduction` (settlementId, reason, amount, inspectionItemKey?, photoUploadId?).
- New `ActionKind`s: `MOVE_OUTS_THIS_WEEK`, `DEPOSIT_REFUNDS_PENDING`.

### Out of scope
Small-claims or Rent Restriction Tribunal paperwork, and interest on deposits.

---

## 2. Phase 15 — Vacancy listings and applicants [4]

### Why
Vacant units are lost money. The short-stays engine already publishes listings on a public
site per organisation (`HostSite`, `Listing`, `ListingPhoto`). Long-term vacancies can reuse
it.

### Scope
- **Vacancy listing.** A vacant unit, or one in `NOTICE` with an available-from date, gets a
  `Vacancy` with its title, description, photos (reusing `ListingPhoto` uploads), rent,
  deposit, move-in charges (read from `MoveInCharge`), features and location. Publishing puts
  it on the organisation's public site under `/rent`, sharing the same subdomain, theme and
  legal pages as the stays site. It closes on its own when a tenancy starts.
- **Sharing.** A short link (`ShortLink`) and a WhatsApp/Facebook share text. A list of all
  open vacancies is available as a widget or page for the agency's own website.
- **Enquiries and viewings.** A public form asks for name, phone, move-in date and a message.
  Viewings are booked into slots the organisation sets per property, and the caretaker gets
  an SMS or push. Phones are confirmed by OTP to cut spam, with rate limits from
  `RateLimitBucket`.
- **Applicants.** An `Applicant` pipeline: `ENQUIRY → VIEWING → APPLIED → APPROVED → CONVERTED
  | REJECTED | WITHDRAWN`. The application asks for ID number, employer or business, income
  range, current landlord, and attachments (ID and payslip as uploads). Screening checks
  such as IPRS and CRB are deferred (§15); the record keeps space for them.
- **Waitlist.** An applicant can ask to be told when a unit of a given type, property or
  price range frees up. When one does, the waitlist gets an SMS.
- **Convert.** "Make tenant" creates the `Tenant` and `Tenancy` with the details filled in.
  The move-in invoice goes out, and with phase 17 so does the lease for signing.

### Data
`Vacancy`, `ViewingSlot`, `Viewing`, `Applicant`, `ApplicantNote`, `WaitlistEntry`, plus new
`UploadPurpose` values `APPLICANT_DOCUMENT` and `VACANCY_PHOTO`. Applicant personal data is
deleted 6 months after rejection or withdrawal *(my call; Legal to confirm)*.

### Reports
Days vacant per unit, enquiries → viewings → tenants per vacancy, and where applicants came
from.

### Progress (2026-11-25)
- [ ] Vacancy listings on the public site (`/rent`).
- [ ] Sharing: short link, share text, widget for the agency's site.
- [ ] Enquiries and viewings, with OTP and rate limits.
- [ ] Applicant pipeline and application form.
- [ ] Waitlist.
- [ ] "Make tenant" conversion.
- [ ] Reports.

---

## 3. Phase 16 — Service charges for apartments and estates [5]

### Why
Management companies, residents' associations and developers bill **owners** (not tenants)
for service charges, a sinking fund and shared utilities, and spend from these pools.
Nyumba Zetu and Pango sell this. KodiHQ has the billing engine but only the landlord–tenant
model.

### Model
- **Estate mode** on a property. *Revised:* a new field `Property.mode` (`RENTAL` default,
  `ESTATE`, `SECTIONAL`), not `Property.use`, which already means residential or commercial
  (an estate can be either). It's a mode per property, not a new organisation kind, because
  agencies often manage rentals and estates side by side. Its
  units have **unit owners** (`UnitOwner`: a person or company with a phone, email and share
  or participation quota, using the `Landlord` shape) and may have a tenant too.
- **Who pays.** Each charge type on an estate is billed to the owner, the occupant, or
  "occupant, falling back to the owner" (`ChargeType.billTo`).
- **Funds.** Each `Fund` is a pool per property: operating, sinking or reserve, or a special
  levy. Every service-charge invoice line goes to a fund. Expenses are paid from a fund, and
  fund balances come from the ledger.
- **Budgets and apportionment.** There is a yearly budget per fund. The service charge is
  apportioned by quota, floor area, equal share or a fixed amount per unit type. Changing the
  budget recalculates the monthly or quarterly charge from the next period.
- **Special levies.** A one-off charge on all units (for example "Lift repair 2027"), with
  optional instalments.
- **Owner portal.** The existing owner portal gains a statement per unit, a fund statement
  (income, expenses and balance per fund) and the documents shared with all owners (AGM
  minutes, audited accounts).
- **Arrears.** Arrears use the same reminders and late fees. A new "restrict amenities" flag
  is for phase 27's gate (for example, no visitor passes for units over N days in arrears),
  and it is off by default.

### Data
`UnitOwner`, `Fund`, `FundBudget`, `FundLedgerEntry`, `ChargeType.billTo`, `ChargeType.fundId`,
`Expense.fundId` and `Property.mode`.

*Revised — billing owners is the hard part of this phase.* `Invoice.tenancyId`,
`Invoice.tenantId` and `Payment.tenantId` are required today, and about 19 backend modules rely
on that: statements, reminders, late fees, payment allocation, M-Pesa matching by account code
and the tenant portal. Two ways to bill an owner:

1. **A billing account per unit owner (preferred).** Each `UnitOwner` gets a tenant-like billing
   record and a standing "ownership" tenancy on the unit, flagged so it isn't counted as an
   occupancy, a let unit or a tenant. Statements, reminders, late fees, M-Pesa account codes and
   allocation work unchanged.
2. **A general payer.** Make those columns optional and add `billToOwnerId` everywhere they're
   read. This is cleaner in the long run but touches every module above.

The phase 16 plan decides between them, starting with a spike on option 1.

### Out of scope
Voting and AGM tools, and the legal registration of the management company.

### Progress (2026-11-25)
- [ ] Spike on billing owners (option 1), then the plan.
- [ ] `Property.mode` and unit owners.
- [ ] Who pays per charge type (`ChargeType.billTo`).
- [ ] Funds, budgets and apportionment.
- [ ] Special levies.
- [ ] Owner portal: unit and fund statements, shared documents.
- [ ] Arrears flag for phase 27.

---

## 4. Phase 17 — E-signed leases and renewals [6]

### Why
Leases are created as PDFs today (`leaseUploadId`) but are signed on paper. Renewals are
just a new `leaseEndDate`.

### Scope
- **Templates.** Each organisation has lease templates with merge fields (tenant, unit, rent,
  deposit, dates, charges, clauses). The same engine renders the PDF as today.
- **Signing.** Staff send the lease. The tenant opens a link, reads the PDF, ticks consent
  and signs with an SMS OTP to their verified phone, plus a typed name (and an optional
  drawn signature). The landlord or agent counter-signs the same way.
  - Each signature records time, IP, user agent, OTP id and the PDF's SHA-256. The final PDF
    gets a signature page and an audit trail page. It is stored as `LEASE_DOCUMENT` and
    can't be changed afterwards.
  - Under the Kenya Information and Communications Act, an OTP-confirmed electronic signature
    is generally accepted for leases. **Legal is to confirm** before launch, and to say
    whether leases over 2 years need a different process.
- **Renewals.** 60 days before `leaseEndDate` (today's `LEASES_EXPIRING` item), staff
  send a renewal offer: new end date, new rent (scheduled as a `RentChange`) and changed
  clauses. The tenant accepts (and signs), declines (which can start phase 14 notice), or
  asks to talk. Offers that are not answered remind the tenant at 30 and 14 days.
- **Addenda.** Signed changes during a lease (a pet clause, a parking bay) are added to the
  tenancy's documents.

### Data
`LeaseTemplate`, `SignatureRequest` (document hash, status `SENT/VIEWED/SIGNED/DECLINED/EXPIRED`),
`Signature` (signer, method, evidence), and `RenewalOffer`.

### Progress (2026-11-25)
- [ ] Lease templates with merge fields.
- [ ] Signing by SMS OTP, with evidence and a locked final PDF (Legal to confirm first).
- [ ] Renewal offers and reminders.
- [ ] Addenda.

---

## 5. Phase 18 — Vendors and work orders [8]

### Why
`MaintenanceRequest` goes from `OPEN` to `RESOLVED` with an optional expense, but there is no
one to assign the job to, no quotes, no costs and no SLA.

### Scope
- **Vendors.** A vendor (artisan or company) has trades (the `MaintenanceCategory` values),
  phone, M-Pesa or bank payout details (encrypted), KRA PIN, service area (properties) and a
  rating. Vendors can optionally sign in to a "vendor" place in the workspace switcher with a
  limited view: only their jobs.
- **Work orders.** A maintenance request can have one or more `WorkOrder`s:
  - Status: `DRAFT → SENT → QUOTED → APPROVED → IN_PROGRESS → DONE → VERIFIED → PAID`, or
    `CANCELLED`.
  - The vendor gets an SMS with a link (no app needed) to accept, quote with line items and
    photos, give updates, and mark the job done with photos.
  - Approval limits come from roles: an amount above a set limit needs the manager, or the
    landlord for agencies (in the owner portal).
  - **Who pays:** the landlord (an expense, posted to the landlord ledger), the tenant (a
    charge added to their next invoice), or the estate fund (phase 16).
  - When the job is verified, it becomes an `Expense` (with the existing `expenseId` link)
    and a vendor bill. Paying it reuses payouts.
- **SLA.** The organisation sets a target per priority (for example URGENT 24 h, HIGH 72 h).
  Late jobs go on the dashboard (`WORK_ORDERS_OVERDUE`), and the tenant sees progress in the
  portal and can rate the job.
- **Planned maintenance.** Recurring jobs (tank cleaning, fumigation, lift service) create
  work orders on a schedule, like `RecurringExpense`.

### Data
`Vendor`, `VendorTrade`, `WorkOrder`, `WorkOrderQuoteLine`, `WorkOrderUpdate`, `VendorBill`,
`PlannedJob`, plus new `UploadPurpose` values `WORK_ORDER_PHOTO` and `VENDOR_DOCUMENT`.

### Progress (2026-11-25)
- [x] Vendor list: name, phone, email, trades, notes, archive (Properties → Vendors).
- [ ] Vendor payout details, KRA PIN, service area and rating.
- [ ] Vendor sign-in with a view of their own jobs.
- [x] Assign a maintenance request to a vendor; the vendor gets an SMS with the job and the
  organisation's number (one vendor per request, no link yet).
- [x] The vendor's job link (`/r/<token>`, no sign-in): job details, photos, "done" report.
- [ ] Work orders: statuses, accepting, quotes and updates through the link.
- [ ] Approval limits, who pays, and the expense and vendor bill when verified.
- [x] Response targets per priority (urgent 1 day, high 3, medium 7, low 14), a Late badge and
  filter, and `WORK_ORDERS_OVERDUE` on the dashboard.
- [ ] The organisation sets its own targets.
- [ ] Tenant sees progress in the portal and rates the job.
- [ ] Planned maintenance.

---

## 6. Phase 19 — Caretaker mobile app [9]

### Why
Caretakers do the field work (readings, inspections, move-in and move-out, viewings and jobs),
often with poor network. The Flutter app (`mobile/`) has staff and tenant modes but is not
built for this.

### Scope
- **A caretaker home** in `mobile/` for the Caretaker role (the menu already depends on
  permissions): today's tasks for their properties (readings due, move-outs, viewings,
  work orders, gate approvals from phase 27).
- **Offline first.** Units, meters and the last readings for assigned properties are cached
  locally (SQLite/drift). Readings, inspections and photos are queued and sent when online.
  Each queued item has a client-generated id, so a retry never makes a duplicate (the
  server upserts on it).
- **Meter reading with OCR.** The caretaker takes a photo of the meter. On-device OCR (Google
  ML Kit text recognition, no cost per call) suggests the number, and the caretaker confirms
  or corrects it. Checks: below the last reading, or more than 3× the average use, asks for
  confirmation. The photo is kept as today (`METER_PHOTO`). Whether the OCR was used and
  whether the caretaker edited it is recorded, to measure accuracy.
- **Inspections** use a checklist from the unit's last inspection, with photos per item and
  the tenant signing on the device (phase 17 evidence).
- **Unit status.** Mark a unit as vacant/ready, under repair or needs cleaning, and share
  vacancy photos straight into phase 15.
- **Push** through the existing FCM sender (`DeviceToken`) for new tasks.

### Out of scope
Smart meters and prepaid tokens (deferred, §15).

### Progress (2026-11-25)
- [x] Caretaker home with today's tasks (`GET /reports/today`: meters to read, move-in and
  move-out inspections, open and late repairs).
- [x] Offline queue for readings (phase 13) and inspections, which can't overwrite newer work.
- [ ] Offline cache of meters and units.
- [ ] Meter reading with OCR.
- [ ] Inspections with photos and the tenant's signature.
- [ ] Unit status.
- [ ] Push for new tasks.

---

## 7. Phase 20 — iCal sync with Airbnb and Booking.com [11]

### Why
Hosts who also list on Airbnb or Booking.com get double bookings because KodiHQ's calendar
doesn't know about those bookings. Every channel manager starts with iCal.

### Scope
- **Export.** Each `Listing` has a secret feed URL `/public/ical/<listingId>/<token>.ics` with
  confirmed and held bookings and blocks (dates only, no guest data). The token can be
  rotated.
- **Import.** For each listing, the host adds one or more feed URLs (Airbnb, Booking.com, VRBO
  or other). A job fetches each every 15 minutes, plus a "sync now" button. Fetching follows
  the URL safeguards in "Rules that apply to every phase" (feeds are at most 2 MB):
  - Each imported event becomes an external block (`BookingKind` gets `EXTERNAL`, `source` gets
    the channel name), so the existing `bookings_no_overlap` constraint stops new direct
    bookings on those dates.
  - When an event disappears from the feed, its block is removed. When it changes, the block
    is updated. Each event is keyed by its `UID`.
  - **Conflicts.** If an imported event overlaps a direct booking, the import keeps both,
    flags a conflict, and alerts the host by SMS and push. KodiHQ never cancels a paid guest
    on its own.
- **Health.** Each feed shows its last sync, its last error and how many events it has. After
  6 hours of failures the host gets an alert.

### Data
`CalendarFeed` (listingId, direction, url (encrypted), channel, lastSyncAt, lastError, etag) and
`ExternalEvent` (feedId, uid, from, to, summary, bookingId).

### Out of scope
Two-way API channel managers (Airbnb API, Booking.com Connectivity). These need partner
status; iCal covers most hosts.

### Progress (2026-11-25)
- [x] Export: a secret `.ics` link per listing (stays and blocks, dates only), with copy and
  new-link on the web listing page.
- [ ] Import feeds every 15 minutes and "sync now", with the URL safeguards.
- [ ] External blocks, updates and removals by `UID`.
- [ ] Conflict flags and host alerts.
- [ ] Feed health and failure alerts.

---

## 8. Phase 21 — Pricing rules for stays [12]

### Why
`Listing` has `nightlyPrice`, `weekendPrice`, `minNights` and per-date `SpecialPrice` rows.
Hosts also want seasons, length-of-stay discounts and promo codes without editing each date.

### Scope
- **Price rules per listing**, applied in a fixed order. The quote shows each step to the
  guest and the host:
  1. Base nightly price → weekend price (as today) → **seasons** (date ranges, repeating
     every year, as a price or ± %) → existing `SpecialPrice` (always wins).
  2. **Length-of-stay discounts**: for example 7+ nights −10%, 28+ nights −25%.
  3. **Last-minute and early-bird** adjustments (days before check-in), off by default.
  4. **Promo codes**: % or fixed amount, valid dates, minimum nights, maximum uses, per
     listing or for all listings.
- **Stay rules per season**: minimum and maximum nights, check-in only on certain weekdays,
  and gap nights (an orphan night between bookings can be booked below the minimum).
- **Extra guest fee** above N guests, and a cleaning fee per stay.
- The quote stays in `quote()` in `bookings.service.ts`, as a pure function tested with
  table tests. The booking keeps a frozen copy of the price breakdown.
- **Dynamic pricing based on demand** (from occupancy, events or competitors) is a later
  step. The rules engine leaves room for it.

### Data
`SeasonRule`, `StayDiscountRule`, `PromoCode`, `PromoRedemption`, and `Booking.priceBreakdown`
(Json).

### Progress (2026-11-25)
- [x] Length-of-stay discounts: weekly (existed) and 28+ nights (`monthlyDiscountBps`).
- [x] Extra-guest fee above `guestsIncluded`; cleaning fee per stay (existed).
- [x] Every quote (host and public site) uses them; the booking keeps a frozen copy of the
  price lines.
- [ ] Seasons.
- [ ] Last-minute and early-bird adjustments.
- [ ] Promo codes.
- [ ] Stay rules per season (min/max nights, check-in days, gap nights).

---

## 9. Phase 22 — Guest self check-in and reviews [13]

### Why
Hosts spend time on WhatsApp sending directions and codes, and checking IDs at the door.
`Guest` already has an encrypted ID field, and the check-in details message already goes out
the day before (`sendCheckInInfoIfSoon`).

### Scope
- **Pre-arrival form** (a link in the confirmation message): all guests' names, ID or passport
  number and photo (`GUEST_ID` upload, encrypted, deleted 90 days after checkout *(my call;
  Legal to confirm)*), arrival time, car plate, and agreement to the house rules.
  *Revised:* Kenyan rules for registering guests may require keeping some of this longer
  than 90 days; Legal sets the period, and the guest register export (below) follows it.
- **Guest page** `/b/<code>` (exists): it shows the house manual (Wi-Fi, appliances, rules,
  local tips, per listing) once the form is done. It shows the door or lockbox code only
  from check-in day, after the balance is paid and the form is complete.
- **Self check-in and check-out.** The guest taps "I've arrived" or "I've left". The booking
  moves to checked in or completed (existing statuses), and cleaning is triggered on
  checkout (existing `CleaningTask`).
- **Reviews.** The day after checkout the guest gets a review link: 1–5 stars on cleanliness,
  accuracy, location and value, plus a comment. The host can reply. Published reviews show
  on the public listing page, with an average.
- **The host reviews the guest** (private): a rating and a note. A low rating can suggest
  `doNotAccept`.
- The guest register for the government (if required) can be exported as CSV per stay.

### Data
`GuestRegistration` (bookingId, guests Json, idUploadIds, completedAt), `ListingManual`,
`Listing.accessCodeEnc`, `Review` (bookingId unique, ratings, comment, hostReply, publishedAt),
and `GuestRating`.

### Out of scope
Smart lock integrations (Nuki, TTLock). The code is typed in by the host for now.

### Progress (2026-11-25)
- [x] House manual per listing (`Listing.houseManual`), shown on the guest page once confirmed.
- [x] Door code (`Listing.accessCodeEnc`, encrypted; host views it on request, audited), shown
  from check-in day to check-out day with nothing owed.
- [ ] Pre-arrival form (guests, IDs, arrival time, house rules); the door code also waits for it.
- [ ] Self check-in and check-out.
- [ ] Reviews and host replies on the public listing.
- [ ] The host rates the guest.
- [x] Guest register CSV (IDs masked unless asked for in full; audited).

---

## 10. Phase 23 — Partner financial products [15]

### Why
This is new revenue for KodiHQ and a reason for tenants and landlords to stay. KodiHQ holds
payment history that lenders and insurers value. KodiHQ doesn't lend money itself: partners
do, under their own licences.

### Scope
- **A partner framework.** `FinancialPartner` (name, product, API or manual hand-off, revenue
  share) and `Referral` (who, product, consent record, status, partner reference, and
  commission earned). Each partner is switched on per environment by the superadmin, and
  each organisation can opt out.
- **Products, in order:**
  1. **Rent advance or pay-later for tenants.** In the portal, "Need more time?" shows an
     offer from a partner (for example a licensed digital lender). The partner pays the rent
     to the organisation as a normal `Payment` (channel: partner) and collects from the
     tenant themselves.
  2. **Deposit financing.** At move-in (phase 15 conversion), the deposit is paid by the
     partner and the tenant repays the partner.
  3. **Tenant contents insurance and landlord rent-guarantee insurance**, through a licensed
     insurer or agent. The policy reference is shown on the tenancy.
  4. **Landlord financing** (advances against future rent) from owner statements, for
     agencies.
- **Consent.** Data is sent to a partner only after the person explicitly agrees to that
  product, with what will be shared listed (Kenya Data Protection Act). Each consent is
  stored and can be withdrawn.
- **Rent-payment record.** With consent, a tenant can download a "payment history
  certificate" (PDF with a verification code). Reporting to credit bureaus is later and needs
  a CRB data-provider agreement.

### Google Play
*Revised.* The Android app was declared with no financial features and no data shared with
third parties. Rent advance, pay-later and deposit financing are loan features in Google
Play's terms. Before any of them appear in the app:
- Update the Financial features declaration (personal loans: facilitator).
- Meet Play's personal loan policy for Kenya: the partner must hold a Central Bank of Kenya
  digital credit provider licence (Play asks for a copy), and the app must show the lender,
  the loan's cost and its repayment terms as Play requires.
- Update Data safety: data sent to a partner, with the person's consent, is **shared**.
- Insurance referrals may also need declaring.

Alternatively, the offers stay on the web and only appear in the app once these are done.

### Open points for the owner
Which partners, what revenue share, and Legal and CBK review of each product and its
wording.

### Progress (2026-11-25)
- [x] Payment history certificate: a PDF the tenant downloads (web and app), with a public
  check at `/verify/<code>`.
- [ ] Partner framework (`FinancialPartner`, `Referral`, per-organisation opt-out).
- [ ] Consent records.
- [ ] Rent advance or pay-later.
- [ ] Deposit financing.
- [ ] Insurance.
- [ ] Landlord financing.
- [ ] Google Play declarations, before any loan feature reaches the app.

---

## 11. Phase 24 — Accounting export [16]

### Why
Agencies and larger landlords have external accountants on QuickBooks Online, Xero, Sage or
Excel.

### Scope
1. **A general-ledger view first.** It maps KodiHQ's records to double-entry journals:
   - invoices raise receivables and income per charge type;
   - payments go to cash or bank per channel;
   - deposits are a liability;
   - commission and remittances use the landlord ledger;
   - expenses and MRI tax go to their own accounts.
   Each organisation has a chart-of-accounts mapping with sensible defaults. The journal is
   exported per month as CSV/XLSX (generic, Sage Pastel and QuickBooks Desktop formats). The
   export is read-only and can be run again.
2. **QuickBooks Online and Xero sync** (OAuth per organisation). It pushes customers
   (tenants and landlords), invoices, payments and expenses, or one daily summary journal,
   which the organisation chooses. Each pushed record keeps its external id, so syncing again
   updates it instead of duplicating it. Errors show up in a sync log.
3. **Locking a period.** Once a month is exported or synced, changes to its records need a
   reversal in the next period. This is optional per organisation and pairs with §13.

### Data
`AccountMapping`, `AccountingConnection` (provider, tokens encrypted), `SyncRecord`
(entity, externalId, hash), and `PeriodLock`.

### Progress (2026-11-25)
- [ ] General-ledger view and chart-of-accounts mapping.
- [ ] Monthly journal export (CSV/XLSX).
- [ ] QuickBooks Online and Xero sync.
- [ ] Period locking.

---

## 12. Phase 25 — Public API and webhooks [17]

### Why
Large agencies want to connect KodiHQ to their CRM, website or BI tools, and banks or partners
want events.

### Scope
- **API keys per organisation**, created by the owner, with scopes that match existing
  permissions (read-only by default). They are shown once, stored hashed, can be rotated,
  and have a last-used time. Requests are rate-limited per key with `RateLimitBucket`.
- **The public API is `/api/public/v1`**, a stable subset of the existing OpenAPI: properties,
  units, tenants, tenancies, invoices, payments, vacancies, bookings and maintenance. It has
  cursor pagination, an `Idempotency-Key` header on POST, and its own versioned OpenAPI
  document and docs page.
- **Webhooks.** The organisation registers HTTPS endpoints and picks events, for example
  `payment.received`, `invoice.issued`, `tenancy.started`, `tenancy.notice`, `booking.confirmed`,
  `maintenance.created`, `applicant.created` and `remittance.paid`.
  - Each delivery is signed (HMAC-SHA256, `X-KodiHQ-Signature` with a timestamp). Failed
    deliveries are retried with backoff for 24 h, and there's a delivery log with replay. An
    endpoint is switched off after 3 days of failures, and the owner is told.
  - Events are written in the same transaction as the change (an outbox table) and sent by a
    worker, so no event is lost or sent before the change is committed.
  - Deliveries follow the URL safeguards in "Rules that apply to every phase". Redirects are
    not followed.
- **Banks.** Equity (Jenga), KCB Buni and Co-op Connect adapters go behind the existing
  `BankAdapter`, one at a time as banks sign agreements. This is listed here because it uses
  the same outbox and worker pattern.

### Data
`ApiKey`, `WebhookEndpoint`, `OutboxEvent`, and `WebhookDelivery`.

### Progress (2026-11-25)
- [ ] API keys with scopes.
- [ ] Public API `/api/public/v1` and its docs.
- [ ] Webhooks with signing, retries, delivery log and the outbox.
- [ ] Bank adapters.

---

## 13. Phase 26 — Two-factor sign-in and approvals for money [18]

### Why
*Revised.* What exists today:
- Sign-in is a password or a one-time code (`OtpCode`).
- KodiHQ staff can be made to enter a second code at sign-in (`PlatformSettings.requireAdminTwoFactor`,
  OTP purpose `ADMIN_2FA`).
- Sensitive actions already ask for a fresh code (`requireStepUp()`, OTP purpose `STEP_UP`):
  deleting an account, role changes, payment-channel keys, and support's user actions
  (password resets, changing someone's sign-in details, closing accounts, removing team
  members).

What's missing: authenticator apps, two-factor for organisations' staff, a time window on the
re-check, and approvals. One person can still create and release a payout alone.

This phase **extends the existing step-up and admin code**. It does not build a second
system: an authenticator code becomes one more way to pass the same checks.

### Scope
- **Two-factor sign-in** with an authenticator app (TOTP, RFC 6238) as the default and SMS OTP
  (the existing `ADMIN_2FA` code, opened to organisations' staff) as a fallback. There are 10 one-time recovery codes. Remembering the device for 30 days is
  optional.
  - The organisation owner can **require** two-factor for all staff, or for roles with money
    permissions. The superadmin can require it for platform staff, and it is on by default
    there *(my call)*.
  - Tenants and guests are not asked for two-factor.
- **Step-up check.** The existing `requireStepUp()` gets the authenticator as a method, and a
  10-minute window: sensitive actions ask again if the last check was more than 10 minutes
  ago. Added to the list it already covers:
  - releasing a payout or remittance;
  - changing payout accounts or payment channels;
  - creating API keys;
  - changing roles.
- **Maker–checker approvals.** Rules per organisation, for example "payouts above KES 50,000
  need a second approver" and "deposit refunds always need approval". The person who
  creates an item cannot approve it. Approvals are listed on the dashboard
  (`APPROVALS_PENDING`) and sent as push notifications.
- **Sessions.** The user sees their active sessions and devices (from `RefreshToken`) and can
  sign out of each. They are told about sign-ins from new devices. *Revised:* KodiHQ support
  can already see a person's signed-in device count and sign them out everywhere (Admin →
  People); this adds the person's own view.

### Data
`User.totpSecretEnc`, `User.twoFactorEnabledAt`, `RecoveryCode`, `TrustedDevice`, `ApprovalRule`,
and `ApprovalRequest` (entity, amount, requestedBy, decidedBy, status).

### Progress (2026-11-25)
- [x] Organisations can require a second code for staff: off, staff who handle money, or all
  staff (Settings → Organisation → Details; changing it needs a step-up code). Uses the SMS
  `ADMIN_2FA` code after a password sign-in.
- [ ] Authenticator apps (TOTP) and recovery codes.
- [ ] Remember the device for 30 days.
- [ ] Two-factor on by default for platform staff.
- [ ] Step-up: authenticator as a method, a 10-minute window (5 minutes today), and the added
  actions (payouts, remittances, payout accounts, API keys).
- [ ] Maker–checker approvals and `APPROVALS_PENDING`.
- [x] People see their own devices and sign each out (web account page, tenant profile, app).
- [x] Alerts for sign-ins from a new device (email, or SMS; plus an in-app notice).

---

## 14. Phase 27 — Visitors and gate passes [19]

### Why
Gated estates and apartments (often the same customers as phase 16) log visitors on paper
at the gate. A digital pass is a visible, daily-use feature that keeps residents in the app.

### Scope
- **Pre-registered visitors.** A resident (tenant or owner) creates a pass in the portal or
  app: the visitor's name and phone, the date or date range, and how many entries are
  allowed. The visitor gets an SMS with a QR code and a 6-digit code.
- **Gate app.** A new role, Guard, has a minimal web or mobile screen. The guard scans the QR
  code or types the code, checks the visitor's ID, and records entry and exit, with an
  optional car plate and photo.
- **Walk-in visitors.** The guard records the visitor, and the resident gets a push or SMS to
  approve or reject. If there's no answer in 3 minutes, the guard decides *(my call)*.
- **Deliveries and staff.** These are passes that repeat, for example a house help on weekdays
  or a regular delivery rider.
- **Logs and reports** per property: who was inside at a given time, visitor counts, and a
  CSV export. The log is kept 12 months *(my call; Legal to confirm)*.
- **Linked to phase 16:** an optional rule limits passes for units in arrears. It is off by
  default and needs a sensitive-wording review.

### Data
`VisitorPass` (code hash, QR token, validity, uses), `GateEvent`, and `Guard` (a membership with
the Guard role and assigned gates or properties).

### Progress (2026-11-25)
- [ ] Pre-registered visitor passes (SMS with QR and code).
- [ ] Guard role and gate screen.
- [ ] Walk-in approvals.
- [ ] Repeating passes for deliveries and staff.
- [ ] Logs, reports and CSV export.
- [ ] Arrears rule (phase 16).

---

## 15. Left behind — to be planned in due time

These items from the 2026-11-24 comparison are **not in this round**. They are **to be planned
in due time**: each gets its own spec when the owner schedules it. Where a phase above
depends on one of them, it leaves room for it but does not build it.

### Priority 1
- **[1] KRA eTIMS invoices and one-click iTax MRI filing.** Today the MRI report calculates
  the tax (7.5%, due on the 20th). What's left: eTIMS-compliant invoices (OSCU/VSCU
  integrator), the iTax upload file and PRN. Needs a KRA integrator account first.
  *To be planned in due time.*
- **[2] WhatsApp messaging** (invoices, receipts, reminders, payment links over the WhatsApp
  Business API). Needs a Meta Business Solution Provider. It would sit behind
  `NotificationsService` next to SMS. *To be planned in due time.*

### Priority 2
- **[7] Tenant screening and KYC:** IPRS ID check, CRB/credit check (Metropol, TransUnion),
  references and previous-landlord history. Phase 15 keeps space for it on the applicant.
  *To be planned in due time.*
- **[10] Smart and prepaid meters:** prepaid water and electricity tokens and smart-meter
  readings. Phase 19 keeps manual and OCR readings. *To be planned in due time.*

### Priority 3
- **[14] Card payments for guests** (Pesapal, Flutterwave or Paystack) for foreign guests
  without M-Pesa. *To be planned in due time.*

### Priority 4
- Nothing left behind; all of [15]–[19] are in this round.

### Also deferred inside chosen phases
- Two-way channel managers using the Airbnb and Booking.com APIs (phase 20 does iCal only).
- Demand-based dynamic pricing (phase 21 does rules only).
- Smart locks (phase 22).
- Reporting rent history to credit bureaus (phase 23).
- Voting and AGM tools for estates (phase 16).

---

## 16. Suggested order and open questions

**Order:**
1. 14 → 15 → 16 (priority 1).
2. 26 early, because the money flows in 14 and 18 rely on its approvals. It can be done in
   parallel.
3. 18 → 17 → 19.
4. 20 → 21 → 22.
5. 25 → 24 → 27 → 23. Phase 23 is last because it depends on partner agreements.

**Open questions for the owner**, each with a suggested answer *(revised)*:

| # | Question | Suggested answer |
|---|---|---|
| 1 | Default notice period and the rule for short notice (phase 14) | 30 days, set per organisation. Shorter notice is allowed, with rent billed to the end of the notice period unless staff waive it. |
| 2 | Should vacancies share the stays subdomain, or have their own (phase 15)? | Share it (`/rent`): one public site per organisation. |
| 3 | Service charges: quota or floor area by default; estates as their own organisation kind (phase 16)? | Quota (participation share) by default, floor area as an option. Estates are a mode per property (`Property.mode`), not an organisation kind. |
| 4 | Legal sign-off on OTP e-signatures (17), guest IDs and visitor logs (22, 27), partner products (23), applicant data (15) | Treat Legal's sign-off as a gate before launch for each of these phases. |
| 5 | Partners for phase 23; first accounting target (phase 24) | Partners: the owner's call. Accounting: QuickBooks Online first (more common among Kenyan SMEs); confirm with a few agencies. |
| 6 | Should two-factor be required for money roles from day one (phase 26)? | Yes for staff who release payouts and remittances. Most of the code checks exist already, so it costs little. |

**Phase 26 is smaller than it looks**, because the step-up and admin codes exist (see §13).
