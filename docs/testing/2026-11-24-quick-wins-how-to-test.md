# Roadmap quick wins — How to Test Guide

How to test the ten quick wins from the roadmap spec
(`docs/specs/2026-11-24-roadmap-features-design.md`, "Quick wins"), by hand, on `dev`
(`dev.kodihq.co.ke`) or locally.

---

## 0. Before you start

### Deploy
The quick wins add six migrations. They are applied by the normal deploy; locally:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
npm run build && node --env-file=.env dist/main.js

cd ../frontend
npm run dev
```

- **Local SMS / codes:** with `SMS_PROVIDER=log`, texts (sign-in codes, vendor jobs, alerts) are
  printed in the backend output instead of sent.
- **On dev:** if SMS is in log-only mode, read texts in **Admin → Reports → SMS** instead of on a
  phone. Emails appear in **Admin → Email → logs**.

### Test data
- A **landlord organisation** with a property, a unit, a tenant (with email and phone) and a tenancy.
- A **host organisation** with one listing.
- A second browser or a private window, to act as a second person.

Some actions ask for a one-time code first (a step-up). That's expected.

---

## 1. Tenant gives notice, with rent in lieu of short notice (phase 14)

1. **Staff:** Settings → Organisation → **Billing** → set **Notice to vacate (days)**, e.g. 30.
2. **Tenant, web:** Home → pick one home → **I'm moving out**.
   **Tenant, app:** My profile → **Your homes** → **I'm moving out**.
3. Pick a date more than 30 days away → "That gives the 30 days' notice…".
4. Pick a sooner date → a yellow note shows when the notice ends and the rent still due.
5. Give notice. Check:
   - Staff get a notification (bell / push).
   - **Tenancies** row: "notice from the tenant", "Short notice: rent until …", "Reach them on …".
   - The row's **More** menu has **Waive short-notice rent**; using it removes the "rent until" line.
   - **Withdraw notice** clears all of it.
6. **Rent in lieu on invoices** (depends on dates): use a tenancy whose billing day falls after
   the move-out date but before the notice ends, and record the move-out. On the billing day,
   **Invoices → Run** preview shows one line only: "Rent in lieu of notice — Month" (no charges or
   meter readings). Waive it and the line disappears.
7. A tenancy can have its own notice period, overriding the organisation's. There's no screen
   for it yet: it's set through the API (`PATCH /tenancies/:id` with `noticeDays`).

## 2. Dashboard: move-outs this week, deposits to settle (phase 14)

1. Give notice with a move-out date within 7 days → dashboard shows
   "1 tenant moves out this week"; the link opens Tenancies filtered to those leaving.
   (8–14 days away still shows as "tenancies end within 14 days".)
2. Record **Move out** on a tenancy that holds a deposit → dashboard shows
   "1 deposit to settle after move-out" with the amount.
3. **Tenancies** has a **Moving out** filter with both options.

## 3. Calendar link for Airbnb and Booking.com (phase 20, export)

1. Host: Listings → open a listing → **Calendar link** → **Copy link**.
2. Paste it in a browser → an `.ics` file downloads.
3. Add a booking and a blocked date, reload the link: "Reserved" and "Not available" on those
   dates, **no guest names or phone numbers**.
4. Real check: Google Calendar → Other calendars → **From URL** → paste the link. For Airbnb:
   Availability → Sync calendars → Import calendar.
5. **New link** → the old link returns "not found"; the new one works.

## 4. Monthly discount and extra-guest fee (phase 21)

1. Listing editor: **28+ night discount** 20%, **Guests the price covers** 2,
   **Extra guest, per night** KES 500. Save.
2. New booking (host) for 28 nights and 3 guests → price lines include "28+ nights discount"
   (instead of the weekly one) and "1 extra guest × 28 nights".
3. Book the same on the public site → same total.
4. With "Guests the price covers" empty, there's no extra-guest fee whatever the guest count.

## 5. Guest register (phase 22)

1. Give a guest an ID number (Guests → the guest → edit).
2. Host reports → dates that include that stay's check-in → **Guest register** → CSV with the ID
   **masked**.
3. Tick **Full ID numbers** (owners and anyone who can edit guests) → download again → full ID.
4. Admin audit log shows both downloads (`guest_register.export`, with `fullIdNumbers`).

## 6. Payment history certificate (phase 23, no partner)

1. Use a tenant with at least one invoice already due (ideally paid).
2. **Web:** Documents → **Payment history certificate**. **App:** Documents → the certificate tile.
3. Open the link printed at the bottom of the PDF (`/verify/XXXX-XXXX-XX`) in a private window →
   the same figures and "Genuine".
4. A wrong code → "No certificate has the code…".
5. Asking again the same day gives the same code (one certificate per tenant, period and day).

## 7. Your devices and new sign-in alerts (phase 26)

1. Open the device list:
   - staff, web: account menu → My account → **Devices**;
   - tenants, web: My profile;
   - app: account menu → **Your devices**.
2. Sign in to the same account in another browser → an email "New sign-in to your KodiHQ
   account" (an SMS if the account has no email) and a bell notice.
   - The very first sign-in of an account never alerts.
   - Signing in again from the same browser doesn't alert again.
3. Sign the other browser out from the list → it is sent to sign-in on its next refresh
   (within about 15 minutes).
4. The link in the alert (`/account?tab=devices`) opens the person's own account page.

## 8. Two-step sign-in for staff (phase 26)

1. Settings → Organisation → **Details** → **Two-step sign-in** → **Staff who handle money**
   (asks for a one-time code first).
2. Sign out; sign in as the owner **with a password** → asked for a code (SMS, or email if no phone).
3. Sign in as a caretaker → no code step.
4. Sign in with a **code instead of a password** → no extra step (the code already proves it's them).
5. Switch to **All staff** → the caretaker is now asked for a code too.

"Handle money" means owners and anyone who can refund payments, change payment channels,
approve or pay remittances, refund stay payments, or reconcile M-Pesa.

## 9. House manual and door code (phase 22)

1. Listing editor: fill in **House manual** and **Door or lockbox code** → save.
   **Show current code** reveals it (audited); the code never appears in the listing itself.
2. Make a booking checking in **today**, record full payment, open the guest page link from the
   confirmation message (`…/b/<token>`) → the house manual and "Door code: …".
3. A paid booking checking in later → "The door code shows here from check-in day…".
4. An unpaid booking → "Pay the balance to see the door code."
5. After check-out day the code is no longer shown.

## 10. Vendors and assigning maintenance jobs (phase 18, first step)

1. Properties → **Vendors** → **Add vendor** (a phone you can check, trade e.g. Plumbing).
   A second vendor with the same phone is refused.
2. Maintenance → open a request → **Vendor** → choose the vendor (same trade listed first) →
   **Send job**. Check:
   - the vendor gets a text with the job, the unit and the **organisation's** number (not the
     tenant's);
   - the request becomes **In progress** and shows the vendor;
   - Admin SMS log shows "Job sent to a vendor" (it uses the organisation's SMS units).
3. **Take off vendor** clears it.
4. Archive the vendor (open it → **Archive**) → assigning them is refused.
5. **Late jobs** (depends on time): Urgent after 24 hours, High 3 days, Medium 7, Low 14.
   Late jobs show a **Late** badge, appear under **Late only**, and on the dashboard as
   "N maintenance jobs are late". Create an Urgent request and check the next day.

---

## Automated tests

Each item is also covered by automated tests, which move dates where needed:

| Item | Backend end-to-end | Other |
|---|---|---|
| 1, 2, 6 | `backend/test/notice-to-vacate.e2e-spec.ts` | `billing-math.spec.ts`, `payment-certificate.spec.ts`; app `test/tenant/tenant_pages_test.dart` |
| 3, 4, 5, 9 | `backend/test/stays-ical.e2e-spec.ts` | `ical.spec.ts`, `pricing.spec.ts` |
| 7, 8 | `backend/test/my-devices.e2e-spec.ts` | `devices.spec.ts`, `staff-two-factor.spec.ts`; app `test/account/devices_test.dart` |
| 10 | `backend/test/vendors.e2e-spec.ts` | `sla.spec.ts` |

```bash
cd backend && npm run test && npm run test:e2e
cd frontend && npm run test
cd mobile && flutter test
```
