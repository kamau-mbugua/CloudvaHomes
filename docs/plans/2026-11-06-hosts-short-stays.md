# Hosts and Short Stays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third customer type, **host**, that runs its own small BNB business on KodiHub:
listings with photos and nightly prices, bookings on a no-overlap calendar, payments straight
to the host's paybill, a branded self-booking site at `{name}.kodihub.co.ke`, expenses,
profit, guests and cleaning — on backend, web and mobile.

**Architecture:** A new `stays` backend module beside the rent modules, sharing
organisations, properties, units, uploads, payment channels, the Daraja pipeline, expenses,
SMS/push and OTP. Host units keep a `Unit` row plus a 1:1 `Listing`; bookings and host date
blocks live in one `bookings` table guarded by a Postgres exclusion constraint. Pure rule
files (pricing, payment terms, refunds, slugs, statuses, report math) carry the logic and are
unit-tested; services wire them to Prisma. The web app renders the guest site when opened on
a host address; Caddy serves every host address with one wildcard certificate per
environment.

**Tech Stack:** NestJS 12 + Prisma 7 (adapter-pg) + Postgres; React 19 + TanStack Query +
Vite; Flutter + Riverpod + go_router; Caddy 2 with the Cloudflare DNS module.

**Spec:** `docs/specs/2026-11-06-hosts-short-stays-design.md`

## Global Constraints

- **Never `git commit` or `git push`.** The owner does all git. Every "Commit" step below
  means: stop at a clean, tested state and add a line to the ledger with the suggested commit
  message. (Repo rule; overrides the template.)
- Work inline in the main session; no subagents (owner preference).
- Money is integer minor units (`BigInt` / `bigint`); M-Pesa takes whole shillings, so every
  price, fee, deposit, refund and total is a multiple of 100 minor units.
- Dates are nights in **Africa/Nairobi**; a stay `[checkIn, checkOut)` occupies the nights
  `checkIn … checkOut-1`; the check-out day is free for the next check-in.
- Every new org-owned model goes into `ORG_SCOPED_MODELS`
  (`backend/src/prisma/org-scope.extension.ts`).
- Migrations are hand-written in a new folder, applied with `prisma migrate deploy`.
- Responses through `ok()` / `paginated()`; validation errors are 422.
- **Guest money never passes through KodiHub.** Payments go to the host's own channel.
- **No double booking**, enforced by the database.
- Guests book with **no account and no app**: name + phone, confirmed by a one-time SMS code.
- KodiHub branding on the guest site: only a small "Powered by KodiHub" footer.
- Guest personal data stays inside the host's organisation; ID number optional and
  field-encrypted like tenants' (`idNumberEnc`).
- Public endpoints: rate-limited per IP and per phone; reveal availability only.
- Unit photos and the site logo are the only public uploads; images only (`sniffType`),
  max **5 MB**, downscaled on the client to **1600 px** longest side before upload.
- Reserved site names: `www`, `app`, `api`, `dapi`, `dev`, `landing`, `admin`, `mail`,
  `static`, `assets`, `help`, `support`, `status`, `blog`, `docs`. Names: `^[a-z0-9-]{3,30}$`,
  no leading/trailing hyphen.
- Addresses: `{name}.kodihub.co.ke` (prod), `{name}.dev.kodihub.co.ke` (dev).
- Timings: STK hold **15 min**; manual-paybill hold **2 h**; request answer window **24 h**;
  pay-after-accept window **12 h**; a changed site name redirects for **30 days**.
- Cancellation presets: FLEXIBLE = full refund if ≥1 day before check-in, else 0;
  MODERATE = full if ≥5 days, else 0; STRICT = 50% if ≥7 days, else 0; CUSTOM = full if
  ≥N days, else X%.
- Pricing: special date price > weekend price (Friday and Saturday nights) > nightly price;
  7+ night discount on the nights subtotal; cleaning fee per stay.
- KodiHub bills hosts **per published listing per month** (plan amounts unchanged).
- Plain English copy; no jargon; no Swahili.
- Org instructions: secrets only via env/secret files (Cloudflare token never in the repo);
  parameterised SQL only (`$queryRaw` tagged templates).

## Review Focus

1. **Two guests book the same nights at the same moment** → exactly one gets the hold; the
   other gets "those dates were just taken" (409 `DATES_TAKEN`). Pinned in Task 1 and Task 12.
2. **A hold expires while the guest's M-Pesa payment is still arriving** → the late payment is
   still recorded against the booking; if the nights are still free it is confirmed,
   otherwise the booking shows "paid but dates taken" for the host to refund. Pinned in Task 8.
3. **Host changes prices or rules after a booking exists** → the booking's total, breakdown,
   payment terms and cancellation policy do not change. Pinned in Task 7.
4. **A guest on the site sees other guests' data** (names, phones, booking dates beyond
   "unavailable", another booking via a guessed link) → never. Pinned in Task 12.
5. **A caretaker reads guest phone numbers or money** → only today's stays' phones; no
   amounts. Pinned in Task 7.

---

## File structure

```
backend/
  prisma/schema.prisma                                  (modify)
  prisma/migrations/20261106100000_hosts_short_stays/   (create)
  src/prisma/org-scope.extension.ts                     (modify: new models)
  src/modules/stays/
    stays.module.ts
    rules/slug.ts, pricing.ts, terms.ts, status.ts, messages.ts, report-math.ts (+ .spec.ts)
    site/host-site.service.ts, host-site.controller.ts, host-site.dto.ts
    listings/listings.service.ts, listings.controller.ts, listings.dto.ts
    bookings/bookings.service.ts, bookings.controller.ts, bookings.dto.ts, booking-view.ts
    payments/stay-payments.service.ts, stay-payments.controller.ts, stay-payments.dto.ts
    public/public-site.controller.ts, public-site.service.ts, public-site.dto.ts, site-html.ts
    guests/guests.service.ts, guests.controller.ts
    cleaning/cleaning.service.ts, cleaning.controller.ts
    reports/host-reports.service.ts, host-reports.controller.ts
    jobs/stays-jobs.controller.ts
    host-org.ts                                          (assertHostOrg)
  test/stays-*.e2e-spec.ts
frontend/src/
  features/stays/  (listings, bookings, calendar, today, guests, cleaning, reports, site settings)
  site/            (guest booking site: siteHost.ts, GuestSiteApp.tsx, pages, api.ts)
mobile/lib/features/host/  (host_routes, host_shell, screens, host_api, host_models)
infra/vm/edge/Dockerfile, Caddyfile, compose.yml, sites-*/*.caddy   (modify/create)
docs/testing/2026-11-06-hosts-how-to-test.md
```

---

# Part 1 — Host accounts and listings

### Task 1: Schema, migration and the no-overlap guarantee

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261106100000_hosts_short_stays/migration.sql`
- Modify: `backend/src/prisma/org-scope.extension.ts`
- Test: `backend/test/stays-schema.e2e-spec.ts`

**Interfaces:**
- Produces (Prisma models/enums later tasks use, exact names):
  - `enum OrgKind { LANDLORD AGENCY HOST }`
  - `enum ExpenseCategory` + `RENT`; `enum UploadPurpose` + `LISTING_PHOTO`, `SITE_LOGO`;
    `enum OtpPurpose` + `GUEST_BOOKING`
  - `enum BookingKind { STAY BLOCK }`
  - `enum BookingStatus { HELD REQUESTED CONFIRMED CHECKED_IN COMPLETED EXPIRED DECLINED CANCELLED NO_SHOW }`
  - `enum BookingSource { SITE HOST }`
  - `enum StayPaymentKind { PAYMENT REFUND }`
  - `enum CleaningStatus { OPEN DONE }`
  - `model HostSite` (`host_sites`): `id, orgId @unique, slug String? @unique,
    previousSlug String? @unique, previousSlugUntil DateTime?, published Boolean @default(false),
    businessName, about String?, logoUploadId String? @unique, contactPhone String?,
    whatsappPhone String?, rules Json` (a full `StayRules`, Task 2), `houseRules String?,
    checkInTime String @default("14:00"), checkOutTime String @default("10:00")`, timestamps.
  - `model Listing` (`listings`): `id, orgId, unitId @unique, propertyId, title,
    description String?, amenities String[], maxGuests Int, bedrooms Int @default(1),
    bathrooms Int @default(1), nightlyPrice BigInt, weekendPrice BigInt?,
    weeklyDiscountBps Int?, cleaningFee BigInt @default(0), minNights Int @default(1),
    checkInInstructions String?, area String?, rulesOverride Json?` (a `Partial<StayRules>`),
    `published Boolean @default(false)`, timestamps; `@@index([orgId, propertyId])`.
  - `model ListingPhoto` (`listing_photos`): `id, orgId, listingId, uploadId @unique,
    position Int, caption String?`; `@@index([listingId, position])`.
  - `model SpecialPrice` (`special_prices`): `id, orgId, listingId, fromDate @db.Date,
    toDate @db.Date` (nights, inclusive), `nightlyPrice BigInt, label String?`.
  - `model Guest` (`guests`): `id, orgId, name, phone, email String?, idNumberEnc Bytes?,
    notes String?, doNotAccept Boolean @default(false)`, timestamps;
    `@@unique([orgId, phone])`.
  - `model Booking` (`bookings`): `id, orgId, code String` (`B00001`, `@@unique([orgId, code])`),
    `kind BookingKind @default(STAY), unitId, propertyId, listingId, guestId String?,
    checkIn @db.Date, checkOut @db.Date, guests Int @default(1), status BookingStatus,
    source BookingSource, holdExpiresAt DateTime?, requestExpiresAt DateTime?,
    total BigInt @default(0), dueNow BigInt @default(0), balanceDueOn DateTime? @db.Date,
    amountPaid BigInt @default(0), amountRefunded BigInt @default(0), lines Json` (the
    `QuoteLine[]` of Task 2), `rules Json` (the effective `StayRules` snapshot),
    `guestNote String?, hostNote String?, accessTokenHash String? @unique,
    cancelledAt DateTime?, cancelledBy String?` ('GUEST'|'HOST'), `cancelReason String?,
    checkedInAt DateTime?, checkedOutAt DateTime?, infoSentAt DateTime?, createdById String?`, timestamps;
    indexes `[orgId, status]`, `[unitId, checkIn]`, `[guestId]`.
  - `model StayPayment` (`stay_payments`): `id, orgId, bookingId, number String`
    (`SRC-2026-000001`, `@@unique([orgId, number])`), `kind StayPaymentKind,
    method PaymentMethod, channelId String?, amount BigInt` (always > 0; kind gives the sign),
    `reference String?, receivedAt DateTime, inboundId String? @unique, recordedById String?,
    voidedAt DateTime?, voidReason String?, createdAt`.
  - `model CleaningTask` (`cleaning_tasks`): `id, orgId, unitId, bookingId String? @unique,
    status CleaningStatus @default(OPEN), doneAt DateTime?, doneById String?, note String?,
    createdAt`; `@@index([orgId, status])`.
  - `StkRequest.tenantId` becomes nullable; add `StkRequest.bookingId String? @db.Uuid`
    (index); DB check: exactly one of `tenantId`, `bookingId` is set.
  - `InboundTransaction` + `bookingId String? @db.Uuid`, `stayPaymentId String? @db.Uuid`.
  - `Expense` + `unitId String? @db.Uuid` (index `[orgId, unitId, incurredOn]`).
- Produces (DB): exclusion constraint `bookings_no_overlap`:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (
  "unitId" WITH =, daterange("checkIn", "checkOut", '[)') WITH &&
) WHERE ("status" IN ('HELD','REQUESTED','CONFIRMED','CHECKED_IN'));
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dates" CHECK ("checkOut" > "checkIn");
ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_requests_one_payer"
  CHECK (("tenantId" IS NULL) <> ("bookingId" IS NULL));
```

- [ ] **Step 1: Write the failing e2e test** `test/stays-schema.e2e-spec.ts`. Insert rows
  directly with `prisma` (an org of kind `HOST`, property, unit, listing), then:

```ts
it('refuses two blocking bookings on overlapping nights of one unit', async () => {
  await booking({ checkIn: '2026-12-01', checkOut: '2026-12-05', status: 'CONFIRMED' });
  await expect(booking({ checkIn: '2026-12-04', checkOut: '2026-12-06', status: 'HELD' }))
    .rejects.toThrow(/bookings_no_overlap/);
});
it('allows back-to-back stays (check-out day = next check-in)', async () => {
  await booking({ checkIn: '2026-12-01', checkOut: '2026-12-05', status: 'CONFIRMED' });
  await expect(booking({ checkIn: '2026-12-05', checkOut: '2026-12-07', status: 'CONFIRMED' })).resolves.toBeTruthy();
});
it('ignores cancelled and expired bookings', async () => {
  await booking({ checkIn: '2026-12-01', checkOut: '2026-12-05', status: 'CANCELLED' });
  await expect(booking({ checkIn: '2026-12-02', checkOut: '2026-12-03', status: 'HELD' })).resolves.toBeTruthy();
});
it('counts a host BLOCK as taken', async () => {
  await booking({ kind: 'BLOCK', checkIn: '2026-12-10', checkOut: '2026-12-12', status: 'CONFIRMED' });
  await expect(booking({ checkIn: '2026-12-11', checkOut: '2026-12-13', status: 'HELD' })).rejects.toThrow(/bookings_no_overlap/);
});
it('lets two parallel inserts for the same nights produce exactly one row', async () => {
  const r = await Promise.allSettled([1, 2].map(() => booking({ checkIn: '2026-12-20', checkOut: '2026-12-22', status: 'HELD' })));
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
});
```

- [ ] **Step 2: Run it** — `cd backend && npx vitest run --config ./vitest.config.e2e.ts test/stays-schema.e2e-spec.ts`. Expected: FAIL (models do not exist / prisma client has no `booking`).
- [ ] **Step 3: Edit the schema and write the migration** as in Interfaces; add every new
  model (`HostSite`, `Listing`, `ListingPhoto`, `SpecialPrice`, `Guest`, `Booking`,
  `StayPayment`, `CleaningTask`) to `ORG_SCOPED_MODELS`. Run `npx prisma generate` and
  `npx prisma migrate deploy` against the local DB.
- [ ] **Step 4: Run it again.** Expected: 5/5 PASS. Then `npm run typecheck` — fix any
  compile errors from `StkRequest.tenantId` becoming nullable (e.g. `stk.service.ts`
  `visibleTenants`, `view`: treat null as "not a tenant prompt").
- [ ] **Step 5: Full backend unit + e2e suites** (`npm test`, `npm run test:e2e`). Expected:
  all green (the cross-org suite catches any model missing from the scope list).
- [ ] **Step 6: Ledger** — suggested commit `feat(stays): schema for hosts, listings and bookings with no-overlap constraint`.

### Task 2: Pure rules — slugs, pricing, payment terms, refunds, statuses

**Files:**
- Create: `backend/src/modules/stays/rules/{slug,pricing,terms,status}.ts` and `.spec.ts` each

**Interfaces:**
- Produces:
  - `slug.ts`: `RESERVED_SLUGS: ReadonlySet<string>`; `slugProblem(raw: string): string | null`
    (null = fine; messages: "Use 3–30 letters, numbers or hyphens", "Can't start or end with a
    hyphen", "That name is reserved"); `normalizeSlug(raw: string): string` (trim, lower-case).
  - `pricing.ts`:
    ```ts
    export interface PriceInput { nightly: bigint; weekend: bigint | null; weeklyDiscountBps: number | null;
      cleaningFee: bigint; special: { from: string; to: string; nightly: bigint }[] }
    export interface QuoteLine { kind: 'NIGHT' | 'DISCOUNT' | 'CLEANING' | 'ADJUSTMENT'; date?: string; label: string; amount: string } // amount = minor units as string (JSON-safe)
    export interface Quote { nights: number; lines: QuoteLine[]; total: bigint }
    export function nightsOf(checkIn: string, checkOut: string): string[]   // YYYY-MM-DD of each night
    export function quoteStay(checkIn: string, checkOut: string, p: PriceInput): Quote
    ```
  - `terms.ts`:
    ```ts
    export type BookingMode = 'INSTANT' | 'REQUEST';
    export type PayWhen = 'FULL' | 'DEPOSIT' | 'ON_ARRIVAL';
    export type Cancellation = 'FLEXIBLE' | 'MODERATE' | 'STRICT' | 'CUSTOM';
    export interface StayRules { bookingMode: BookingMode; payWhen: PayWhen;
      depositPercent: number | null; depositFixed: string | null;   // minor units as string
      balanceDue: 'BEFORE_CHECKIN' | 'ON_ARRIVAL'; balanceDaysBefore: number;
      cancellation: Cancellation; customFullRefundDays: number | null; customLatePercent: number | null }
    export const DEFAULT_RULES: StayRules  // INSTANT, FULL, null, null, ON_ARRIVAL, 0, MODERATE, null, null
    export function effectiveRules(site: StayRules, override: Partial<StayRules> | null): StayRules
    export function rulesProblem(r: StayRules): string | null
    export function dueNow(r: StayRules, total: bigint): bigint
    export function balanceDueOn(r: StayRules, checkIn: string): string | null
    export function refundFor(r: StayRules, paid: bigint, checkIn: string, cancelDay: string): bigint
    export function describeCancellation(r: StayRules): string   // plain English, used on site and SMS
    ```
  - `status.ts`: `BLOCKING: readonly BookingStatus[]` (`HELD, REQUESTED, CONFIRMED, CHECKED_IN`);
    `canMove(from: BookingStatus, to: BookingStatus): boolean` with exactly these moves:
    HELD→CONFIRMED|EXPIRED|CANCELLED; REQUESTED→HELD|CONFIRMED|DECLINED|EXPIRED|CANCELLED;
    CONFIRMED→CHECKED_IN|CANCELLED|NO_SHOW; CHECKED_IN→COMPLETED.

- [ ] **Step 1: Write the failing specs** (values are the spec's):

```ts
// pricing.spec.ts — Friday 2026-12-04, Saturday 2026-12-05
const p = { nightly: 200000n, weekend: 300000n, weeklyDiscountBps: 1000, cleaningFee: 50000n, special: [] };
it('charges weekend price on Friday and Saturday nights', () => {
  const q = quoteStay('2026-12-03', '2026-12-06', p);       // Thu, Fri, Sat nights
  expect(q.nights).toBe(3);
  expect(q.total).toBe(200000n + 300000n + 300000n + 50000n);
});
it('special date price beats weekend price', () => {
  const q = quoteStay('2026-12-04', '2026-12-05', { ...p, special: [{ from: '2026-12-04', to: '2026-12-04', nightly: 450000n }] });
  expect(q.total).toBe(450000n + 50000n);
});
it('takes 10% off the nights for 7+ nights, rounded down to whole shillings', () => {
  const q = quoteStay('2026-12-07', '2026-12-14', { ...p, weekend: null, nightly: 333300n }); // 7 nights
  // nights 2,333,100; 10% = 233,310 → 233,300 off
  expect(q.lines.find((l) => l.kind === 'DISCOUNT')!.amount).toBe('-233300');
  expect(q.total).toBe(2333100n - 233300n + 50000n);
});
it('rejects check-out on or before check-in', () => {
  expect(() => quoteStay('2026-12-05', '2026-12-05', p)).toThrow();
});
// terms.spec.ts
it('deposit percent rounds up to whole shillings', () => {
  expect(dueNow({ ...DEFAULT_RULES, payWhen: 'DEPOSIT', depositPercent: 30 }, 1234500n)).toBe(370400n);
});
it('fixed deposit never exceeds the total', () => {
  expect(dueNow({ ...DEFAULT_RULES, payWhen: 'DEPOSIT', depositFixed: '900000' }, 500000n)).toBe(500000n);
});
it('pay on arrival needs nothing now', () => expect(dueNow({ ...DEFAULT_RULES, payWhen: 'ON_ARRIVAL' }, 500000n)).toBe(0n));
it.each([
  ['FLEXIBLE', '2026-12-09', 1000000n], ['FLEXIBLE', '2026-12-10', 0n],
  ['MODERATE', '2026-12-05', 1000000n], ['MODERATE', '2026-12-06', 0n],
  ['STRICT', '2026-12-03', 500000n], ['STRICT', '2026-12-04', 0n],
])('%s refund when cancelling on %s for a 2026-12-10 check-in', (c, day, want) => {
  expect(refundFor({ ...DEFAULT_RULES, cancellation: c as Cancellation }, 1000000n, '2026-12-10', day)).toBe(want);
});
it('custom: full until N days, then X%', () => {
  const r = { ...DEFAULT_RULES, cancellation: 'CUSTOM' as const, customFullRefundDays: 3, customLatePercent: 25 };
  expect(refundFor(r, 1000000n, '2026-12-10', '2026-12-07')).toBe(1000000n);
  expect(refundFor(r, 1000000n, '2026-12-10', '2026-12-08')).toBe(250000n);
});
it('balance before check-in is due N days before', () => {
  expect(balanceDueOn({ ...DEFAULT_RULES, payWhen: 'DEPOSIT', depositPercent: 30, balanceDue: 'BEFORE_CHECKIN', balanceDaysBefore: 2 }, '2026-12-10')).toBe('2026-12-08');
});
it('override replaces only the fields it sets', () => {
  expect(effectiveRules(DEFAULT_RULES, { bookingMode: 'REQUEST' })).toEqual({ ...DEFAULT_RULES, bookingMode: 'REQUEST' });
});
// slug.spec.ts
it.each([['ab', false], ['my-bnb', true], ['-bnb', false], ['app', false], ['Cozy Stays', false], ['cozy123', true]])(
  '%s ok=%s', (s, ok) => expect(slugProblem(s) === null).toBe(ok));
// status.spec.ts
it('does not let a completed stay be cancelled', () => expect(canMove('COMPLETED', 'CANCELLED')).toBe(false));
it('lets a request be accepted into a hold', () => expect(canMove('REQUESTED', 'HELD')).toBe(true));
```

  Refund rounding: percentage refunds round **down** to whole shillings.
  `refundFor` days-before = whole days from `cancelDay` to `checkIn`.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/modules/stays/rules`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four files with the signatures above. Use `percentOf` from
  `src/common/money/money.ts` where it fits; date maths on `YYYY-MM-DD` strings in UTC
  (`Date.UTC`), never local time.
- [ ] **Step 4: Run again.** Expected: all PASS.
- [ ] **Step 5: Ledger** — `feat(stays): pricing, payment terms, refund and status rules`.

### Task 3: HOST organisations — sign-up, roles, guards, billing count

**Files:**
- Modify: `backend/src/modules/auth/auth.dto.ts` (`organizationKind` accepts `'HOST'`),
  `backend/src/modules/organizations/organizations.dto.ts` (platform create accepts `'HOST'`),
  `backend/src/modules/auth/auth.service.ts` and the platform org-creation path (create the
  `HostSite` row for HOST orgs inside the creation transaction: `businessName = org.name`,
  `rules = DEFAULT_RULES`, `slug = null`, `published = false`)
- Modify: `backend/src/modules/roles/permissions.ts`, `backend/src/modules/roles/roles.service.ts`
- Create: `backend/src/modules/stays/host-org.ts`, `backend/src/modules/stays/stays.module.ts`
  (register in `app.module.ts`)
- Modify: `backend/src/modules/portfolio/tenancies/tenancies.service.ts` (refuse in HOST orgs)
- Modify: `backend/src/modules/platform/platform-billing.service.ts`
- Modify: `backend/test/helpers.ts` (`onboardOrg` kind accepts `'HOST'`)
- Test: `backend/test/stays-hosts.e2e-spec.ts`, `backend/src/modules/roles/permissions.spec.ts`

**Interfaces:**
- Produces:
  - Permission group `{ group: 'stays', label: 'Short stays' }` with keys:
    `listings:view|create|update|delete`, `bookings:view|create|update`, `bookings:cancel`,
    `stay-payments:view|create`, `stay-payments:refund`, `guests:view|update`,
    `cleaning:view|update`, `site:view|update`.
  - `systemRoleDefaults(kind: OrgKind)` returning the four role definitions. LANDLORD/AGENCY:
    today's `SYSTEM_ROLE_DEFAULTS` minus the `stays` keys. HOST: OWNER = all;
    MANAGER = all except `roles:*`, `channels:manage`, `stay-payments:refund`,
    `settings:update`, `users:delete`; ACCOUNTANT = every `:view` except users/roles/audit +
    `stay-payments:create|refund`, `expenses:create|update`; CARETAKER = `properties:view`,
    `listings:view`, `bookings:view`, `bookings:update`, `cleaning:view`, `cleaning:update`,
    `maintenance:view|create|update`.
  - `RolesService.seedSystemRoles(tx, orgId, kind: OrgKind)` (kind now required; update callers).
  - `host-org.ts`: `async function assertHostOrg(db: Db): Promise<void>` — throws
    `AppError.conflict('This is for short-stay hosts only', 'HOST_ONLY')` when the active org
    is not HOST; `async function isHostOrg(db, orgId): Promise<boolean>`.
  - `PlatformBillingService.billableUnits(client, orgId, date): Promise<number>` — HOST:
    `count(listings where published)`; others: `occupiedUnits`. The monthly run and the
    stats use `billableUnits`.

- [ ] **Step 1: Failing tests.** `permissions.spec.ts`: HOST caretaker has `bookings:update`
  and not `stay-payments:view`; LANDLORD caretaker has no `bookings:*`.
  `stays-hosts.e2e-spec.ts`:
  - `POST /auth/register` with `organizationKind: 'HOST'` → 201, `/me` shows the org kind `HOST`.
  - A HOST owner `POST /tenancies` → 409 `HOST_ORG_NO_TENANCIES` ("Short-stay hosts don't
    have tenancies").
  - One phone number that is a HOST org member and a tenant elsewhere signs in once and
    `/me` lists both the membership and the tenant account (spec §5: must be tested).
  - Billing: a HOST org with 3 listings, 2 published → monthly run bills 2 units.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** them plus `test/billing.e2e-spec.ts`, `test/access.e2e-spec.ts`.
  Expected: PASS.
- [ ] **Step 5: Ledger** — `feat(stays): HOST organisations, stay permissions and billing per listing`.

### Task 4: Site settings and listings API

**Files:**
- Create: `backend/src/modules/stays/site/*`, `backend/src/modules/stays/listings/*`
- Modify: `backend/src/modules/files/uploads.service.ts` (accept `LISTING_PHOTO`, `SITE_LOGO`;
  5 MB max for these; images only)
- Test: `backend/test/stays-listings.e2e-spec.ts`

**Interfaces:**
- Endpoints (all `assertHostOrg`):
  - `GET /host/site` (`site:view`) → `{ slug, published, businessName, about, logoUrl,
    contactPhone, whatsappPhone, rules, houseRules, checkInTime, checkOutTime, address }`
    where `address = slug ? \`https://${slug}.${SITE_DOMAIN}\` : null`.
  - `PATCH /host/site` (`site:update`): any of the above fields. Changing `slug` moves the old
    one to `previousSlug` with `previousSlugUntil = now + 30 days`; a slug that is another
    org's `slug` or live `previousSlug` → 409 `SLUG_TAKEN`; `slugProblem` → 422 on `slug`.
    `published: true` requires a slug (422 "Choose a web address first").
  - `GET /host/site/slug-check?slug=` (`site:view`) → `{ available: boolean, problem: string|null }`.
  - `POST /host/site/logo` (multipart `file`, `site:update`).
  - `GET /host/listings` (`listings:view`, paginated, filter `propertyId`, `published`).
  - `POST /host/listings` (`listings:create`): `{ propertyId, unitNumber, title, ...listing
    fields }` → creates `Unit` (`rentAmount: 0n`) + `Listing` in one transaction.
  - `GET|PATCH|DELETE /host/listings/:id` (delete refused with 409 `LISTING_HAS_BOOKINGS`
    when any booking exists; then unpublish instead).
  - `POST /host/listings/:id/photos` (multipart, up to 20 photos per listing → 422 after),
    `PUT /host/listings/:id/photos/order` `{ photoIds: string[] }` (first = cover),
    `DELETE /host/listings/:id/photos/:photoId` (releases the upload like inspections do).
  - `PUT /host/listings/:id/special-prices` `{ items: {fromDate,toDate,nightlyPrice,label?}[] }`
    (replace all; overlapping ranges → 422).
  - Money fields are strings of minor units in JSON, validated whole shillings
    (`% 100 === 0`, > 0 for prices) → 422 "Use whole shillings".
- `SITE_DOMAIN` env (`kodihub.co.ke` prod, `dev.kodihub.co.ke` dev, `localhost` local) in
  `backend/src/config/env.ts`, default `localhost`.

- [ ] **Step 1: Failing e2e** covering: create property (existing endpoint) → create listing →
  upload 2 photos → reorder (cover = second) → special prices → publish site without slug
  (422) → set slug `cozy-stays` → second HOST org can't take `cozy-stays` (409) → rename to
  `cozy-homes` → third org can't take `cozy-stays` for 30 days (409) → a LANDLORD org gets
  409 `HOST_ONLY` on `/host/listings` → price `150050` → 422.
- [ ] **Step 2: Run.** Expected: FAIL (404 routes).
- [ ] **Step 3: Implement** services/controllers/DTOs (class-validator, like
  `expenses.dto.ts`). Audit every write with `audit.record` (`entity: 'listing' | 'host_site'`).
- [ ] **Step 4: Run** + `npm run lint && npm run typecheck`. Expected: PASS, clean.
- [ ] **Step 5: Ledger** — `feat(stays): host site settings and listings API`.

### Task 5: Web — host sign-up, navigation, listings and site settings

**Files:**
- Modify: `frontend/src/lib/auth/types.ts` (`OrgKind` + `'HOST'`), `frontend/src/features/auth/RegisterPage.tsx`
  (third choice "Short-stay host (BNB)"), `frontend/src/app/navigation.ts` (+ test),
  `frontend/src/App.tsx` (BUILT entries)
- Create: `frontend/src/features/stays/{api.ts,types.ts,money.ts,ListingsPage.tsx,ListingEditorPage.tsx,PhotoManager.tsx,SpecialPricesSheet.tsx,RulesFields.tsx,SiteSettingsPage.tsx,resizeImage.ts}` and tests
- Test: `frontend/src/app/navigation.test.ts`, `frontend/src/features/stays/stays.test.ts`

**Interfaces:**
- Consumes: Task 4 endpoints.
- Produces:
  - `NavEntry.orgKinds?: OrgKind[]` (entry-level, like the group-level one); `filterNav`
    honours both.
  - New group `{ id: 'stays', label: 'Short stays', orgKinds: ['HOST'] }` with entries:
    Calendar `/app/calendar` (`bookings:view`), Bookings `/app/bookings` (`bookings:view`),
    Listings `/app/listings` (`listings:view`), Guests `/app/guests` (`guests:view`),
    Cleaning `/app/cleaning` (`cleaning:view`); settings group gains Booking site
    `/app/settings/site` (`site:view`, `orgKinds: ['HOST']`). Groups `tenants`, `billing`
    get `orgKinds: ['LANDLORD','AGENCY']`; entries Units, Unit setup, Payments get
    `orgKinds: ['LANDLORD','AGENCY']`. (Calendar/Bookings/Guests/Cleaning routes show the
    placeholder until Tasks 10 and 19.)
  - `resizeImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob>` (canvas → JPEG).
  - `toMinorString(kes: string): string | null` / `fromMinor(s: string): string` in
    `features/stays/money.ts` (reject non-whole shillings).
- [ ] **Step 1: Failing tests:** navigation — a HOST owner sees the Short stays group and
  Booking site, not Tenants/Billing/Units/Payments; a LANDLORD owner sees no Short stays.
  `stays.test.ts` — `toMinorString('1500')==='150000'`, `toMinorString('1500.50')===null`;
  RulesFields validation mirrors `rulesProblem` (deposit percent 1–100, custom days ≥ 0).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/app/navigation.test.ts src/features/stays`. Expected: FAIL.
- [ ] **Step 3: Implement** pages: Listings (table: cover thumb, title, property, nightly
  price, published toggle); Listing editor (details, amenities chips, prices, min nights,
  max guests, check-in instructions, rules override with "Use my default" switch, photos
  with drag-to-reorder and cover badge, special prices sheet); Site settings (web address
  with live `slug-check`, business name, about, logo, contacts, default rules, house rules,
  check-in/out times, publish switch, "Open my site" link). Reuse existing form/table/sheet
  components and query-key conventions (`['stays', ...]`).
- [ ] **Step 4: Run** tests, `npm run lint`, `npm run typecheck`, `npm run build`. Expected: clean.
- [ ] **Step 5: Browser check** (local API + Vite): register a host, add a property, a listing
  with photos, set the web address. Screenshot to the scratchpad.
- [ ] **Step 6: Ledger** — `feat(web): host sign-up, listings and booking-site settings`.

### Task 6: Mobile — host mode, listings and site settings

**Files:**
- Modify: `mobile/lib/core/auth/session_controller.dart` (`AppMode.host`; `effectiveMode`
  returns `host` when the active org kind is `HOST` and the user would otherwise be staff),
  `mobile/lib/core/router.dart` (`host` → `/host`; `/host` prefix guard), `mobile/lib/core/auth/session.dart` (kind `HOST`)
- Create: `mobile/lib/features/host/{host_routes.dart,host_shell.dart,host_api.dart,host_models.dart,listings_screen.dart,listing_editor_screen.dart,site_settings_screen.dart,host_more_screen.dart}`
- Test: `mobile/test/features/host/{host_routes_test.dart,listings_test.dart}`, `mobile/test/core/router_test.dart` (redirect cases)

**Interfaces:**
- Produces: `hostRoutes(): List<RouteBase>` — a `StatefulShellRoute` with tabs **Today**
  `/host`, **Calendar** `/host/calendar`, **Bookings** `/host/bookings`, **Listings**
  `/host/listings`, **More** `/host/more`; full-screen pages as top-level routes (lesson from
  the tenant redesign: no `parentNavigatorKey` inside a branch). Tabs filtered by permission:
  a caretaker sees Today, Calendar, More (More shows Cleaning). Today/Calendar/Bookings show a
  "coming soon" body until Tasks 11 and 20.
  - Photos via `image_picker` with `maxWidth: 1600, imageQuality: 80`.
- [ ] **Step 1: Failing tests:** `redirectFor(mode: AppMode.host, location: '/staff')` → `/host`;
  a session with a HOST membership and a tenant account can switch between host and tenant
  mode (existing mode switcher lists both);
  host route table builds without go_router assertions; listings screen shows title,
  nightly price `KES 2,000` and "Published" from a FakeAdapter response; editor rejects
  `2000.50` with "Use whole shillings".
- [ ] **Step 2: Run** `cd mobile && flutter test test/features/host test/core/router_test.dart`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + `flutter analyze --fatal-infos` + `dart format --set-exit-if-changed lib test`. Expected: clean.
- [ ] **Step 5: Ledger** — `feat(mobile): host mode with listings and site settings`.

# Part 2 — Bookings and calendar

### Task 7: Bookings service (host side)

**Files:**
- Create: `backend/src/modules/stays/bookings/{bookings.service.ts,bookings.controller.ts,bookings.dto.ts,booking-view.ts}`
- Test: `backend/test/stays-bookings.e2e-spec.ts`, `backend/src/modules/stays/bookings/booking-view.spec.ts`

**Interfaces:**
- Consumes: Task 2 rules; Task 1 models; `nextCode(tx, orgId, 'booking', 'B', 5)`.
- Produces (`BookingsService`):
  - `quote(listingId, checkIn, checkOut, guests): Promise<{ quote: Quote; rules: StayRules; dueNow: bigint; balanceDueOn: string|null; available: boolean; problems: string[] }>`
    — problems: below `minNights` ("Minimum stay is N nights"), over `maxGuests`, dates taken.
  - `createByHost(dto: { listingId, checkIn, checkOut, guests, guest: { name, phone, email? }, total?: string, note?, confirm: boolean })`
    → status `CONFIRMED` (host bookings never hold), source `HOST`, `total` override allowed
    (adds an `ADJUSTMENT` line for the difference).
  - `block(dto: { unitId, from, to, reason })` → `kind: BLOCK`, status `CONFIRMED`;
    `unblock(id)` → `CANCELLED`.
  - `insertBooking(tx, data)` — the single insert path; maps the `bookings_no_overlap`
    violation to `AppError.conflict('Those dates were just taken', 'DATES_TAKEN')`.
  - `upsertGuest(tx, orgId, { name, phone, email? }): Promise<Guest>` (by `[orgId, phone]`).
  - `move(id, to: BookingStatus, by: { userId|null; actor: 'HOST'|'GUEST'|'SYSTEM' })` — the
    single status-change path, guarded by `canMove`, audited.
  - `accept(id)`: REQUESTED → `HELD` with `holdExpiresAt = now + 12 h` when `dueNow > 0`,
    else `CONFIRMED`. `decline(id, reason?)`.
  - `checkIn(id)`, `checkOut(id)` (→ `COMPLETED`, creates the `CleaningTask`, Task 18 reads
    it), `noShow(id)`.
  - `cancel(id, { refund?: string, reason? , actor })` → `CANCELLED`; returns
    `{ suggestedRefund }` = `refundFor(booking.rules, amountPaid - amountRefunded, checkIn, today)`
    when called with `dryRun: true`.
  - `list(q: { status?, from?, to?, propertyId?, unitId?, q? (guest name/phone/code), page, pageSize })`,
    `get(id)`, `calendar(from, to, propertyId?)` → `{ units: [{ unitId, title, property }], items: [{ id, unitId, kind, status, checkIn, checkOut, guestName|null, code }] }`.
  - `booking-view.ts`: `viewBooking(b, caller: { permissions: ReadonlySet<string> }, today: string)` —
    without `stay-payments:view`: money fields (`total`, `dueNow`, `amountPaid`,
    `amountRefunded`, `lines`) omitted; without `guests:view`: guest phone/email only when
    `checkIn <= today <= checkOut`, else null.
- Endpoints: `GET /host/bookings`, `GET /host/bookings/calendar`, `POST /host/bookings/quote`,
  `POST /host/bookings`, `GET /host/bookings/:id`, `POST /host/bookings/:id/{accept,decline,check-in,check-out,no-show,cancel}`,
  `POST /host/blocks`, `DELETE /host/blocks/:id` — permissions `bookings:view|create|update`,
  `bookings:cancel` for cancel.
- Bookings snapshot `lines`, `rules`, `total`, `dueNow`, `balanceDueOn` at creation; nothing
  later recomputes them (Review Focus 3).

- [ ] **Step 1: Failing tests.** `booking-view.spec.ts`: caretaker (no `guests:view`,
  no `stay-payments:view`) sees today's guest phone, not tomorrow's, never `total`.
  e2e: host books 3 nights → CONFIRMED with total from the quote; overlapping host booking →
  409 `DATES_TAKEN`; host block then booking inside it → 409; host changes the nightly price
  → existing booking's `total` and `lines` unchanged; cancel dry-run on a MODERATE booking
  paid KES 10,000, 6 days before → `suggestedRefund: '1000000'`; `checkOut` creates a
  cleaning task; `COMPLETED → cancel` → 409 `INVALID_STATUS`; caretaker `GET /host/bookings/:id`
  has no `total`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + lint/typecheck. Expected: PASS.
- [ ] **Step 5: Ledger** — `feat(stays): host bookings, blocks, statuses and calendar API`.

### Task 8: Stay payments — manual, refunds, M-Pesa prompt and paybill matching

**Files:**
- Create: `backend/src/modules/stays/payments/*`
- Modify: `backend/src/modules/mpesa/stk.service.ts` (booking prompts), `backend/src/modules/mpesa/inbound.service.ts` (booking match), `backend/src/modules/mpesa/matching.ts` (+ spec)
- Test: `backend/test/stays-payments.e2e-spec.ts` (uses the `FakeDaraja` pattern from `test/mpesa.e2e-spec.ts`), `backend/src/modules/mpesa/matching.spec.ts`

**Interfaces:**
- Produces (`StayPaymentsService`):
  - `record(tx, p: { bookingId, kind: 'PAYMENT'|'REFUND', method, channelId?, amount: bigint, reference?, receivedAt, inboundId? }): Promise<string>`
    — the only writer; number via `nextCode`-style yearly counter `SRC-YYYY-NNNNNN`
    (counter name `stay-receipt-YYYY`); updates `amountPaid` / `amountRefunded` in the same
    transaction; refund > (paid − refunded) → 422.
  - `afterPayment(tx, bookingId)`: when `status = HELD` and `amountPaid ≥ dueNow` →
    `CONFIRMED`. When status is `EXPIRED`/`CANCELLED` and money arrives: try to re-insert as
    CONFIRMED (re-apply the overlap guard by updating status inside a savepoint); on
    `DATES_TAKEN` leave it and set `hostNote = 'Paid after the hold ended and the dates were taken — refund the guest'`
    and notify staff (Review Focus 2).
  - Manual entry `POST /host/bookings/:id/payments` (`stay-payments:create`)
    `{ method: 'CASH'|'BANK_ACCOUNT'|'MPESA_PAYBILL'|'MPESA_TILL', channelId?, amount, reference?, receivedAt? }`;
    an M-Pesa code matching an unmatched `InboundTransaction.providerRef` on that channel links
    it (`inboundId`, inbound `matchStatus = MATCHED`, `bookingId`, `stayPaymentId`).
  - `POST /host/bookings/:id/refunds` (`stay-payments:refund`) `{ amount, method, reference?, note? }`.
  - `POST /host/bookings/:id/payments/:paymentId/void` (`stay-payments:refund`).
  - `StkService.pushForBooking({ bookingId, amount, phone }): Promise<StkView>` — channel =
    the host's active MPESA channel with Daraja set (first by name); `accountRef = booking.code`;
    `description: 'Stay'`. 409 `NO_MPESA_PROMPT` when the host has none.
  - `handleCallback` success for a booking prompt → `inbound.receive(channel, input, { bookingId })`.
  - `InboundService.receive(..., target?: { tenantId, invoiceIds } | { bookingId })` — booking
    target records a `StayPayment` (method from channel kind) instead of a tenant `Payment`.
  - `guessesFor` gains `{ kind: 'booking'; code }` for `/^B\d{5,}$/`, tried first; `match`
    resolves it in HOST orgs to `{ bookingId }`.
  - `POST /host/bookings/:id/mpesa-prompt` (`stay-payments:create`) `{ amount?, phone? }`
    (defaults: amount still owed, guest phone).
- [ ] **Step 1: Failing tests.** `matching.spec.ts`: `guessesFor('b00012')[0]` is
  `{ kind: 'booking', code: 'B00012' }`. e2e: HELD booking (seed via service) + STK
  success callback for `dueNow` → CONFIRMED, one StayPayment, receipt `SRC-2026-000001`;
  replayed callback → still one payment; C2B confirmation with account `B00001` →
  payment linked; cash payment then refund of more than paid → 422; payment arriving after
  the hold EXPIRED with nights free → CONFIRMED; with nights since taken → stays EXPIRED,
  hostNote set, staff notification created; tenant STK flow in `test/mpesa.e2e-spec.ts`
  still passes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** this file + `test/mpesa.e2e-spec.ts` + `test/payments.e2e-spec.ts`. Expected: PASS.
- [ ] **Step 5: Ledger** — `feat(stays): stay payments, refunds, M-Pesa prompts and booking-code matching`.

### Task 9: Booking messages — SMS to guests, notifications to staff

**Files:**
- Create: `backend/src/modules/stays/rules/messages.ts` (+ spec)
- Modify: `bookings.service.ts`, `stay-payments.service.ts` (send after commit)
- Test: `messages.spec.ts`; assertions on `outbox` added to `stays-bookings` / `stays-payments` e2e

**Interfaces:**
- Produces `guestSms(event, d): string` for events and exact copy:
  - `REQUESTED`: `"{biz}: we got your request for {unit}, {in}–{out}. We'll reply within 24 hours. Booking {code}: {link}"`
  - `CONFIRMED`: `"{biz}: your stay at {unit}, {in}–{out} is confirmed. Booking {code}: {link}"`
  - `PAY_NOW` (accepted request with money due): `"{biz}: your request is accepted. Pay {amount} within 12 hours to keep the dates: {link}"`
  - `PAYMENT`: `"{biz}: we received {amount} for booking {code}. Still to pay: {due}."`
  - `DECLINED`: `"{biz}: sorry, {unit} isn't available for {in}–{out}."`
  - `EXPIRED`: `"{biz}: your booking {code} wasn't paid in time, so the dates were released."`
  - `CANCELLED`: `"{biz}: booking {code} is cancelled. Refund: {refund}."`
  - `BALANCE_DUE`: `"{biz}: {due} is due for your stay on {in}. Pay here: {link}"`
  - `CHECKIN_INFO`: `"{biz}: welcome on {in}! Check-in from {time}. {instructions}"` (sent on
    confirmation when check-in is within 2 days, else the morning before check-in)
  Dates as `12 Dec`; money via the existing KES formatter; `{link}` = guest booking page
  (Task 12) — empty-string safe for host-made bookings without a token.
- Staff notifications via `notifyOrgStaff(orgId, { kind: 'STAY_NEW'|'STAY_REQUEST'|'STAY_PAYMENT'|'STAY_CANCELLED'|'STAY_REQUEST_EXPIRING', title, body, actionUrl: '/app/bookings/{id}' })`.
- [ ] **Step 1: Failing spec** for every event's text with fixed sample data; e2e: a confirmed
  host booking puts one `CONFIRMED` SMS in `outbox` for the guest phone.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** (SMS only after the transaction commits).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Ledger** — `feat(stays): guest SMS and staff notifications for bookings`.

### Task 10: Web — Today, calendar and bookings

**Files:**
- Create: `frontend/src/features/stays/{TodayPage.tsx,CalendarPage.tsx,calendar.ts,BookingsPage.tsx,BookingDetailPage.tsx,BookingSheet.tsx,BlockSheet.tsx,PaymentSheet.tsx,RefundSheet.tsx,CancelSheet.tsx}` (+ tests)
- Modify: `frontend/src/App.tsx` (BUILT: `calendar`, `bookings` with `:bookingId`; `/app` dashboard renders `TodayPage` for HOST orgs)

**Interfaces:**
- Consumes: Task 7/8 endpoints.
- Produces `calendar.ts` (pure): `dayColumns(from: string, days: number): string[]`;
  `barFor(item, from, days): { start: number; span: number; clippedLeft: boolean; clippedRight: boolean } | null`
  (`span` counts nights; a stay checking out on day *d* ends before column *d*).
- Today: arrivals, departures, in-house, requests waiting (with time left), units to clean,
  balances due; this month's income, occupancy, owed.
- Calendar: units down, 14 days across (← → and "Today"), bars coloured by status, drag
  not required; click empty cell → BookingSheet/BlockSheet with that unit and date.
- Booking detail: status chip, dates, guest, breakdown, payments/refunds list, actions per
  status (accept/decline, M-Pesa prompt, record payment, refund, check in/out, no-show, cancel
  with suggested refund pre-filled).
- [ ] **Step 1: Failing tests:** `barFor` for a stay 2026-12-03→2026-12-06 in a window from
  2026-12-04, 14 days → `{ start: 0, span: 2, clippedLeft: true, clippedRight: false }`;
  BookingDetail shows "Accept"/"Decline" only for REQUESTED; CancelSheet pre-fills the
  dry-run refund.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, lint, typecheck, build; browser check (book, block, pay cash,
  check in/out). Expected: clean.
- [ ] **Step 5: Ledger** — `feat(web): host today, calendar and bookings`.

### Task 11: Mobile — Today, calendar and bookings

**Files:**
- Create: `mobile/lib/features/host/{today_screen.dart,calendar_screen.dart,calendar_rules.dart,bookings_screen.dart,booking_detail_screen.dart,booking_form_screen.dart,payment_sheet.dart}`
- Test: `mobile/test/features/host/{calendar_rules_test.dart,today_test.dart,booking_detail_test.dart}`

**Interfaces:**
- `calendar_rules.dart`: `List<DayState> monthDays(String month, List<CalItem> items)` where
  `DayState { date, status: free|booked|blocked|checkIn|checkOut|turnover }` (turnover =
  one stay checks out and another checks in that day).
- Calendar: one unit at a time (picker at top), month grid; tap free day → booking form or
  block. Booking detail mirrors web actions; money hidden for callers without
  `stay-payments:view` (the API omits it; the UI must not show "KES 0").
- [ ] **Step 1: Failing tests:** `monthDays` marks 2026-12-05 `turnover` for stays
  12-01→12-05 and 12-05→12-07; booking detail for REQUESTED shows Accept and Decline;
  caretaker detail shows no money rows; text scale 1.3× has no overflow.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests, analyze, format. Expected: clean.
- [ ] **Step 5: Ledger** — `feat(mobile): host today, calendar and bookings`.

# Part 3 — The booking site

### Task 12: Public site API — browse, quote, verify, book, pay, cancel

**Files:**
- Create: `backend/src/modules/stays/public/{public-site.controller.ts,public-site.service.ts,public-site.dto.ts}`
- Modify: `backend/src/modules/auth/otp.service.ts` (TTL for `GUEST_BOOKING` = 10 min),
  `backend/src/modules/notifications/notifications.service.ts` (`sendCode` purpose `'booking'`: "Your {biz} booking code is NNNNNN")
- Test: `backend/test/stays-public.e2e-spec.ts`

**Interfaces (all `@Public()`, resolved by slug inside `withoutOrgScope` → then
`runWithContext(emptyContext({ orgId }))` for the host's org):**
- `GET /public/sites/:slug` → `{ businessName, about, logoUrl, contactPhone, whatsappPhone, houseRules, checkInTime, checkOutTime, listings: [{ id, title, area, coverUrl, fromPrice, maxGuests, bedrooms }] }`;
  previous slug within 30 days → `{ redirectTo: newSlug }`; unknown/unpublished → 404 `SITE_NOT_FOUND`.
  Only published listings.
- `GET /public/sites/:slug/listings/:id` → listing details, photo URLs, amenities,
  `cancellationText` (`describeCancellation`), `payWhenText`, `minNights`.
- `GET /public/sites/:slug/listings/:id/availability?from&to` (max 366 days) →
  `{ unavailable: string[] }` (nights only; nothing about why).
- `GET /public/sites/:slug/available?checkIn&checkOut&guests` → listing ids free for those dates.
- `POST /public/sites/:slug/listings/:id/quote` `{ checkIn, checkOut, guests }` → quote as Task 7.
- `POST /public/sites/:slug/verify` `{ phone }` → sends a `GUEST_BOOKING` code; 202.
- `POST /public/sites/:slug/bookings` `{ listingId, checkIn, checkOut, guests, name, phone, email?, note?, code }`
  → verifies the code (422 "That code is wrong or has expired"); guest with `doNotAccept`
  forces REQUEST; creates via `BookingsService.insertBooking` with source `SITE`:
  - INSTANT & dueNow > 0 → `HELD`, `holdExpiresAt = now + 15 min` if the host has a Daraja
    channel (and sends the STK prompt for `dueNow` right away), else `now + 2 h`;
  - INSTANT & dueNow = 0 → `CONFIRMED`;
  - REQUEST → `REQUESTED`, `requestExpiresAt = now + 24 h`.
  Returns `{ code, status, link }`; `link` = `https://{slug}.{SITE_DOMAIN}/b/{token}` where
  `token` = 32 random bytes base64url, stored only as `accessTokenHash` (sha256).
- `GET /public/bookings/:token` → `{ code, status, listing, dates, guests, lines, total, amountPaid, owed, dueNow, balanceDueOn, payWhenText, cancellationText, holdExpiresAt, checkInInstructions|null (CONFIRMED/CHECKED_IN only), address|null (same), paybill: { number, accountRef }|null, canPayInApp, contact }`.
- `POST /public/bookings/:token/pay` `{ phone? }` → STK for what is owed now (`dueNow − paid` while HELD, else the balance).
- `POST /public/bookings/:token/cancel/verify` → code to the booking's guest phone;
  `POST /public/bookings/:token/cancel` `{ code }` → cancels as GUEST with `refundFor`;
  returns `{ refund }`.
- `GET /public/photos/:uploadId` → streams only uploads of purpose `LISTING_PHOTO` attached to a
  published listing, or `SITE_LOGO` of a published site; `Cache-Control: public, max-age=86400`.
- Rate limits (`RateLimitService.hit`): verify — 5 / 10 min per phone and 20 / hour per IP;
  bookings — 10 / hour per IP; quote & availability — 120 / min per IP; booking page — 60 / min per IP.
- [ ] **Step 1: Failing e2e:** full instant flow with FakeDaraja (verify → book → HELD →
  callback → CONFIRMED, guest SMS); two parallel bookings for the same nights → one 201, one
  409 `DATES_TAKEN` (Review Focus 1); availability for a month with one confirmed stay lists
  only its nights and has no names; `GET /public/bookings/<random>` → 404; another booking's
  token cannot cancel this one; cancel with a wrong code → 422; unpublished listing → 404;
  6th verify within 10 min → 429; request-mode flow → REQUESTED and no STK sent;
  `doNotAccept` guest on an INSTANT site → REQUESTED; photo of an unpublished listing → 404.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + lint/typecheck. Expected: PASS.
- [ ] **Step 5: Ledger** — `feat(stays): public booking site API`.

### Task 13: Expiry and reminder jobs

**Files:**
- Create: `backend/src/modules/stays/jobs/stays-jobs.controller.ts`, job methods in `bookings.service.ts`
- Modify: VM cron (`infra/vm/` cron file used for existing jobs) — add the two schedules
- Test: `backend/test/stays-jobs.e2e-spec.ts`

**Interfaces:**
- `POST /internal/jobs/stays-expiry` (every 5 min): `BookingsService.expireAll(now = new Date())`
  → HELD past `holdExpiresAt` → EXPIRED; REQUESTED past `requestExpiresAt` → EXPIRED; SMS
  `EXPIRED`; returns `{ held: n, requests: n }`. Idempotent.
- `POST /internal/jobs/stays-daily` (07:00 Nairobi): `dailyAll(today)` → `BALANCE_DUE` SMS on
  `balanceDueOn`; `CHECKIN_INFO` SMS for tomorrow's check-ins whose `infoSentAt` is null (then set it); staff `STAY_REQUEST_EXPIRING` for requests with < 6 h left.
- [ ] **Step 1: Failing e2e** with explicit `now`/`today`: a HELD booking 16 min old → EXPIRED
  and its nights bookable again; running twice → second run `{ held: 0 }`; daily run sends one
  CHECKIN_INFO per booking even when run twice.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** (guarded by `JobsGuard`, like `ExpenseJobsController`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Ledger** — `feat(stays): hold/request expiry and daily guest reminders`.

### Task 14: Link previews for shared site links

**Files:**
- Create: `backend/src/modules/stays/public/site-html.ts` (+ spec), endpoint in `public-site.controller.ts`
- Modify: `backend/src/config/env.ts` (`WEB_INDEX_URL`, e.g. `http://hodi-web:8080/index.html`; optional)

**Interfaces:**
- `injectMeta(indexHtml: string, m: { title: string; description: string; image: string|null; url: string }): string`
  — replaces `<title>` and inserts `og:title`, `og:description`, `og:image`, `og:url`,
  `twitter:card=summary_large_image`, all HTML-escaped.
- `siteSlugFromHost(host: string, siteDomain: string): string | null` (shared rule with the
  web's Task 15 copy; reserved names → null).
- `GET /public/site-html?host=&path=` → `text/html`: host must end with `.{SITE_DOMAIN}`
  (else 404); `/u/:listingId` → unit title + cover; otherwise business name + first cover;
  index fetched from `WEB_INDEX_URL`, cached 60 s; any failure → plain index (never 500 to
  a guest).
- [ ] **Step 1: Failing spec:** `injectMeta` escapes `"<script>` in a business name; puts the
  image tag only when an image exists; `siteSlugFromHost('cozy.dev.kodihub.co.ke', 'dev.kodihub.co.ke') === 'cozy'`,
  `('app.kodihub.co.ke','kodihub.co.ke') === null`, `('evil.com','kodihub.co.ke') === null`.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS).
- [ ] **Step 5: Ledger** — `feat(stays): link previews for host sites`.

### Task 15: Web — the guest booking site

**Files:**
- Create: `frontend/src/site/{siteHost.ts,siteHost.test.ts,GuestSiteApp.tsx,api.ts,HomePage.tsx,UnitPage.tsx,BookPage.tsx,BookingPage.tsx,DatePicker.tsx,site.css,booking.ts,booking.test.ts}`
- Modify: `frontend/src/main.tsx` (render `GuestSiteApp` when `siteSlugFromHost` finds a slug),
  `frontend/vite.config.ts` (`server.allowedHosts: ['.localhost']`), `.env.example`
  (`VITE_SITE_DOMAIN`)

**Interfaces:**
- `siteSlugFromHost(hostname: string, siteDomain = import.meta.env.VITE_SITE_DOMAIN ?? 'localhost'): string | null`
  — same rules as Task 14 (`cozy.localhost` → `cozy` for local work).
- Routes: `/` home, `/u/:listingId` unit, `/u/:listingId/book` booking flow, `/b/:token`
  booking page. No sign-in code is loaded on the guest site (separate lazy chunk).
- `booking.ts` (pure): `bookingSteps(state)` → which step is next
  (`dates → details → code → review → pay|sent`); `payLabel(dueNow, payWhen)` →
  `"Pay KES 4,500 now"` / `"Send request"` / `"Book — pay on arrival"`.
- Look: host's logo and name in the header, photo-first cards, big date picker with
  unavailable nights struck out, sticky price summary on phones, contact button
  (WhatsApp `https://wa.me/{digits}` or `tel:`), footer "Powered by KodiHub" in small text.
  Booking page polls every 5 s while HELD and an STK prompt is pending, shows the hold
  countdown, paybill + account number when no in-app prompt, and "Cancel booking" with the
  refund shown before the code step.
- [ ] **Step 1: Failing tests:** `siteHost.test.ts` (cases from Task 14 + `cozy.localhost`);
  `booking.test.ts` labels; UnitPage disables dates in `unavailable`; BookPage shows the
  server's `DATES_TAKEN` message "Those dates were just taken — pick other dates".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use the `frontend-design` skill for the guest site's look; it
  must take the host's identity, not KodiHub's.
- [ ] **Step 4: Run** tests, lint, typecheck, build; browser check at
  `http://cozy-homes.localhost:5173` on a 390 px-wide viewport: browse → book → code (from
  the API log) → booking page. Screenshots to the scratchpad.
- [ ] **Step 5: Ledger** — `feat(web): guest booking site`.

### Task 16: Edge — host addresses with wildcard HTTPS

**Files:**
- Create: `infra/vm/edge/Dockerfile`
- Modify: `infra/vm/edge/compose.yml` (build the image; pass `CF_API_TOKEN`, `SITE_DOMAIN`),
  `infra/vm/edge/Caddyfile`, `infra/vm/server-setup.sh` (`SITE_DOMAIN` into `edge.env`;
  `SITE_DOMAIN`, `WEB_INDEX_URL` into the stack env), `infra/vm/README.md`
- Modify: `backend/src/main.ts` path unaffected; CORS unchanged (sites proxy `/api` same-origin)

**Interfaces:**
- `Dockerfile`:
  ```Dockerfile
  FROM caddy:2.10.2-builder-alpine AS build
  RUN xcaddy build --with github.com/caddy-dns/cloudflare
  FROM caddy:2.10.2-alpine
  COPY --from=build /usr/bin/caddy /usr/bin/caddy
  ```
- Caddyfile site block (both VMs; `SITE_DOMAIN` = `kodihub.co.ke` prod, `dev.kodihub.co.ke` dev):
  ```
  *.{$SITE_DOMAIN} {
  	tls { dns cloudflare {env.CF_API_TOKEN} }
  	import security
  	import api_guard
  	@page {
  		not path /api/* /assets/*
  		not path_regexp \.[A-Za-z0-9]+$
  	}
  	handle /api/* { reverse_proxy {$APP_STACK}-api:8080 }
  	handle @page {
  		rewrite * /api/v1/public/site-html?host={host}&path={uri}
  		reverse_proxy {$APP_STACK}-api:8080
  	}
  	handle { reverse_proxy {$APP_STACK}-web:8080 }
  }
  ```
  The fixed hosts (`app`, `api`, `dev`, `dapi`, `landing`) keep their own blocks; Caddy
  prefers exact names over the wildcard. `X-Frame-Options DENY` stays.
- `CF_API_TOKEN` lives only in `/opt/hodi/edge/edge.env` on each VM (owner creates a
  Cloudflare token: Zone → DNS → Edit, zone `kodihub.co.ke`). README documents it.
- [ ] **Step 1: Validate locally:** `docker build -t kodihub-edge infra/vm/edge && docker run --rm kodihub-edge caddy list-modules | grep dns.providers.cloudflare`.
  Expected: the module is listed.
- [ ] **Step 2:** `docker run --rm -e SITE_DOMAIN=dev.kodihub.co.ke -e APP_HOST=dev.kodihub.co.ke -e API_HOST=dapi.kodihub.co.ke -e LANDING_HOST=landing.kodihub.co.ke -e APP_STACK=hodi-dev -e CF_API_TOKEN=x -v $PWD/infra/vm/edge/Caddyfile:/etc/caddy/Caddyfile kodihub-edge caddy validate --config /etc/caddy/Caddyfile`.
  Expected: "Valid configuration".
- [ ] **Step 3:** Update README with the deploy order (token in `edge.env` → rebuild edge →
  check `curl -I https://test.dev.kodihub.co.ke` gives the site-not-found page over HTTPS).
  Deploying is the owner's step; do not deploy.
- [ ] **Step 4: Ledger** — `feat(infra): wildcard HTTPS for host booking sites`.

# Part 4 — Money and running the place

### Task 17: Expenses per unit and host reports

**Files:**
- Modify: `backend/src/modules/expenses/expenses.dto.ts` and service (`unitId` optional, must
  belong to `propertyId`; category `RENT` labelled "Rent paid to landlord")
- Create: `backend/src/modules/stays/rules/report-math.ts` (+ spec), `backend/src/modules/stays/reports/*`
- Test: `report-math.spec.ts`, `backend/test/stays-reports.e2e-spec.ts`

**Interfaces:**
- `report-math.ts`:
  - `bookedByNight(bookings: { checkIn; checkOut; total: bigint; lines }[], from, to): Map<string /*YYYY-MM*/, bigint>`
    — a stay's total spread over its nights (cleaning fee and adjustments on the first
    night), only CONFIRMED/CHECKED_IN/COMPLETED.
  - `occupancy(bookedNights: number, units: number, from, to): number` (0–1, BLOCK nights
    excluded from both booked and available).
  - `adr(roomRevenue: bigint, bookedNights: number): bigint` (rounded down to whole shillings).
- `GET /host/reports/summary?from&to&propertyId?` (`reports:view`) →
  `{ rows: [{ unitId, title, property, received, refunded, bookedValue, expenses, profit, nights, occupancy, adr }], totals: {...}, monthly: [{ period, received, expenses, profit }] }`
  where `received` = stay payments by `receivedAt` (cash basis), `profit = received − refunded − expenses`;
  property-level expenses without `unitId` are split evenly across that property's listings
  (remainder to the first) and shown as a separate "shared costs" figure per property.
  `?format=csv` like expenses.
- [ ] **Step 1: Failing tests:** `bookedByNight` for a 3-night stay 2026-11-30→2026-12-03,
  total 650,000 with a 50,000 cleaning fee and 200,000 nights → November 250,000,
  December 400,000; `occupancy(15, 2, '2026-12-01', '2026-12-31')` ≈ 0.2419 (15/62);
  e2e summary with one payment, one refund, one unit expense and one shared expense.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS).
- [ ] **Step 5: Ledger** — `feat(stays): expenses per unit and host profit reports`.

### Task 18: Guests and cleaning

**Files:**
- Create: `backend/src/modules/stays/guests/*`, `backend/src/modules/stays/cleaning/*`
- Test: `backend/test/stays-ops.e2e-spec.ts`

**Interfaces:**
- `GET /host/guests` (`guests:view`, search name/phone, paginated) → `{ id, name, phone, email, stays, totalPaid, lastStay, doNotAccept }`;
  `GET /host/guests/:id` (+ stays); `PATCH /host/guests/:id` (`guests:update`) `{ name?, email?, notes?, doNotAccept?, idNumber? }`
  (idNumber encrypted with the tenants' helper in `portfolio/id-numbers.ts`; never returned, only a hint).
- `GET /host/cleaning?status=OPEN` (`cleaning:view`) → `{ id, unit, property, since, nextCheckIn|null }` sorted by `nextCheckIn`;
  `POST /host/cleaning/:id/done` (`cleaning:update`) `{ note? }`; `POST /host/cleaning` (`cleaning:update`) `{ unitId, note? }` for ad-hoc tasks.
- [ ] **Step 1: Failing e2e:** check-out creates one OPEN task (Task 7) listed with the next
  check-in; caretaker marks it done; caretaker `GET /host/guests` → 403; `doNotAccept` guest
  booking on an INSTANT site → REQUESTED (already in Task 12; assert again here via the PATCH).
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS).
- [ ] **Step 5: Ledger** — `feat(stays): guest list and cleaning tasks`.

### Task 19: Web — reports, guests, cleaning, expenses per unit

**Files:**
- Create: `frontend/src/features/stays/{HostReportsPage.tsx,GuestsPage.tsx,GuestDetailPage.tsx,CleaningPage.tsx}` (+ tests)
- Modify: `frontend/src/features/expenses/ExpenseSheet.tsx` (optional Unit picker for HOST
  orgs; category "Rent paid to landlord"), `frontend/src/App.tsx` (`/app/reports` renders
  `HostReportsPage` for HOST; BUILT `guests`, `cleaning`)
- [ ] **Step 1: Failing tests:** reports table totals row equals the API totals; guest detail
  never renders an ID number, only the hint; expense sheet sends `unitId` only when chosen.
- [ ] **Step 2–4:** run (FAIL) → implement (reuse `TrendChart` for monthly profit) → run, lint,
  typecheck, build (PASS).
- [ ] **Step 5: Ledger** — `feat(web): host reports, guests and cleaning`.

### Task 20: Mobile — More: guests, cleaning, expenses, reports, notifications

**Files:**
- Create: `mobile/lib/features/host/{guests_screen.dart,cleaning_screen.dart,host_reports_screen.dart}`
- Modify: `mobile/lib/features/host/host_more_screen.dart`, the staff expenses form (unit
  picker for HOST), `mobile/lib/core/notifications/push_service.dart` (map `/app/bookings/{id}`
  → `/host/bookings/{id}` in host mode)
- Test: `mobile/test/features/host/{cleaning_test.dart,reports_test.dart}`, `mobile/test/core/push_routes_test.dart`
- [ ] **Step 1: Failing tests:** push link `/app/bookings/abc` in host mode → `/host/bookings/abc`;
  cleaning list "Mark done" calls `POST /host/cleaning/:id/done`; reports screen shows profit
  per unit; 2× text scale has no overflow.
- [ ] **Step 2–4:** run (FAIL) → implement → run, analyze, format (PASS).
- [ ] **Step 5: Ledger** — `feat(mobile): host guests, cleaning, expenses and reports`.

### Task 21: How-to-test guide and full verification

**Files:**
- Create: `docs/testing/2026-11-06-hosts-how-to-test.md` (sign up a host, add listings,
  publish the site, book as a guest on `{name}.localhost:5173` and on dev, pay, cancel,
  caretaker view, reports; owner prerequisites: `CF_API_TOKEN`, `SITE_DOMAIN`,
  `WEB_INDEX_URL`, cron entries)
- Update: `docs/plans/2026-11-06-hosts-short-stays.md` with an Outcome section.
- [ ] **Step 1:** backend `npm run lint && npm run typecheck && npm test && npm run test:e2e`.
- [ ] **Step 2:** frontend `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Step 3:** mobile `flutter analyze --fatal-infos && flutter test && dart format --set-exit-if-changed lib test`.
- [ ] **Step 4:** live run: iOS simulator host flow (listings with a camera-roll photo,
  today, calendar, booking detail) — integration test `integration_test/host_live_test.dart`.
- [ ] **Step 5:** final whole-branch review (self-review per the executing-plans skill,
  since no subagents); ledger the result.
- [ ] **Step 6: Ledger** — `docs: hosts how-to-test guide`.

---

## Rulings made while planning (from the spec's open "left to the builder" items)

- Host units reuse `Unit` (`rentAmount 0`) + a 1:1 `Listing`; host date blocks are `Booking`
  rows of kind `BLOCK`, so one exclusion constraint covers both.
- Booking `lines` and `rules` are JSON snapshots; money totals are columns.
- Stay payments get their own table (`StayPayment`), not the tenant `Payment` table, but share
  the Daraja/C2B pipeline (`StkRequest.bookingId`, `InboundTransaction.bookingId`).
- Image resizing happens on the client (web canvas, mobile `image_picker`); no server image
  library.
- The guest site is part of the web build, selected by hostname in `main.tsx`; link previews
  come from a backend endpoint Caddy routes page requests to.
- Booking codes `B00001` (per host); stay receipts `SRC-YYYY-NNNNNN`.
- A host cancelling gets the policy refund pre-filled and can change it (spec §6.1).


---

## Outcome (2026-11-07)

All 21 tasks in Parts 1–4 were implemented test-first and verified across `backend`, `frontend`, and `mobile`:

- **Backend**:
  - `npm run lint`: `Found 0 warnings and 0 errors. Finished in 998ms on 308 files with 111 rules using 14 threads.`
  - `npm run typecheck`: 0 errors.
  - `npm test`: `Test Files 44 passed (44)`, `Tests 238 passed (238)`.
  - `npm run test:e2e`: `Test Files 29 passed (29)`, `Tests 160 passed (160)`.
- **Frontend**:
  - `npm run lint`: `Found 0 warnings and 0 errors. Finished in 169ms on 328 files with 116 rules using 14 threads.`
  - `npm run typecheck`: 0 errors.
  - `npm test`: `Test Files 49 passed (49)`, `Tests 622 passed (622)`.
  - `npm run build`: `built in 490ms`, `precache 166 entries`, with `GuestSiteApp` isolated into its own lazy chunk.
- **Mobile**:
  - `dart format --set-exit-if-changed lib test`: `Formatted 125 files (0 changed)`.
  - `flutter analyze --fatal-infos`: `No issues found!`.
  - `flutter test`: `107/107` tests passed (`00:18 +107: All tests passed!`).

See `docs/plans/2026-11-06-hosts-short-stays-handoff.md` for the complete handoff report and `docs/testing/2026-11-06-hosts-how-to-test.md` for the end-to-end testing guide.
