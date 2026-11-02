# Review of the Antigravity / Gemini Argon 4 work

**Scope:** all 44 commits on `dev` after phase 10 (`48b7ee7`), up to `64628ad` (29 Oct – 2 Nov 2026):
320 files, about 44,800 lines added and 2,700 removed, across backend, web, mobile, landing and infra.
**Reviewed by:** Claude, on 2 Nov 2026.

## Verdict

**Do not merge `dev` into `main` yet.** There is a lot of useful product work, and most of it is
tested and builds cleanly. But one change to sign-in lets any organisation owner take over any user
account, including a super admin, using only the victim's phone number. I reproduced this with a
test against the real API (finding C1). It is live on the dev server today. Production is not
affected yet, because `main` is still at the initial commit.

Fix C1 and the two high-severity items before anything goes to production.

## What was built

| Area | What arrived |
|---|---|
| Platform admin ("phase 11") | Super admin and salesperson roles, operator management, admin 2FA by email or SMS, SMTP settings, email templates and broadcast, 14 platform reports, security locks, landing page content editor |
| Self-service signup | `POST /auth/register` when the platform setting `allowPublicSignup` is on (it is off on dev) |
| Maintenance ("phase 12") | Tenant maintenance requests, staff workflow, conversion to an expense, in-app notifications |
| Leases ("phase 13") | Lease agreements with PDF generation and upload |
| CSV imports | Tenants, units/portfolio, charges, meters and expenses, through a shared import sheet |
| Notifications | Email rent reminders, receipts and invoices, an in-app notification centre, push notifications (backend real, mobile stub; see M5) |
| Auth changes | Email login codes, resend 2FA code, forced password change after a temporary password, "remember me" saved logins on mobile, default context (organisation, property, tenant, landlord) |
| Rebrand | Hodi → **KodiHub** (partial; see L4) |
| Landing page | `landing/index.html`, with content loaded from the admin settings |
| Infra | New domains (`kodihub.co.ke`, `app.`, `api.`; dev uses `dev.`, `dapi.`, `landing.`), a dedicated API host, landing pages on both servers, landing-only fast deploys, path filters on CI and deploy |
| Mobile | Large parity build-out (staff, owner, tenant, platform screens), dev and prod flavours, side drawer, new theme |

Plan documents exist only for phase 11 and the brand work. Phases 12 and 13 have no plan doc, and
nothing records why the original phase 11 (the landing page) became the admin suite.

## Test results (run locally on 2 Nov)

| Suite | Result |
|---|---|
| Backend lint, typecheck, Prettier, build | Pass |
| Backend unit tests | 150 / 150 pass |
| Backend e2e tests | **116 / 117. One failure**, the same one CI shows (see M7) |
| Web lint, typecheck, build | Pass. The main JS bundle is 1.15 MB (298 KB gzipped); see L5 |
| Web unit tests | 500 / 500 pass |
| Mobile format, `flutter analyze`, tests | Pass (55 tests) |
| Landing check | Pass |
| `npm audit` (production dependencies) | Web: 0. Backend: 5 moderate, all through `@google-cloud/storage` → `teeny-request`/`retry-request` |

About 1,400 lines of tests were added, which is a reasonable ratio. But no test covers the
security-sensitive paths below. The new sign-in code is only tested on the happy path.

GitHub: on `dev`, CI **failed on 3 of the recent pushes** (including the latest, `64628ad`), yet
every one of those commits was **deployed to the dev server anyway**; see H3.

---

## Findings

Severity: **Critical**: exploitable now, leads to account or platform takeover. **High**: serious
security or data risk. **Medium**: should be fixed before production. **Low**: tidy-up.

### Critical

#### C1. Any organisation owner can take over any account, including super admin, knowing only its phone number. **Confirmed.**

`backend/src/modules/auth/auth.service.ts:480` (`resolveUserForAuth`). This is used by login,
`requestLoginOtp` (`:365`), `verifyLoginOtp` (`:389`), `forgotPassword` and `resetPassword`.

When someone asks for a login code with an email address that belongs to no user, the new code
looks for a **tenant record** with that email. It then picks the user who shares that tenant's
**phone number**, and sends that user's login code to the email that was typed. Tenant records are
created by landlords and contain whatever contact details the landlord typed in. Nothing is
verified.

Attack, as reproduced:
1. The attacker owns any organisation on the platform.
2. They add a "tenant" with the victim's phone number and an email inbox the attacker controls.
3. They request an email login code for that inbox. The code arrives for the victim's account.
4. They verify it and receive a session **as the victim**.

I ran this as a throwaway e2e test against the real API: an org owner signed in as the platform
super admin, and `GET /platform/stats` returned 200. The test file was deleted afterwards. Admin
2FA doesn't stop this, because code-based login skips it (see H1).

The same function has related problems:
- **Phone path:** if the victim has no email on file, the attacker's tenant email is **written onto
  the victim's user record**. Password-reset codes then go to the attacker.
- **Cross-organisation linking:** `tenant.updateMany` links every organisation's tenant rows with a
  matching phone or email to whoever resolves. Login attempts alone (no password needed) trigger
  these writes and create users.

**Exposure now:** the dev server (`dev.kodihub.co.ke`) runs this code, and dev holds a real super
admin account. Organisations can only be created by an admin there (public signup is off), so the
attacker would need to be an org owner on dev. **Production is not exposed** while `main` stays
where it is.

**Fix:**
- Never resolve a user through tenant records at sign-in. Tenant-to-user linking must happen only
  after the person proves they own the contact, e.g. via the existing portal-invite flow: the code
  goes to the tenant's contact, and only then is the tenant linked to that user.
- Never write an email or phone onto an existing user from tenant data.
- Add e2e tests for exactly the attack above, and for the phone variant.

### High

#### H1. Admin 2FA can be bypassed with an email or SMS login code

`auth.service.ts:389` (`verifyLoginOtp`). The password login applies `requireAdminTwoFactor` to
operators, but code-based login issues a full session with no operator check. For an operator, a
single code to their email then gives super admin access, so the 2FA policy only applies to password
logins.

**Fix:** refuse code-only login for operators, or require password plus code for them.

#### H2. Public signup can claim existing passwordless accounts

`auth.service.ts:126` (`registerOrganization`); the check is at `:175`. Signup only refuses a
user who already **has a password**. Users without one include tenants created by C1's logic and
invited staff who haven't accepted yet. For those users, signup **sets the attacker's password on
the existing user**. It also links all tenant rows with that phone or email to them (the
`tenant.updateMany` after membership creation). Signup also never verifies the email or phone it
is given.

Only exploitable when `allowPublicSignup` is on (off on dev today), but it is a one-click setting in
the admin UI.

**Fix:** verify the contact with a code before creating anything. Refuse signup for any existing
user. Never link tenant rows at signup.

#### H3. Deploys don't wait for CI

`.github/workflows/deploy.yml` and `ci.yml` run side by side on the same push. On 31 Oct and 2 Nov,
commits with failing CI were deployed to dev. Once `main` gets the same pattern, a red build reaches
production.

**Fix:** make deploy run after CI succeeds (`workflow_run` on CI with `conclusion == 'success'`), or
merge the two into one workflow where the deploy job `needs:` the test jobs. Also make CI a required
check on `main` in branch protection.

### Medium

#### M1. A super admin can set any user's password, silently and permanently

`backend/src/modules/platform/platform-admin.service.ts:390–483` (`createOperator`). Given the
email or phone of an existing user (say, a landlord), it **promotes them to operator** and, when a
password is supplied, overwrites theirs with `mustChangePassword: false`. That is a quiet takeover
of a customer account, recorded only as `operator_promote` in the audit log.

**Fix:**
- Don't let "create operator" alter existing customer accounts. Promote by invitation instead.
- Any password chosen by an admin should set `mustChangePassword: true`.
- Revoke the user's existing sessions after the change.

#### M2. Temporary passwords travel and are stored in plaintext

`backend/src/modules/notifications/notifications.service.ts:615–627`.
- Operator welcome and reset messages put the temporary password, **or the password the admin
  typed**, into email and SMS bodies.
- With `SMS_PROVIDER=log` / `EMAIL_PROVIDER=log` (both servers today), these land in the API logs.
- The email log (`GET /platform/email/logs`) should be checked for whether it stores bodies.

**Fix:** send a one-time set-password link (the invite flow already exists) instead of a password.

#### M3. "Forced password change" is enforced only by the apps

The `mustChangePassword` flag is only passed to clients (`sessions.service.ts:508`). The API serves
everything to such a session. Anyone using the API directly, or an old app version, never has to
change the temporary password.

**Fix:** block every route except `/auth/password` (change) and `/auth/logout` while the flag is set.

#### M4. Mobile "remember me" stores real passwords

`mobile/lib/core/auth/token_store.dart:6`, `:76`. Several accounts' identifiers **and plaintext
passwords** are kept in secure storage. Secure storage is good, but storing the password at all
isn't needed: the refresh token already keeps people signed in. The stored copy also goes stale
when the password changes.

**Fix:** remember accounts by identifier plus refresh token, with biometric unlock if wanted, and
drop the password field.

#### M5. Mobile push notifications don't work

`mobile/lib/core/notifications/push_service.dart` reads a token through a native channel.
`MainActivity.kt` returns `prefs.getString("fcm_token")`, but nothing ever writes that value. There
is no Firebase SDK or `google-services.json`, and no iOS handler. So devices never register; the
commit message's "implement push notifications across mobile" overstates it. The backend sender
(FCM HTTP v1) looks reasonable but runs in log mode.

**Fix:** decide on Firebase (it needs a Firebase project and app registration), then wire
`firebase_messaging`.

#### M6. Dev-flavour release builds log full request and response bodies

`mobile/lib/core/api/api_client.dart:30–31` enables `LoggingInterceptor` whenever the build isn't
both release **and** prod. A dev-flavour release build (what testers install) therefore writes
passwords, refresh tokens and login codes to the device log. Only the `Authorization` header is
masked.

**Fix:** log only in debug builds, and redact `password`, `code`, `token` and `refreshToken` fields.

#### M7. The latest commit breaks a backend e2e test

`backend/test/maintenance-and-signup.e2e-spec.ts:227` expects 1 unread notification and gets 2. The
push commit added a "unit assigned" notification for tenants, which this test doesn't expect. It
looks like an outdated test rather than a bug, but CI is red until it's fixed.

#### M8. Deploy now rewrites server configuration on every run

`infra/vm/scripts/lib.sh:36–75` (`edge_up`):
- It regenerates `/opt/hodi/edge/edge.env`.
- It rewrites `APP_URL`, `PUBLIC_API_URL` and `CORS_ORIGINS` in the server's secret `api.env`
  **on every deploy**, changing any `sslip.io` host to the `kodihub.co.ke` defaults.

This works, but:
- manual edits to those values are silently undone;
- server settings now depend on what is hardcoded in the repo;
- on the first production deploy it switches production to the new domains. DNS for all `kodihub.co.ke` names is
  already pointed correctly (checked), so certificates should be issued. But the `sslip.io` links
  will stop working, and anything still using them (bookmarks, M-Pesa callback URLs) must move first.

**Fix:** set hosts once in `server-setup.sh` (it already takes them) and keep deploys read-only for
configuration. Before the first production deploy, confirm the Daraja callback URLs registered with
Safaricom.

#### M9. Lufga font files are committed to a public repository

`mobile/assets/fonts/Lufga*.ttf` and `frontend/public/fonts/Lufga*.woff` are tracked again; you
had untracked the web copies over licensing. The repository is **public**, so this is
redistribution. Confirm the licence with Legal, or remove the files from the repo (and its history)
and load them at build time.

### Low

- **L1. CI action pinning.** `ci.yml` uses `dorny/paths-filter@v3`, a third-party action pinned by
  tag rather than commit SHA. `actions/checkout@v4`, `setup-node@v4` and
  `subosito/flutter-action@v2` are also unpinned. `deploy.yml` pins everything; do the same in CI.
- **L2. Landing store links accept any URL scheme.** `googlePlayUrl` and `appStoreUrl` are written
  straight into `href`. Only super admins can set them, but validate `https:` on save.
- **L3. Super admin can point SMTP at any host**, including internal addresses (SSRF via the "Test
  email" button). Super admin only; consider blocking private address ranges.
- **L4. The rebrand is half done.** About 34 user-facing strings still say "Hodi" (e.g. "Contact
  Hodi to get started" in signup, "Hodi bill" on M-Pesa). The Android app ID is still
  `com.qnex.hodi`, while the push channel is `co.ke.kodihub.push`. Image names, the refresh cookie
  (`hodi_rt`) and server paths still say `hodi`; that's fine to keep, but decide deliberately.
- **L5. Very large files.** `parity_screens.dart` (2,287 lines), `AdminSettingsPage.tsx` (1,404),
  `AdminReportsPage.tsx` (1,259) and `home_screen.dart` (1,286). The web app ships as one 1.15 MB
  bundle; lazy-load the admin area.
- **L6. Backend `npm audit`:** 5 moderate issues through `@google-cloud/storage`. Update when a
  fixed version is available.

## What looks good

- **Platform roles are checked against the database on every request** (`auth.guard.ts:52–67`), so
  demoting or disabling an operator takes effect immediately.
- Salesperson data is consistently limited to the organisations they onboarded.
- The guard against removing the last super admin, or demoting yourself, is in place.
- **SMTP and Africa's Talking credentials are field-encrypted** and never returned (`passwordSet`
  only).
- **CSV export escapes formula characters** (`common/http/csv.ts`); uploads still use magic-byte type
  checks.
- **Migrations are additive only**: no drops, renames or type changes, and no edits to existing
  migrations.
- **No secrets were committed** (test fixtures only).
- **DNS for all the new domains** points at the right servers, and dev answers on them.
- The landing page puts admin content in with `textContent`, not HTML.

## Recommended order

1. **Now:** fix C1, H1 and H2 on `dev`, with e2e tests reproducing each attack. Until then, keep
   `main` where it is. Optionally, on dev, check the audit log for unexpected `auth.login` events by
   OTP.
2. Make deploys depend on CI (H3), fix the e2e test (M7), and protect `main`.
3. M1–M4 and M6 (password handling) before real customers.
4. Before the first production deploy: M8 (domains, Daraja callback URLs), M9 (font licence).
5. Push for real (M5) as its own piece of work.
6. Low items as you go.

## Not reviewed in depth

Given the size (about 45k lines), I read for security and correctness risk rather than line by line.
Not reviewed in detail:
- the 14 platform report queries (correctness of figures);
- PDF layouts;
- most mobile and web UI screens and the CSV import mappings;
- email template wording;
- the landing page copy.

None of these looked risky at a glance. They deserve functional testing in the browser and on a
device rather than code reading.
