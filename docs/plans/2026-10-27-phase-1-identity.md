# Phase 1 — Identity (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §4.3 (multi-tenancy), §4.4 (auth), §4.5 (permissions), §5.5 (schema), §8 (personal data)
**Depends on:** phase 0 (done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** people can be onboarded into organisations, sign in (password or phone OTP), stay signed in safely, switch organisation, and be given exactly the permissions their role allows — with every sensitive change audited. The org's staff manage users, roles and organisation settings from the web app.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Organisation onboarding | **Platform admin creates the organisation + invites its owner.** No self-serve sign-up yet | Design §1/§5.4: Hodi onboards customers; self-serve with trial can come with platform billing (phase 8) |
| First platform admin | CLI script `npm run cli:create-platform-admin` | No chicken-and-egg UI |
| Login identifiers | Email **or** phone (Kenyan formats normalised to E.164). No usernames | Legacy usernames add little; tenants mostly have phones only |
| Password hashing | argon2id (`@node-rs/argon2`, prebuilt binaries) | Design §4.4; no native build step in Docker |
| Tokens | Access: JWT HS256 (`jose`), 15 min, claims `sub`, `org`, `sid`, `pa`. Refresh: opaque random, stored as SHA-256 hash, 30 days, **rotated on every use**, grouped in a family; reuse of a rotated token revokes the whole family | Theft detection without server sessions for every request |
| Refresh token transport | Web: `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`. Mobile: sent `client: "mobile"` → token returned in the body, sent back in the body | Same-origin web (Firebase rewrite) → no XSS-readable token; mobile has secure storage |
| Permissions source | Loaded from membership → role on **every request** (one indexed query), not baked into the JWT | Role changes and removals take effect immediately |
| Org isolation | Request-scoped `orgId` (AsyncLocalStorage) + a Prisma client extension that adds `orgId` to reads/writes of org-scoped models; cross-org e2e suite | Design §4.3 |
| OTP / reset codes | 6 digits, hashed, 5 min (login/step-up) / 15 min (reset), 5 attempts, single use | Design §4.4 |
| Password reset | One flow: 6-digit code to email or SMS → `POST /auth/password/reset` | Works for phone-only users |
| Step-up | Re-verify with an OTP → 5-min step-up token in `X-Step-Up` header; required for changing a role's permissions, changing a member's role, removing a member, and transferring ownership | Design §4.4 "sensitive actions" |
| Rate limiting | Fixed windows in a Postgres table (no Redis), keyed by identifier and by IP | Design §4.1 |
| SMS / email | Ports with adapters: `log` (dev/test, captured in memory for tests) and real ones — Africa's Talking (SMS), SMTP via nodemailer (email). Sent synchronously in phase 1; moved to Cloud Tasks later | Real providers are configured per environment |
| Audit | `AuditService.record()` inside the same transaction as the change; secrets/PII redacted | Design §8 |

## Data model (Prisma, first migration)

`User`, `Organization`, `Membership` (status `INVITED|ACTIVE|INACTIVE`, `roleId`, `propertyIds[]`), `Role` (`permissions[]`, `isSystem`, `systemKey`), `Invitation` (token hash, membership, expiry, accepted), `RefreshToken` (family, org, rotation chain, revoke), `OtpCode`, `AuditLog`, `RateLimitBucket`. Step-up tokens are not stored: they are 5-minute JWTs with `typ: "step_up"` bound to the user and session. Exactly as design §5.5 where it overlaps; `Organization.planId` deferred to phase 8.

System roles created with every organisation (`systemKey` = `OWNER | MANAGER | ACCOUNTANT | CARETAKER`). Owner role always has every permission and cannot be edited or deleted. Each org must keep ≥ 1 active Owner.

## Permission catalogue

`resource:action` for `landlords, agreements, remittances, properties, units, unit-categories, tenants, tenancies, meters, charges, invoices, payments, channels, reconciliation, expenses, reports, users, roles, settings, audit` × `view|create|update|delete` (only the actions that make sense per resource), plus `payments:refund`, `invoices:void`, `channels:manage`, `remittances:approve`, `remittances:pay`. Served by `GET /permissions` with labels and groups for the role editor. Default role contents are in `backend/src/modules/roles/system-roles.ts`.

## API contract (all under `/api/v1`, envelope + errors as phase 0)

**Session object** (returned by login, OTP verify, refresh, switch-org, invitation accept, `GET /me`):
```json
{
  "accessToken": "…", "accessTokenExpiresAt": "2026-10-27T10:15:00Z",
  "refreshToken": "… (only when client=mobile)",
  "user": { "id", "firstName", "lastName", "email", "phone", "isPlatformAdmin" },
  "organizations": [{ "id", "name", "kind", "roleName", "isOwner" }],
  "activeOrganization": { "id", "name", "kind" } | null,
  "permissions": ["users:view", "…"]
}
```

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/login` `{identifier, password, client?}` | public | Password login. `401 INVALID_CREDENTIALS` (same for unknown user) |
| `POST /auth/otp/request` `{phone}` | public | Send login OTP. Always `202` (no account enumeration) |
| `POST /auth/otp/verify` `{phone, code, client?}` | public | OTP login. `401 INVALID_CODE` |
| `POST /auth/refresh` `{refreshToken?, client?}` (cookie for web) | public | Rotate refresh token, new access token. Reuse → `401 SESSION_REVOKED` |
| `POST /auth/logout` | refresh cookie/body | Revoke the session family, clear cookie. `204` |
| `POST /auth/switch-org` `{organizationId}` | user | New session for another membership |
| `POST /auth/password/forgot` `{identifier}` | public | Send reset code. Always `202` |
| `POST /auth/password/reset` `{identifier, code, newPassword}` | public | Set password, revoke all sessions. `204` |
| `GET /auth/invitations/:token` | public | Preview `{organizationName, inviterName, firstName, email, phone, hasPassword}` |
| `POST /auth/invitations/accept` `{token, password?, client?}` | public | Activate membership (password required if the user has none) → session |
| `POST /auth/step-up/request` | user | OTP to own phone (else email). `202` |
| `POST /auth/step-up/verify` `{code}` | user | `{ stepUpToken, expiresAt }` — send as `X-Step-Up` |
| `GET /me` | user | Session object without tokens |
| `PATCH /me` `{firstName?, lastName?}` | user | |
| `POST /me/password` `{currentPassword, newPassword}` | user | Revokes other sessions. `204` |
| `GET /permissions` | user + org | Catalogue `[{ group, label, permissions: [{ key, label }] }]` |
| `GET /organization` · `PATCH /organization` | `settings:view` · `settings:update` | Active org profile `{id,name,kind,phone,email,kraPin,status,settings}` |
| `GET /users?page&pageSize&q&status&roleId` | `users:view` | Members of the active org `{userId, firstName, lastName, email, phone, status, role:{id,name}, propertyIds, lastLoginAt, invitedAt}` |
| `POST /users/invitations` `{firstName, lastName, email?, phone?, roleId, propertyIds?}` | `users:create` | Invite (email and/or phone required). `409` if already a member |
| `POST /users/:userId/invitation/resend` | `users:create` | |
| `PATCH /users/:userId` `{roleId?, propertyIds?, status?}` | `users:update` (+ step-up for `roleId`) | Can't change own role/status; can't remove the last Owner |
| `DELETE /users/:userId` | `users:delete` + step-up | Removes membership (user account stays) |
| `GET /roles` · `GET /roles/:id` | `roles:view` | `{id, name, description, isSystem, systemKey, permissions, memberCount}` |
| `POST /roles` · `PATCH /roles/:id` · `DELETE /roles/:id` | `roles:create/update/delete` (+ step-up when `permissions` change) | System roles: Owner immutable; others editable but not deletable. Delete blocked while members use it (`409 ROLE_IN_USE`) |
| `GET /audit-logs?page&pageSize&entity&actorId&from&to` | `audit:view` | |
| `POST /platform/organizations` `{name, kind, phone, email, kraPin?, owner:{firstName,lastName,email?,phone?}}` | platform admin | Creates org + system roles + owner invitation |
| `GET /platform/organizations?page&pageSize&q` | platform admin | |

Error codes added: `INVALID_CREDENTIALS`, `INVALID_CODE`, `SESSION_REVOKED`, `TOKEN_EXPIRED`, `STEP_UP_REQUIRED` (403), `PERMISSION_DENIED` (403), `NO_ACTIVE_ORGANIZATION` (403), `RATE_LIMITED` (429 + `Retry-After`), `ALREADY_MEMBER`, `LAST_OWNER`, `ROLE_IN_USE`, `INVITATION_INVALID`.

## Frontend

1. **Auth state:** `AuthProvider` — access token in memory, session restored on load via `POST /auth/refresh` (cookie), single-flight refresh + one retry on `401 TOKEN_EXPIRED`, logout. `RequireAuth`, `RequirePermission`; sidebar and ⌘K palette filtered by permissions.
2. **Screens:** login (password, and "Use a one-time code" → phone → code), forgot password → reset (code + new password), accept invitation (`/invite/:token`), organisation switcher (account menu; only when >1 org), account page (name, change password).
3. **Settings:** Organisation (view/edit), Users (list + filters, invite sheet, edit role/properties/status, remove with confirm), Roles (list, editor with grouped permission matrix, delete), Audit log (filterable list).
4. **Step-up dialog:** any `403 STEP_UP_REQUIRED` opens a code dialog (`/auth/step-up/request` → `/verify`) and retries the original request once with `X-Step-Up`.
5. Placeholder identity from phase 0 removed.

## Tests

- **Unit:** phone normalisation, password policy, token issue/verify, refresh rotation + reuse detection, OTP lifecycle (expiry, attempts, single use), permission guard matrix, rate limiter windows, audit redaction, system-role defaults.
- **e2e (real Postgres, truncated between suites):** full login → refresh → rotate → reuse-revokes-family; OTP login; password reset; invitation accept; switch-org; permission denials per role; step-up flow; last-owner protection; **cross-org suite**: org A tokens get 404 for every org-B id on every endpoint; rate limiting returns 429.
- **Frontend:** API client refresh/retry, permission-filtered navigation, form validation helpers.
- Manual browser check of every new screen in light/dark at desktop and 390px.

## Not in phase 1

Tenant and landlord portals (their records arrive in phases 2 and 6b; OTP login is ready for them), platform-admin web UI (phase 8 — API + CLI only now), support sessions, field-level KMS encryption (first PII field arrives with tenants in phase 2), Cloud Tasks for messaging.

## Done when

Backend and frontend lint/typecheck/test/build pass; e2e suites pass on Postgres; locally a platform admin can create an organisation, the owner accepts the invitation, invites an accountant, the accountant signs in and sees only what the role allows, and every one of those steps appears in the audit log.

## Outcome (2026-10-27)

- Backend: 69 unit + 43 e2e tests (real Postgres) incl. refresh-token theft detection, OTP, reset, invitations, step-up, last-owner, role editor, org switching and the cross-org isolation suite. Frontend: 77 tests.
- Verified in a browser against the real API: sign-in redirect, users list, step-up role change, session restore on reload (cookie), audit trail.
- Contract changes during the build: `GET /roles` also allowed with `users:view` (role pickers); audit `from`/`to` are inclusive ISO timestamps; invalid invitations return `410 INVITATION_INVALID`; extra codes `SESSION_EXPIRED`, `CANNOT_CHANGE_SELF`, `ROLE_IMMUTABLE`, `NAME_TAKEN`, `IDENTITY_CONFLICT`, `NOT_INVITED`, `NOT_JOINED`, `DELIVERY_FAILED`, `NO_CONTACT`.
- New env: `JWT_SECRET`, `APP_URL`, `TRUST_PROXY_HOPS` (1 on Cloud Run), SMS/email provider settings.
