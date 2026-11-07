# Hosts & Short Stays — How to Test Guide

This guide walks through testing every part of the **Hosts & Short Stays** feature across the web app, guest booking site, mobile app, and backend jobs, plus the owner prerequisites for deploying to `dev` and `prod`.

---

## 0. Owner Prerequisites & Environment Variables

### Local Development
```bash
# 1. Apply the migration and start the API (http://localhost:8080)
cd backend
npx prisma migrate deploy
npx prisma generate
npm run build && node --env-file=.env dist/main.js

# 2. Start the web app (http://localhost:5173)
cd frontend
npm run dev
```

- **Local SMS / OTP codes**: When `SMS_PROVIDER=log`, guest and staff verification codes are printed in the backend terminal output (look for `booking code is NNNNNN` or `sign-in code is NNNNNN`).
- **Local guest site**: Vite is configured with `server.allowedHosts: ['.localhost']`. Open `http://<slug>.localhost:5173` (for example `http://cozy-stays.localhost:5173`) to view a published host site locally.

### VM / Edge Prerequisites (`dev` and `prod`)
Before deploying the wildcard guest booking sites on the VMs:
1. **Cloudflare DNS API Token (`CF_API_TOKEN`)**:
   - Create a Cloudflare API token with **Zone → DNS → Edit** permission scoped to `kodihub.co.ke`.
   - Place `CF_API_TOKEN=<token>` and `SITE_DOMAIN=dev.kodihub.co.ke` (on dev) or `SITE_DOMAIN=kodihub.co.ke` (on prod) in `/opt/hodi/edge/edge.env`.
2. **Backend Environment (`/opt/hodi/<stack>/.env`)**:
   - `SITE_DOMAIN=dev.kodihub.co.ke` (dev) or `kodihub.co.ke` (prod)
   - `WEB_INDEX_URL=http://hodi-dev-web:8080/index.html` (dev) or `http://hodi-prod-web:8080/index.html` (prod) — used by `GET /api/v1/public/site-html` to inject OpenGraph link preview tags (`og:title`, `og:description`, `og:image`, `og:url`).
3. **Frontend Build Environment**:
   - `VITE_SITE_DOMAIN=dev.kodihub.co.ke` (dev) or `kodihub.co.ke` (prod).
4. **Scheduled Jobs (`infra/vm/cron/crontab`)**:
   - Every 5 minutes: `POST /api/v1/internal/jobs/stays-expiry` — expires unpaid `HELD` bookings past `holdExpiresAt` and unanswered `REQUESTED` bookings past `requestExpiresAt`.
   - Daily at 04:00 UTC (07:00 Nairobi): `POST /api/v1/internal/jobs/stays-daily` — sends balance-due reminders, next-day check-in instructions, and expiring-request alerts to staff.

---

## 1. Sign Up as a Host (Web & Mobile)

### Web (`http://localhost:5173/register`)
1. Open `/register`.
2. Under **Organisation type**, choose **Short-stay host**.
3. Enter your business name (e.g. `Cozy Stays`), name, email, phone, and password, then submit.
4. **Expected**:
   - An organisation of kind `HOST` is created with default roles (**Owner**, **Manager**, **Caretaker**, **Accountant**) and a `HostSite` record with a generated slug (`cozy-stays`).
   - You land on `/app` which renders the **Today** dashboard (`TodayPage`) instead of the monthly tenancy dashboard.
   - Sidebar shows host navigation: **Today**, **Calendar**, **Bookings**, **Listings**, **Guests**, **Cleaning**, **Properties**, **Maintenance**, **Payments → Payment channels / M-Pesa**, **Expenses**, **Reports**, **Settings → Booking site**.

### Mobile
1. On the Sign-in screen, tap **Create an organisation** and select **Short-stay host**.
2. Complete registration or sign in to an existing `HOST` organisation.
3. **Expected**:
   - The app enters `AppMode.host` (`/host`) with 5 bottom tabs: **Today**, **Calendar**, **Bookings**, **Listings**, **More**.

---

## 2. Add a Property, Create Listings & Publish the Booking Site

1. **Create a property**:
   - Go to **Properties** (`/app/properties`) and add a property (e.g. `Ocean View`, code `OCV`).
2. **Create a listing**:
   - Go to **Listings → New listing** (`/app/listings/new` on web, or **Listings → +** on mobile).
   - Pick the property, enter unit number `A1`, title `Sea Breeze Studio`, bedrooms/bathrooms/beds/max guests, nightly price `KES 4,500`, optional weekend price and cleaning fee, and amenities.
   - Upload 1–3 photos (resized client-side before upload).
   - Toggle **Published** on and save.
3. **Configure & publish the booking site**:
   - Go to **Settings → Booking site** (`/app/settings/site` on web, or **More → Booking site** on mobile).
   - Check your web address slug (e.g. `cozy-stays`), business name, contact phone, WhatsApp phone, check-in/out times, and default booking/payment/cancellation rules.
   - Toggle **Publish site** on and save.

---

## 3. Book as a Guest on the Public Booking Site

1. Open `http://cozy-stays.localhost:5173` (locally) or `https://cozy-stays.dev.kodihub.co.ke` (on dev) in an incognito window or phone viewport (390 px wide).
2. **Browse**:
   - Verify the header shows the host's logo/name (`Cozy Stays`), published listings with cover photos and `from KES … / night`, and a WhatsApp / call contact button.
3. **Unit page & quote**:
   - Click `Sea Breeze Studio` (`/u/:listingId`).
   - Pick check-in and check-out dates on the calendar (already-booked or blocked nights are struck out and disabled).
   - Verify the live price quote breakdown (nightly rate, weekend/special prices, weekly/monthly discount, cleaning fee, refundable deposit, and what is due now vs. on arrival).
4. **Verify phone & book**:
   - Click **Continue to book**, enter guest name and phone number, and click **Send verification code**.
   - Copy the 6-digit code from the backend log (`Your Cozy Stays booking code is NNNNNN`) and submit.
   - **Expected**:
     - If the listing uses **Instant booking** with payment due now, the booking is created in `HELD` status (15-minute hold if Daraja is configured and an STK prompt is sent immediately, or 2-hour hold with Paybill instructions) and redirects to `/b/:token`.
     - If the listing uses **Request to book** (or the guest has `doNotAccept` set), the booking is created in `REQUESTED` status (24-hour expiry).
5. **Double-booking protection**:
   - While the booking is `HELD` or `CONFIRMED`, open another tab and try to book overlapping dates for `Sea Breeze Studio`.
   - **Expected**: Those nights are unavailable, and any concurrent submission returns HTTP 409 `DATES_TAKEN` ("Those dates were just taken — pick other dates").
6. **Guest cancellation**:
   - On `/b/:token`, click **Cancel booking**.
   - Verify the policy refund calculation is shown before confirming. Request a cancellation code, enter the 6-digit SMS code, and confirm.

---

## 4. Host Operations: Today, Calendar, Bookings & Payments

1. **Today (`/app` on web, `/host` on mobile)**:
   - Verify sections for **Arrivals today**, **Departures today**, **In-house**, **Requests waiting** (with hours left), **Units to clean**, and **Balances due**, plus this month's summary.
2. **Calendar (`/app/calendar` on web, `/host/calendar` on mobile)**:
   - On web: 14-day horizontal grid across all units with colour-coded bars per booking/block. Click an empty cell to create a manual booking or block dates.
   - On mobile: unit picker at top + monthly grid showing `free`, `booked`, `blocked`, `checkIn`, `checkOut`, and `turnover` (same-day check-out and check-in) states.
3. **Booking detail (`/app/bookings/:id` on web, `/host/bookings/:id` on mobile)**:
   - For `REQUESTED`: click **Accept** or **Decline**.
   - For unpaid balance: click **Send M-Pesa prompt** or **Record payment** (Cash / M-Pesa / Bank / Card). Also test C2B Paybill matching using the booking code (e.g. `B00001`) as the account reference.
   - On arrival/departure: click **Check in** (`CONFIRMED → CHECKED_IN`) and **Check out** (`CHECKED_IN → COMPLETED`).
   - Verify that checking out automatically creates an `OPEN` cleaning task for that unit.
   - Click **Cancel booking** as the host: verify the dry-run policy refund is pre-filled and editable before confirming.

---

## 5. Caretaker View & Permissions

1. Invite or sign in as a staff user with the **Caretaker** role (`bookings:view`, `bookings:checkin`, `listings:view`, `cleaning:view`, `cleaning:update`, `maintenance:view`, `maintenance:create`, `maintenance:update`).
2. **Expected**:
   - Caretaker can view **Today**, **Calendar**, **Bookings**, and **Cleaning**, check guests in/out, and mark cleaning tasks done.
   - All money fields (`total`, `amountPaid`, `owed`, `lines`, `payments`) are omitted by the API and hidden in both web and mobile UIs (never showing a misleading `KES 0`).
   - **Guests**, **Expenses**, **Reports**, and **Booking site settings** are hidden in navigation and return `403 Forbidden` if called directly.

---

## 6. Guests, Cleaning, Expenses per Unit & Host Reports

1. **Cleaning (`/app/cleaning` on web, `/host/cleaning` on mobile)**:
   - View `OPEN` tasks sorted by the unit's next check-in date.
   - Click **Mark done** to complete a turnover cleaning task, or add an ad-hoc cleaning task.
2. **Guests (`/app/guests` on web, `/host/guests` on mobile)**:
   - Search guests by name or phone and open a guest's detail drawer/sheet.
   - Add private host notes, enter an ID/passport number, and toggle **Require host review (do not accept instant booking)**.
   - **Expected**: The raw ID/passport number is encrypted at rest and never returned by the API — only the masked hint (e.g. `••••5678`) is displayed. Future bookings by this guest on an Instant site are forced into `REQUESTED` status.
3. **Expenses per unit (`/app/expenses` on web, `/host/expenses` on mobile)**:
   - Click **Add expense**.
   - Verify the **Unit (optional)** picker appears for `HOST` organisations (leave blank for a shared property expense, or pick a unit) and the category list includes **Rent paid to landlord** (`RENT`).
4. **Host profit reports (`/app/reports` on web, `/host/reports` on mobile)**:
   - Pick a date range (`from` / `to`).
   - Verify the monthly chart (`TrendChart`), per-unit table (`Nights`, `Occupancy`, `ADR`, `Booked`, `Received`, `Refunded`, `Expenses`, `Profit`), totals row, shared property expenses breakdown, and **Download CSV**.
