# Phase 11 — Platform Admin Suite (implementation plan)

**Date:** 2026-10-29
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §5.4, §6.3 + parity with `UltimatePOS` & `CloudvaRestroPRO` superadmin suites
**Depends on:** phase 8 (done), phase 10 (done)
**Status:** DONE
**Goal:** Complete the Hodi Platform Admin (`/admin`) experience with categorized sidebar navigation, organisation provisioning UI, platform operators (`SUPERADMIN` & `SALESPERSON` roles with book-of-business scoping), dynamic Email SMTP configuration + broadcast + email logs, configurable Admin 2FA on login, expanded platform settings (SMS, signup policy, mobile minimum version, maintenance mode, OTP lockouts), and the 11 superadmin reports.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Operator roles | Add `PlatformRole` (`SUPERADMIN`, `SALESPERSON`) on `User` and `onboardedById` on `Organization`. Existing users with `isPlatformAdmin = true` migrate to `SUPERADMIN`, and runtime guards treat `isPlatformAdmin = true` as `SUPERADMIN` if `platformRole` is null | Full backward compatibility with Phase 0–10 tests while supporting book-scoped salespeople |
| Salesperson scope | Salespeople (`platformRole = SALESPERSON`) can access `/admin` overview, `/admin/organizations` (filtered to `onboardedById = userId`), `/admin/organizations/new` (auto-assigned to themselves), and invoices/payments for their organisations. Platform-wide pages (Plans, Reports, Email, Operators, Settings) require `SUPERADMIN` | Matches `UltimatePOS` operator vs superadmin boundary |
| Email SMTP & logs | Store SMTP settings (`smtpHost`, `smtpPort`, `smtpUser`, `smtpEncryption`, `smtpFromEmail`, `smtpFromName`, `smtpAllowlist`, and `FieldCipher`-encrypted `smtpPassEnc`) in `PlatformSettings`. Log every outbound email in `PlatformEmailLog` (`platform_email_logs`). Fall back to `.env` / `LogEmailSender` when DB SMTP is not set; always record in `outbox` during `NODE_ENV=test` | Live configurable SMTP + full audit trail of sent/failed emails without breaking existing e2e tests |
| Admin 2FA | `PlatformSettings` gains `requireAdminTwoFactor` (`Boolean`, default `false`) and `adminTwoFactorChannel` (`EMAIL` \| `SMS`). When enabled, password login for any platform operator issues an `ADMIN_2FA` OTP and returns `{ requiresTwoFactor: true, challengeToken, channel, destinationMasked }`, verified via `POST /api/v1/auth/login/2fa` | Matches `CloudvaRestroPRO` `SUPERADMIN_EMAIL_CODE` & `UltimatePOS` `SuperadminOtp` |
| Categorized `/admin` sidebar | Group `ADMIN_NAV` into 5 collapsible sections (`Overview`, `Organisations`, `Billing`, `Reports`, `Platform`) using Hodi's existing `Sidebar` group-expansion mechanics and query-string aware active matching | Clean hierarchy for 20+ admin destinations |

## Data model (migration `20261029130000_phase_11_platform_admin_suite`)

- `enum PlatformRole { SUPERADMIN SALESPERSON }`
- `enum OtpPurpose` adds `ADMIN_2FA`
- `User` gains `platformRole PlatformRole?`, relation `onboardedOrganizations Organization[]`
- `Organization` gains `onboardedById String? @db.Uuid` (FK → `users.id`, `ON DELETE SET NULL`), index `(onboardedById)`
- `PlatformSettings` gains:
  - Security: `requireAdminTwoFactor Boolean @default(false)`, `adminTwoFactorChannel MessageChannel @default(EMAIL)`
  - SMTP: `smtpHost String?`, `smtpPort Int? @default(587)`, `smtpUser String?`, `smtpEncryption String? @default("tls")`, `smtpPassEnc Bytes?`, `smtpFromEmail String?`, `smtpFromName String?`, `smtpAllowlist String?`
  - SMS (Africa's Talking): `atUsername String?`, `atSenderId String?`, `atApiKeyEnc Bytes?`
  - App & Signup: `allowPublicSignup Boolean @default(false)`, `minAppVersionCode Int @default(1)`, `minAppVersionName String? @default("1.0.0")`, `appUpdateMessage String?`, `appStoreUrl String?`, `maintenanceMode Boolean @default(false)`, `maintenanceMessage String?`
- `PlatformEmailLog` (`platform_email_logs`) — `id`, `to`, `subject`, `kind`, `status` (`SENT` \| `FAILED`), `error?`, `triggeredById?`, `createdAt`.

## API contract (under `/api/v1`)

### Auth (Admin 2FA)
- `POST /auth/login` → returns session payload OR `{ requiresTwoFactor: true, challengeToken, channel, destinationMasked }` when caller is a platform operator and `requireAdminTwoFactor` is `true`.
- `POST /auth/login/2fa` `{ challengeToken, code, client? }` → verifies 6-digit `ADMIN_2FA` OTP and issues session.

### Platform Operators & Organisations (`/platform/*`)
- `POST /platform/organizations` (`@PlatformOperatorOnly`) — accepts optional `planId`, `onboardedById` (forced to caller when `SALESPERSON`).
- `GET /platform/operators` · `POST /platform/operators` · `PATCH /platform/operators/:id` (`@PlatformAdminOnly`)
- `GET /platform/organizations/unassigned` · `POST /platform/operators/:id/assign-organizations` (`@PlatformAdminOnly`)

### Platform Email (`/platform/email/*`, `@PlatformAdminOnly`)
- `GET /platform/email/settings` · `PUT /platform/email/settings`
- `POST /platform/email/test` `{ to }`
- `POST /platform/email/broadcast` `{ subject, body }`
- `GET /platform/email/logs?q&status&page&pageSize`

### Platform Settings & Security (`/platform/settings`, `/platform/security/*`, `@PlatformAdminOnly`)
- `GET /platform/settings` · `PUT /platform/settings` (extended with `security`, `sms`, `app`)
- `GET /platform/security/locks` · `DELETE /platform/security/locks?key=...`

### Superadmin Reports (`/platform/reports/*`, `@PlatformAdminOnly`)
- `GET /platform/reports/collections?from&to`
- `GET /platform/reports/aged-receivables`
- `GET /platform/reports/activity`
- `GET /platform/reports/subscription-changes?from&to`
- `GET /platform/reports/onboarding?from&to`
- `GET /platform/reports/invoices?from&to&status`
- `GET /platform/reports/plans?from&to`
- `GET /platform/reports/reconciliation`
- `GET /platform/reports/price-variance`
- `GET /platform/reports/salespeople?from&to`
- `GET /platform/reports/audit?q&action&orgId&from&to&page&pageSize`
