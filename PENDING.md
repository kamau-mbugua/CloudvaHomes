# Pending

Small changes agreed but not done yet. Newest first.

## SMS (platform vs organisation)

- HostPinnacle: do one real "Send test SMS" (Admin → Organisation → SMS) with an account that has
  its API key, before switching anyone over. Their error-code list confirms success is
  `status: "success"`; a demo account only sends to whitelisted numbers (code 183).
- HostPinnacle delivery reports (later): their delivery_error_codes list maps DLR codes to
  DELIVERED / FAILED / NOTSENT / SUBMITTED, e.g. 59 "Balance Over", 15 "Invalid SenderId".
- TextSMS: confirm the balance endpoint with TextSMS before showing a provider balance.
- Delivery reports (non-goal for now).

## Hosts and short stays

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
