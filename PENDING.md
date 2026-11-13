# Pending

Small changes agreed but not done yet. Newest first.

## Google Maps key

- **Keep the Maps key on the server.** Today the key saved in Admin → Settings → Google Maps
  goes to every browser: the listing editor's search (Maps JavaScript + Places) and the embedded
  map on public listing pages (Maps Embed). Anyone can copy it from the page, and the key is
  shared with other projects. Encrypting it in the database alone doesn't help while browsers
  need it.
  - Wanted: host map search goes through our server (signed-in hosts only, rate-limited, with
    Google's session tokens); public pages show a map image fetched by our server (Maps Static)
    plus "Open in Google Maps"; the key is stored encrypted like the SMS keys and shown only as
    "key saved".
  - Use a KodiHub-only key, restricted to the server's IP and to Places API (New) + Maps Static
    API. The Maps JavaScript and Embed APIs are then no longer needed.
  - Where: `frontend/src/features/stays/LocationPicker.tsx`, `frontend/src/lib/googleMaps.ts`,
    `frontend/src/site/UnitPage.tsx`; `GET /host/listings/maps` and `mapsKey` in
    `backend/src/modules/stays/public/public-site.service.ts`; `googleMapsKey` in platform
    settings.
  - Until then: restrict the browser key in Google Cloud to KodiHub's websites (check that
    `*.dev.kodihub.co.ke` addresses are covered) and to those APIs, and set a budget alert.

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
