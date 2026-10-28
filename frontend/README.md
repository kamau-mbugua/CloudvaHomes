# Hodi — web frontend

React 19 + TypeScript 6 + Vite 8 + React Router 7 + TanStack Query 5. Hand-written CSS on
design tokens — no Tailwind, no UI kit, no chart or icon library.

Phase 0 built the design layer, app shell and API client. Phase 1 (identity) adds sign-in
(password or SMS code), password reset, invitations, the organisation switcher, My account,
and Settings → Organisation, Users, Roles and Audit log. Every other `/app` page is a
placeholder that says which delivery phase builds it (see `docs/specs` §9).

## Commands

Node ≥ 20.19.

```bash
npm install
npm run dev        # http://localhost:5173 — proxies /api → http://localhost:8080
npm run lint       # oxlint, warnings fail
npm run typecheck  # tsc -b (no emit)
npm test           # vitest (node env, pure modules only)
npm run build      # typecheck + production build → dist/
npm run preview    # serve dist/
```

Set `VITE_DEV_API_ORIGIN` in `.env.local` to proxy somewhere other than `:8080`.

> If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, that
> is a bug in npm 10.8's peer resolution on a fresh tree. The committed
> `package-lock.json` avoids it; for a fresh resolve use `npx npm@11 install`.

`/app` requires a signed-in session, so the app needs the backend running (phase 0's
dev-preview link is gone).

## Structure

```
src/
  app/            Org app shell: AppShell, Sidebar, CommandPalette (⌘K / Ctrl+K),
                  AccountMenu, icons, PlaceholderPage, navigation.ts (+ tests)
  components/     Primitives: DialogBehaviour, Sheet, Toast, EmptyState, ConfirmDelete
  app/guards.tsx  RequireAuth (signed in + active organisation), RequirePermission
  features/auth/  Login (password + OTP), forgot/reset password, accept invitation,
                  no-organisation screen, StepUpProvider (the step-up code dialog)
  features/account/   My account (name, password)
  features/settings/  Organisation, Users, Roles + role editor, Audit log
  lib/auth/       session store (refresh, logout, switch-org), permissions, password policy
  lib/            theme (light/dark, persisted), money (formatKES + tests), storage,
                  useDialogBehaviour, toast context
  lib/api/        client.ts (fetch wrapper, ApiError + tests), queryClient.ts, types.ts
  styles/         tokens, fonts, shell, sidebar, form, admin, auth, pages
```

- **Navigation** is one pure model (`src/app/navigation.ts`) driving the sidebar, routes,
  command palette and top-bar title. Active item = longest path-segment prefix.
- **API client**: base `/api/v1`; success bodies `{ data }` / `{ data, meta }`; errors
  `{ error: { code, message, details? }, requestId }` → `ApiError`. Non-JSON responses
  become `HTTP_<status>`, unreachable server `NETWORK_ERROR`.
- **Auth**: the access token lives only in memory; the refresh token is an httpOnly
  cookie (requests use `credentials: 'include'`). The session is restored once on load
  (`POST /auth/refresh`, in `main.tsx`). On `401 TOKEN_EXPIRED` the client runs ONE
  shared refresh and retries the request once; if the refresh fails the session is
  cleared and RequireAuth sends the person to `/login?next=…`. On `403 STEP_UP_REQUIRED`
  for a write it opens the code dialog and retries once with `X-Step-Up`; the step-up
  token is reused until it expires. Nothing auth-related touches localStorage.
- **Permissions**: each navigation entry carries a `permission`; `filterNav` hides what
  the session lacks and every route is wrapped in `RequirePermission`. The server is the
  authority.
- **Mutations never auto-retry** (`queryClient.ts`) — a retried write could move money twice.
- **Money** is integer minor units from the API; display with `formatKES(minor)`.

## Design source

Ported from UltimatePOS `pos/UltimatePOS/pos-react` (tokens, Lufga, shell, sidebar,
form/admin/auth CSS, primitives), the same design petropay adopted. Till/POS-specific
tokens and rules (`--till-*`, register, branch switcher, product/purchase forms) were
dropped. Theme defaults to light; the choice is per device (`localStorage['hodi.theme']`)
and stamped on `<html data-theme>` before first paint by `index.html`.

## Lufga licence — UNCONFIRMED

`public/fonts/Lufga*.woff` is a **commercial typeface** copied from the UltimatePOS design
handoff. Whether that licence covers Hodi is an **open owner decision** (`docs/specs` §10,
question 2) — confirm before production. Removing the four `@font-face` rules in
`src/styles/fonts.css` and the files falls back to the system sans with no other change.

## Hosting (Firebase)

`firebase.json` serves `dist/` with SPA fallback to `/index.html`, rewrites `/api/**` to
the Cloud Run service `hodi-api`, caches hashed `/assets/**` for a year and sends
`no-cache` for `index.html` and SPA routes.

- The rewrite's region is the placeholder **`REGION`** — an open owner decision
  (`africa-south1` vs `europe-west1`, `docs/specs` §4.6/§10). JSON has no comments, so the
  note lives here. Deploys fail until it is set.
- Copy `.firebaserc.example` to `.firebaserc` and set the project id (`.firebaserc` is
  git-ignored).
- Nothing is deployed from this repo by hand; see `infra/gcp/README.md`.
