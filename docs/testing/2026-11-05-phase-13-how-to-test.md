# Phase 13 — how to try each new feature and fix

Everything below shipped in commit `ab7b7cd` on `dev` (plus the follow-up fixes listed at
the end). Each section says **where to find it**, **how to try it**, and **what you should
see**.

---

## 0. Where to test

### Option A — the dev site (easiest)

The dev deploy runs on every push to `dev` and applies database migrations and the cron
jobs automatically.

| What | URL |
|---|---|
| Staff web app | https://dev.kodihub.co.ke/app |
| Platform admin | https://dev.kodihub.co.ke/admin |
| Tenant portal | https://dev.kodihub.co.ke/me |
| Landing page | https://landing.kodihub.co.ke |

Sign in with your own owner / platform-admin account.

### Option B — on your Mac

```bash
# API (http://localhost:8080)
cd backend
npx prisma migrate deploy        # apply the new migrations
npm run build && node --env-file=.env dist/main.js

# Web app (http://localhost:5173), in a second terminal
cd frontend && npm run dev
```

- Local SMS and email are **not sent** (`SMS_PROVIDER=log`, `EMAIL_PROVIDER=log`): they are
  printed in the API's terminal output. Sign-in codes (OTP) are read from there too.
- M-Pesa is simulated locally (`DARAJA_MODE=simulated`): an STK push "succeeds" after ~4 s.
- Scheduled jobs don't run on their own locally. Trigger one with
  `curl -X POST http://localhost:8080/internal/jobs/<name>` plus the jobs header (`-H "Authorization: Bearer $JOBS_SHARED_SECRET"`, from
  `.env`). Job names are in `infra/vm/cron/crontab`.

### Test data you'll want

One property with 2–3 units and 2–3 tenants moved in (use your own phone/email for at
least one tenant so you can see the SMS / email / portal side). For agency features, the
organisation must be an **Agency** with a landlord and a **management agreement**.

---

## 1. Bug fixes (Part A)

| Fix | How to check |
|---|---|
| **Sign-up page loads** (was a 422 error) | Sign out → open the Register page. It loads, and shows "sign-up closed" only if Admin → Settings → App & Maintenance turns public sign-up off. |
| **No white screen after a deploy** | Keep a tab open, push/deploy, then click to another page. The page reloads itself once instead of going blank. If a page crashes, you see an error card inside the app (menu still visible) instead of a white screen; going to another page clears it. |
| **Tables on phones** | Open any list (Tenants, Invoices, Payments) on a phone or a browser narrowed below 640 px. Each row becomes a card with the column name next to every value. |
| **Tenant portal tabs on phones** | Open `/me` on a phone. The tab strip scrolls sideways, fades at the edge that has more tabs, and the current tab scrolls into view. |

---

## 2. Staff web app improvements (Part B)

### 2.1 Dashboard "Needs attention" list
- **Where:** Dashboard (`/app`).
- **Try:** have an overdue invoice, an unmatched M-Pesa payment, or a unit not yet invoiced this month.
- **See:** a list at the top ("N tenants overdue", "N payments to match", …). Each line links to the screen that fixes it. Lines you have no permission for stay hidden.
- Also: the property box reads "All N properties"; each property row has **Show only this property**, which narrows the whole app (see section 4).

### 2.2 Sorting and balances
- **Tenants** (`/app/tenants`): new **Balance** column — red = owes, green "KES X credit" = in credit, "—" = settled. Click **Name** or **Balance** headers to sort.
- **Invoices** (`/app/invoices`): sort by number, issue date, due date or total.
- **Payments** (`/app/payments`): sort by date received or amount.
- Click a header twice to reverse the order; the sort stays in the page address, so it survives refresh and sharing.

### 2.3 Action menus ("More" ⋯)
- **Tenant page:** the header shows the main action; everything else is under **More**.
- **Tenancy rows:** Give / Change / Withdraw notice, Move out, Issue move-in invoice, Delete, Renew lease, Move-in / Move-out inspection.
- **Keyboard:** arrow keys move through the menu, Escape closes only the menu (not the drawer behind it).

### 2.4 Reminders preview
- **Where:** Tenants → **More** → **Send due reminders…**.
- **See:** a confirmation that first shows how many tenants would get a "due soon" and an "overdue" reminder (a dry run). Confirming sends them and shows the real counts. Running it again the same day sends nothing twice.

### 2.5 Readability
- Money and figures line up in tables (tabular digits).
- Invoice / receipt numbers and codes use a monospace font.
- The browser tab shows the page you're on (e.g. "Ann Wanjiru · Tenants · KodiHub").
- Long values in detail panels are cut with "…"; hover to see the full text.

---

## 3. New features (Part C)

### 3.1 Late fees (C1)
**Set up**
1. Settings → Organisation → **Late fees** tab (`/app/settings/organization?tab=late-fees`).
2. Turn late fees on; set a flat KES amount or a % of what is still unpaid, and the grace days after the due date (default: 5% after 5 days).
3. **Agencies only:** go to **Landlords → Agreements** and pick who keeps late fees (Agency or Landlord) on each agreement. **No fee is charged for properties whose agreement has no choice set** — the Late fees tab warns how many agreements still need one.

**Try**
- Have a **monthly rent** invoice still unpaid once its grace days have passed, then wait for the nightly job (00:45 Nairobi) or run the `late-fees` job locally.

**See**
- A new **Late fee** invoice for the tenant, one per overdue invoice (never twice).
- Voiding the original invoice also voids its unpaid late fee.
- Agency-kept fees don't appear on the landlord's statement; landlord-kept ones do.

### 3.2 Lease end dates, renewals and rent changes (C2)
- **Lease end date:** set it when moving a tenant in, or edit the tenancy.
- **Expiring leases:** Tenancies (`/app/tenancies`) → filter **Lease ends within 60 days**. The dashboard also lists leases ending soon.
- **Renew:** tenancy ⋯ → **Renew lease** → new end date (and optionally new rent).
- **Rent change:** tenancy ⋯ → **Schedule rent change** → new amount + month it starts. The tenant gets an SMS + in-app notice ("your rent changes from KES X to KES Y from Jan 2027"). The invoice run uses the new rent from that month. You can cancel a change before it applies.
- **Blocked:** renewing or changing rent while the tenant is under notice — withdraw the notice first.
- **Tenant side:** the portal (`/me`) shows the lease end date and any upcoming rent change.

### 3.3 Messages to tenants (C4)
- **Where:** Tenants → **Messages** (`/app/messages`). Needs the `messages:send` permission (owners and managers have it).
- **Try:** pick one or more properties → type the notice (max 480 characters) → optionally tick email → preview shows how many tenants and SMS parts → **Send**.
- **See:** each current tenant gets one SMS (even if they rent two units), plus email if ticked, plus an in-app/push notification. The message list shows sent / failed counts per message; open one for per-tenant status.
- Limits: one message per organisation per minute. Staff limited to some properties only see messages sent within their properties.

### 3.4 Rental income tax (MRI) report (C5)
- **Set the rate (platform admin):** Admin → Settings → **App & Maintenance** → "Rental income tax (MRI)" (default 7.5%). *Check the current KRA rate with your accountant.*
- **Mark property use:** edit a property → **Use** → Residential / Commercial / Mixed. Only residential rent is taxed.
- **Report:** Reports → **Rental income tax** tab. Pick the month (and landlord, for agencies).
- **See:** per landlord — KRA PIN, gross residential rent **received** that month, rate, tax due, and due date (20th of the next month). **Download CSV** for filing. Late fees, charges and deposits are excluded.

### 3.5 Move-in / move-out inspections — web (C6)
- **Where:** tenancy ⋯ → **Move-in inspection** (any tenancy) or **Move-out inspection** (once on notice or moved out).
- **Try:** go through the checklist (Living room, Kitchen, …), set each area to Good / Fair / Poor / Damaged, add notes, **Add photo** (on a phone this opens the camera), save.
- **Move-out:** each area shows its move-in condition; anything worse is highlighted "worse now".
- **PDF:** **Download PDF** after saving.
- **Tenant side:** portal (`/me`) → **Your home** → the inspection → **I’ve checked this**. After that, staff must tick "Reopen to make changes" to edit (and the tenant has to check it again).
- Fix included: photos you remove are deleted from storage by the clean-up job.

### 3.6 Inspections — mobile app
- **Where:** staff mode → Units → a let unit → **Move-in inspection** / **Move-out inspection**.
- Same checklist as the web, with photos from the camera; the move-out shows the move-in condition per area.

### 3.7 Installable web app (C7)
- **Android (Chrome):** open the staff app → browser menu → **Install app** (or the install banner). It opens full-screen with the KodiHub icon.
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Updates:** after a new deploy, an "A new version of KodiHub is ready." prompt appears with **Reload** / **Later** instead of silently mixing old and new code.
- Data is never cached offline — figures always come live from the server.

### 3.8 Offline meter readings — mobile (C8)
- **Where:** staff mode → **More → Meters** → a meter → enter the reading (+ photo).
- **Try:** turn on airplane mode, then save a reading.
- **See:** "No connection — saved on this phone. It will upload when you’re back online." A banner on the Meters screen shows "N waiting to upload" with **Upload now**. Turn the connection back on and reopen Meters (or tap Upload now): the readings upload and the banner disappears.

### 3.9 Mobile app rename + push notifications (C9)
- The app is now **KodiHub** (`co.ke.kodihub`; dev build `co.ke.kodihub.dev`), and all app wording says KodiHub.
- **Install a dev build:** `cd mobile && flutter build apk --debug --flavor dev` → install `build/app/outputs/flutter-apk/app-dev-debug.apk` on an Android phone. Installs **beside** the old Hodi app (different ID). iPhones need iOS 15+.
- **Push works only after the Firebase setup** (see `infra/vm/README.md`):
  1. Create the Firebase project and run `flutterfire configure` in `mobile/`.
  2. Upload an APNs key in Firebase and enable Push in Xcode (iOS).
  3. Set the FCM environment variables on the VMs.
- **Then try:** sign in on the phone, allow notifications, and from the web send a message (3.3) or schedule a rent change (3.2) for that tenant. A push arrives; tapping it opens the right screen.

---

## 4. Follow-up fixes (after the main commit)

| Fix | How to check |
|---|---|
| **Messages respect property limits** | Invite a manager limited to one property. In **Messages** they only see messages sent to their own properties; opening another one gives "not found". |
| **Maintenance access for existing roles** | In an organisation created before maintenance existed, a Manager or Caretaker now sees **Properties → Maintenance**; an Accountant can view it. (Applied by a migration on deploy.) |
| **KodiHub name everywhere** | M-Pesa prompt for the subscription says "KodiHub bill"; Bank settings list "KodiHub signed JSON"; deposit history says "Deposit held before KodiHub". |
| **Mobile formatting (CI)** | CI's mobile job is green again. |
| **"Missing" tenants — one-property view made visible** | Dashboard → **Show only this property** on a property row (or pick it in the property box). Every page now shows a strip under the top bar: "Showing only *Property* (CODE) — your other properties are hidden on every page" with **Show all properties**. Picking a property is no longer saved as the property you open on next time; **Show all properties** clears any saved one. |

---

## 5. Still needed from you

- Firebase / APNs / FCM setup for push (3.9).
- New store listings for `co.ke.kodihub` — the old Hodi app won't receive updates.
- Optionally, add the new features to the landing page text (Admin → Settings → Landing page).

---

## 6. Tenant portal redesign (web + mobile)

Spec: `docs/specs/2026-11-05-tenant-portal-redesign-design.md` · Plan: `docs/plans/2026-11-05-tenant-portal-redesign.md`.
Sign in as a tenant (a tenant with portal access; locally the sign-in code is printed in the API's output).
For the best test, give one tenant **two homes** (staff: move the same tenant into a second unit).

### Web (`/tenant`)
| What | How to check |
|---|---|
| Side menu | Dashboard, Invoices, Statement, Payments, Maintenance, Documents, Notices, My profile. On a phone-width window it is a ☰ drawer. |
| Home switcher | Top of the menu: **All my homes (N)** then each home "Unit, Property · Landlord". Hidden with one home. |
| One home selected | A strip under the top bar on every page: "Showing only **G2, Ruaka Gardens** · Agency" with **Show all my homes**. Survives a reload (kept on this device only). |
| Dashboard | To pay (per landlord, credit shown per landlord, never netted), My homes cards (click one to select it), Billed vs paid (6 months; 12 on wide screens), Recent activity, Maintenance, To do, Deposit held. |
| Pay now | One landlord → the M-Pesa prompt straight away. Several landlords → "Who do you want to pay?" with a **Pay** per landlord and "Other ways to pay". |
| Pages follow the switcher | Invoices of the selected home only; Statement/Payments show the landlord account with "This account with X also covers …" when it covers other homes; Maintenance shows that home's requests. With all homes and several landlords, each page has one section per landlord. |
| Documents | Per home: lease PDF, signed lease copy, inspections with "I've checked this". |
| Notices | Messages from landlords/agencies with who sent them; staff alerts never show here. |
| My profile | Edit your name; phone/email read-only with who to ask; change password; who you rent from. |
| Old links | A link with `?account=…` still opens that landlord's first home. |

### Mobile (tenant mode)
| What | How to check |
|---|---|
| Tabs | Home, Bills, Payments, Repairs, More. |
| Switcher | With several homes, the app bar shows "All my homes (N)"; tap to pick a home; a strip shows while one is selected. |
| Home tab | Same dashboard blocks as the web, stacked. Pay now works the same way. |
| Bills / Payments / Repairs | With several landlords and all homes: a landlord chip row on top. With one home whose account covers others: the "also covers" note. |
| More | Statement, Documents, Notices, My profile, Dark theme, Sign out. |
| Notifications | Tapping a notice / repair / invoice notification opens the right tenant screen (repair links used to go nowhere). |
