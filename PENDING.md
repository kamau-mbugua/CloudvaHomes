# Pending

Small changes agreed but not done yet. Newest first.

## Hosts and short stays

- Reconciliation is tenant-only: a host can't assign an unmatched M-Pesa or bank payment to a
  booking by hand (automatic matching by booking number like B00012 works). Page copy also
  says "tenant" (`frontend/src/features/mpesa/ReconciliationPage.tsx`, `InboundDetailPage.tsx`).
- Mobile app: host Site settings don't have the new "Look of your booking site" (theme) and
  "Legal pages" sections yet (web has both; the API is ready).
- Legal: have KodiHub Legal review the starter Terms and Conditions, Terms of Use and Privacy
  Policy texts once (`backend/src/modules/stays/rules/legal.ts`).

- **Unused host addresses should go to the main app.** Today `anything.dev.kodihub.co.ke` (no
  published site) shows "We couldn't find this booking site". Wanted: a temporary (302) redirect
  to `https://dev.kodihub.co.ke` on dev and to the main app on prod (`APP_URL`).
  - Where: `GET /public/site-html` (`backend/src/modules/stays/public/public-site.controller.ts`
    / `renderSiteHtml`), which already serves every page on a host address; plus a client-side
    fallback in `frontend/src/site/GuestSiteApp.tsx` for the not-found state.
  - Also redirect reserved names (`admin.…`, `mail.…`) and unpublished sites.
  - Keep: guest booking links (`/b/…`) are never redirected; a renamed site forwards to its new
    name with the same path (30 days).
  - 302, not 301: browsers keep a 301 forever and a host may claim the name later.
- Guest site: "Amount due now" on the booking page ignores a part payment while the booking is
  waiting for payment (`frontend/src/site/BookingPage.tsx`).
- Guests whose host has no paybill/till still see only "Amount due now"; add a "the host will
  tell you how to pay" line (hosts are now warned in Settings → Booking site).
- `POST /host/bookings/quote` needs only `bookings:view`, so a caretaker can see prices.
- Today page: "In-house" also lists today's arrivals who have not checked in yet.
- Calendar: each unit row is twice as tall as needed (bars sit above a separate row of empty
  cells); on phones the unit column takes about half the width.
