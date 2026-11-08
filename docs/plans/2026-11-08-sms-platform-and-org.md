# Platform SMS and Organisation SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Owner rules for this repo:** execute inline (no subagents); never `git commit` / `git push` — the owner commits. "Commit" steps below mean: stop, list the files for the owner.

**Goal:** Every SMS is either a platform message (KodiHub pays, KodiHub sender) or an organisation message routed by the organisation's mode — prepaid KodiHub units, or the organisation's own TextSMS Kenya / Africa's Talking / HostPinnacle account — with buying, balances, usage, warnings and admin controls.

**Architecture:** A new `SmsService` (in the notifications module) is the only thing that talks to SMS providers. `NotificationsService.dispatchSms` takes a typed `SmsSpec` (platform vs organisation) and hands it to `SmsService`, which picks the route, charges/refunds units through an atomic ledger, records an `SmsLog`, and returns an outcome; `NotificationsService` raises owner warnings from the outcome (no module cycle). Unit purchases reuse KodiHub's platform M-Pesa (STK + C2B) with a `purpose` flag so they never touch platform invoices.

**Tech Stack:** NestJS + Prisma 7 + Postgres (backend, vitest unit + e2e), React + TanStack Query (web, vitest), existing `FieldCipher`, `DarajaClient`, `AfricasTalkingSmsSender`, `smsSegments`.

**Spec:** `docs/specs/2026-11-08-sms-platform-and-org-design.md`

## Global Constraints

- Platform messages never use units, never depend on the organisation's mode, balance or settings.
- 1 unit = 1 SMS part, counted with the existing `smsSegments(text)` (`backend/src/modules/tenant-portal/broadcast-rules.ts`; GSM-7 160 / 153, otherwise 70 / 67). Web uses its twin in `frontend/src/features/messages/rules.ts`.
- Balance never below zero; units taken atomically before the provider call, refunded if the provider rejects.
- Not enough units → status `NO_UNITS`, nothing sent, nothing charged — except `GUEST_BOOKING` codes, which go out through KodiHub at KodiHub's cost (route `PLATFORM_FREE`, 0 units).
- Own-SMS failure → status `FAILED` with the provider's reason; KodiHub sends instead only when the owner turned on `fallbackToPlatform` **and** the balance covers it (route `PLATFORM_FALLBACK`, charged).
- Money in minor units (cents, `BigInt`), M-Pesa amounts whole shillings (round the total **up** to the next 100 cents).
- Defaults: unit price `80` cents (KES 0.80); bundles `[500, 1000, 5000]`; minimum custom bundle `100` units; free units for new organisations `100`; low-balance level `50`; warnings at most once per Nairobi day per kind.
- Provider secrets are write-only: stored with `FieldCipher` (contexts `sms.org.apikey`, `sms.org.password`, `platform.sms.textsms`, `platform.sms.hostpinnacle.key`, `platform.sms.hostpinnacle.password`), API returns `hasApiKey` / `hasPassword` booleans, never the secrets.
- Only KodiHub admin (`@PlatformAdminOnly()`) changes an organisation's mode, provider, credentials, sender ID, unit price override, or adjusts units (with a reason, audited). Owners need `sms:manage` to buy units and change `lowBalanceLevel` / `fallbackToPlatform`; `sms:view` to see the page.
- TextSMS: `POST https://sms.textsms.co.ke/api/services/sendsms/` JSON `{ apikey, partnerID, message, shortcode, mobile }`; success when `responses[0]["respose-code"] === 200` (field spelled `respose-code`); message id `responses[0].messageid`.
- HostPinnacle (from their Postman collection): `POST https://smsportal.hostpinnacle.co.ke/SMSApi/send`, `multipart/form-data` (`FormData`), header `apiKey: <key>`, fields `userid, password, senderid, msg, mobile (254… no +), sendMethod=quick, msgType, duplicatecheck=true, output=json`; `msgType` is `text` when every character is GSM-7 and `unicode` otherwise (reuse the GSM check behind `smsSegments`). Never send `test`. Errors come back as **HTTP 200** with `{"status":"error","statusCode":"216","reason":"Invalid credentials"}` (observed 2026-11-08, test mode). Success = HTTP 2xx **and** JSON `status` equals `success` (case-insensitive); otherwise `ProviderError(reply.reason ?? reply.message ?? 'HostPinnacle refused the message')`, or `HostPinnacle refused the message (HTTP {code})` for non-2xx / non-JSON. Success reply still unconfirmed — never log the request body (it carries the password).
- Copy: "SMS units", "KodiHub sends your SMS", "Your own SMS account", "Not sent — no SMS units", "Buy SMS". Wording elsewhere unchanged.
- Each new SMS-sending call site must pass an `SmsSpec`; a send without one does not compile.

## Review Focus

1. Two messages for an org with 1 unit sent at the same moment: exactly one is sent, one is `NO_UNITS`, balance ends at 0 (never −1). → Task 4 test `charges atomically under concurrency`.
2. Safaricom retries the STK callback, and a C2B confirmation also arrives for the same receipt: units credited once. → Task 7 test `credits a bundle once per receipt`.
3. An SMS bundle payment is never allocated to a platform invoice, and a normal invoice STK never becomes units. → Task 7 test `keeps bundle money off invoices`.
4. Own provider down for a host whose guest is trying to book: guest booking code still goes out? No — own-SMS failure fails the code (spec: fallback is opt-in); but a **Platform-SMS** host at 0 units still sends it free. → Task 4 tests `sends guest booking codes free at zero units` and `does not rescue own-SMS failures without fallback`.
5. Buying while the unit price changes mid-purchase: the units credited use the price stored on the purchase, not today's price. → Task 7 test `credits the units bought at the stored price`.

---

## File Structure

**Backend — new** (`backend/src/modules/notifications/sms/`)
- `sms-types.ts` — `SmsSpec`, `PlatformSmsType`, `OrgSmsType`, `SmsOutcome`, `SmsProviderConfig`.
- `sms-providers.ts` (+ `.spec.ts`) — `TextSmsSender`, `createProviderSender(config, env)`, `ProviderError`.
- `sms.service.ts` — routing, ledger, `SmsLog`.
- `sms-accounts.service.ts` — account view, settings, admin set-up/adjust, opening balance.
- `sms-purchases.service.ts` — bundle quote, STK start, credit on payment.
- `sms.controller.ts` — org endpoints `/sms…`.
- `sms-admin.controller.ts` — admin endpoints `/platform/…sms…`.
- `sms.dto.ts`, `sms-math.ts` (+ `.spec.ts`) — price/amount/bundle maths.

**Backend — modified**
- `prisma/schema.prisma`, `prisma/migrations/20261109100000_sms_units/migration.sql`
- `src/modules/roles/permissions.ts` (+ spec)
- `src/modules/notifications/notifications.service.ts`, `senders.ts`, `notifications.module.ts`
- every caller listed in Task 5
- `src/modules/platform/platform-pay.service.ts`, `platform-admin.service.ts`, `platform.dto.ts`
- `src/modules/organizations/organizations.service.ts`, `src/modules/auth/auth.service.ts` (open SMS account on create)
- `src/modules/tenant-portal/broadcasts.service.ts`, `tenant-accounts.service.ts` (bulk pre-check)
- `test/sms.e2e-spec.ts` (new), `test/helpers.ts`

**Web — new**: `frontend/src/features/sms/{api.ts,types.ts,rules.ts,rules.test.ts,SmsPage.tsx,BuySmsSheet.tsx,SmsBanner.tsx}`, `frontend/src/features/admin/{AdminOrgSms.tsx,AdminSmsSettings.tsx,AdminSmsReport.tsx}`
**Web — modified**: `App.tsx`, `app/navigation.ts` (+test), `app/AppShell.tsx`, `features/messages/MessagesPage.tsx`, the manual-reminder button's component, `features/admin/{AdminSettingsPage,OrganizationDetailPage,AdminReportsPage}.tsx`.

---

### Task 1: Data model, migration and permissions

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/modules/roles/permissions.ts`, `backend/src/modules/roles/permissions.spec.ts`
- Create: `backend/prisma/migrations/20261109100000_sms_units/migration.sql`

**Interfaces — Produces:**
```prisma
enum SmsMode { PLATFORM OWN }
enum SmsProvider { AFRICASTALKING TEXTSMS HOSTPINNACLE }
enum SmsKind { PLATFORM ORG }
enum SmsRoute { PLATFORM ORG_PROVIDER PLATFORM_FALLBACK PLATFORM_FREE }
enum SmsLogStatus { SENT FAILED NO_UNITS }
enum SmsLedgerKind { PURCHASE ADJUSTMENT CHARGE REFUND }
enum SmsPurchaseState { PENDING PAID FAILED }

model SmsAccount {            // one per organisation, @@map("sms_accounts")
  orgId String @id @db.Uuid
  mode SmsMode @default(PLATFORM)
  provider SmsProvider?
  providerUser String?        // AT username, TextSMS partner ID, or HostPinnacle user ID
  providerKeyEnc Bytes?       // API key (all providers)
  providerSecretEnc Bytes?    // HostPinnacle password
  senderId String?
  sandbox Boolean @default(false)
  unitPrice BigInt?           // cents; null = platform price
  lowBalanceLevel Int @default(50)
  fallbackToPlatform Boolean @default(false)
  balance Int @default(0)
  lowWarnedOn DateTime? @db.Date
  emptyWarnedOn DateTime? @db.Date
  failWarnedOn DateTime? @db.Date
  failingSince DateTime?
  lastFailReason String?
  updatedAt DateTime @updatedAt
}
model SmsLog { id uuid7; orgId String? @db.Uuid; kind SmsKind; type String; to String; units Int @default(0);
  route SmsRoute?; provider SmsProvider?; providerMessageId String?; status SmsLogStatus; reason String?;
  createdAt DateTime @default(now()); @@index([orgId, createdAt]) @@map("sms_logs") }
model SmsLedgerEntry { id uuid7; orgId String @db.Uuid; kind SmsLedgerKind; units Int; balanceAfter Int;
  smsLogId String? @db.Uuid; purchaseId String? @db.Uuid; reason String?; createdById String? @db.Uuid;
  createdAt DateTime @default(now()); @@index([orgId, createdAt]) @@map("sms_ledger") }
model SmsPurchase { id uuid7; orgId String @db.Uuid; units Int; unitPrice BigInt; amount BigInt;
  state SmsPurchaseState @default(PENDING); phone String?; stkRequestId String? @unique @db.Uuid;
  mpesaReceipt String? @unique; source PlatformPaySource; requestedById String? @db.Uuid;
  createdAt DateTime @default(now()); paidAt DateTime?; @@index([orgId, createdAt]) @@map("sms_purchases") }
```
`PlatformSettings` gains: `smsProvider SmsProvider @default(AFRICASTALKING)`, `textsmsPartnerId String?`, `textsmsKeyEnc Bytes?`, `textsmsSenderId String?`, `hostpinnacleUserId String?`, `hostpinnacleKeyEnc Bytes?`, `hostpinnaclePasswordEnc Bytes?`, `hostpinnacleSenderId String?`, `smsUnitPrice BigInt @default(80)`, `smsBundles Int[] @default([500, 1000, 5000])`, `smsMinUnits Int @default(100)`, `smsFreeUnits Int @default(100)`.
`PlatformStkRequest` gains `purpose String @default("INVOICE")` (`'INVOICE' | 'SMS'`).
Permissions: group `sms`, label `SMS`: `{ key: 'sms:view', label: 'See SMS balance and usage' }`, `{ key: 'sms:manage', label: 'Buy SMS units and change SMS settings' }`. Both kinds' OWNER get all (already `ALL_PERMISSIONS`); MANAGER and ACCOUNTANT get `sms:view` via the view filters — confirm `sms:*` is not in `STAYS_KEY_SET` so landlords get it too; exclude `sms:manage` from HOST and LANDLORD MANAGER lists.

- [ ] **Step 1: Failing test** in `permissions.spec.ts`:
```ts
it('gives owners SMS management and managers/accountants SMS viewing, for every kind', () => {
  for (const kind of ['LANDLORD', 'AGENCY', 'HOST'] as const) {
    const r = systemRoleDefaults(kind);
    expect(r.OWNER.permissions).toEqual(expect.arrayContaining(['sms:view', 'sms:manage']));
    expect(r.MANAGER.permissions).toContain('sms:view');
    expect(r.MANAGER.permissions).not.toContain('sms:manage');
    expect(r.ACCOUNTANT.permissions).toContain('sms:view');
    expect(r.CARETAKER.permissions).not.toContain('sms:view');
  }
});
```
- [ ] **Step 2:** `cd backend && npx vitest run src/modules/roles/permissions.spec.ts` → FAIL (`sms:view` missing).
- [ ] **Step 3:** Add the permissions; add the schema; write the migration (Prisma-generated DDL via `npx prisma migrate diff`, then append):
```sql
-- Every existing organisation gets an SMS account with the opening balance (spec call 8).
INSERT INTO "sms_accounts" ("orgId","balance","updatedAt") SELECT "id", 100, now() FROM "organizations";
INSERT INTO "sms_ledger" ("id","orgId","kind","units","balanceAfter","reason","createdAt")
  SELECT gen_random_uuid(), "id", 'ADJUSTMENT', 100, 100, 'Opening balance', now() FROM "organizations";
UPDATE "roles" SET "permissions" = array_append("permissions", 'sms:view')
 WHERE "systemKey" IN ('MANAGER','ACCOUNTANT') AND NOT ('sms:view' = ANY("permissions"));
```
- [ ] **Step 4:** `npx prisma generate && npx vitest run src/modules/roles` → PASS; `npm run test:e2e -- stays-schema` still PASS (migration applies).
- [ ] **Step 5:** Owner commit point: schema, migration, permissions.

### Task 2: Providers (TextSMS Kenya, Africa's Talking and HostPinnacle behind one interface)

**Files:** Create `backend/src/modules/notifications/sms/sms-types.ts`, `sms-providers.ts`, `sms-providers.spec.ts`; modify `senders.ts` (`OutboxEntry` sms gains `via: string`).

**Interfaces — Produces:**
```ts
export type SmsProviderConfig =
  | { provider: 'AFRICASTALKING'; username: string; apiKey: string; senderId: string | null; sandbox: boolean }
  | { provider: 'TEXTSMS'; partnerId: string; apiKey: string; senderId: string | null }
  | { provider: 'HOSTPINNACLE'; userId: string; password: string; apiKey: string; senderId: string };
export class ProviderError extends Error {}           // message = plain reason shown to people
export interface ProviderSender { send(to: string, text: string): Promise<{ messageId: string | null }> }
export function createProviderSender(config: SmsProviderConfig, env: Env, via: string): ProviderSender;
export class TextSmsSender implements ProviderSender { constructor(partnerId: string, apiKey: string, senderId: string | null) }
export class HostPinnacleSmsSender implements ProviderSender { constructor(userId: string, password: string, apiKey: string, senderId: string) }
```
In `NODE_ENV === 'test'` `createProviderSender` returns a log sender that pushes `{ channel: 'sms', to, text, via, at }` to `outbox` and throws `ProviderError('The SMS provider rejected the API key')` when `apiKey === 'test-reject'`. `AfricasTalkingSmsSender.send` keeps its signature; wrap it so it returns `{ messageId: null }` and rethrows its errors as `ProviderError`.

- [ ] **Step 1: Failing tests** (`sms-providers.spec.ts`, mock `global.fetch`):
```ts
it('sends through TextSMS and returns its message id', async () => {
  fetchMock.mockResolvedValue(json({ responses: [{ 'respose-code': 200, 'response-description': 'Success', mobile: 254712345678, messageid: 8290842 }] }));
  await expect(new TextSmsSender('1234', 'key', 'MAKINI').send('+254712345678', 'Hi')).resolves.toEqual({ messageId: '8290842' });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ apikey: 'key', partnerID: '1234', message: 'Hi', shortcode: 'MAKINI', mobile: '254712345678' });
});
it('turns a TextSMS refusal into a plain reason', async () => {
  fetchMock.mockResolvedValue(json({ responses: [{ 'respose-code': 1006, 'response-description': 'Invalid credentials' }] }));
  await expect(new TextSmsSender('1', 'bad', null).send('+254712345678', 'Hi')).rejects.toThrow(new ProviderError('Invalid credentials'));
});
it('sends through HostPinnacle as a form with the key in a header', async () => {
  fetchMock.mockResolvedValue(json({ status: 'success', transactionId: 'abc123' }));
  await expect(new HostPinnacleSmsSender('user1', 'pw', 'key', 'MAKINI').send('+254712345678', 'Hi')).resolves.toEqual({ messageId: 'abc123' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://smsportal.hostpinnacle.co.ke/SMSApi/send');
  expect(init.headers.apiKey).toBe('key');
  expect(Object.fromEntries((init.body as FormData).entries())).toEqual({ userid: 'user1', password: 'pw', senderid: 'MAKINI', msg: 'Hi', mobile: '254712345678', sendMethod: 'quick', msgType: 'text', duplicatecheck: 'true', output: 'json' });
});
it('marks messages with emoji as unicode for HostPinnacle', async () => {
  fetchMock.mockResolvedValue(json({ status: 'success' }));
  await new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Karibu 🏠');
  expect((fetchMock.mock.calls[0][1].body as FormData).get('msgType')).toBe('unicode');
});
it('turns a HostPinnacle refusal into a plain reason', async () => {
  fetchMock.mockResolvedValue(json({ status: 'error', statusCode: '216', reason: 'Invalid credentials' })); // real reply shape, HTTP 200
  await expect(new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Hi')).rejects.toThrow(new ProviderError('Invalid credentials'));
  fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
  await expect(new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Hi')).rejects.toThrow('HostPinnacle refused the message (HTTP 401)');
});
it('reports an unreachable provider', async () => {
  fetchMock.mockRejectedValue(new Error('ECONNRESET'));
  await expect(new TextSmsSender('1', 'k', null).send('+254712345678', 'Hi')).rejects.toThrow('Could not reach the SMS provider');
});
```
- [ ] **Step 2:** `npx vitest run src/modules/notifications/sms/sms-providers.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. `mobile` is the number without `+`. Request timeout 15 s (`AbortSignal.timeout`).
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Owner commit point.

### Task 3: Unit price maths

**Files:** Create `backend/src/modules/notifications/sms/sms-math.ts`, `sms-math.spec.ts`.

**Interfaces — Produces:** `bundleAmount(units: number, unitPrice: bigint): bigint` (cents, rounded **up** to whole shillings); `effectiveUnitPrice(account: { unitPrice: bigint | null }, settings: { smsUnitPrice: bigint }): bigint`; `checkBundleUnits(units: number, min: number): string | null` (null = ok; integer, ≥ min, ≤ 1,000,000).

- [ ] **Step 1: Failing tests:**
```ts
expect(bundleAmount(500, 80n)).toBe(40000n);        // KES 400
expect(bundleAmount(333, 80n)).toBe(26700n);        // 266.40 → KES 267
expect(effectiveUnitPrice({ unitPrice: null }, { smsUnitPrice: 80n })).toBe(80n);
expect(effectiveUnitPrice({ unitPrice: 65n }, { smsUnitPrice: 80n })).toBe(65n);
expect(checkBundleUnits(99, 100)).toBe('Buy at least 100 units');
expect(checkBundleUnits(150.5, 100)).toBe('Enter a whole number of units');
expect(checkBundleUnits(1000, 100)).toBeNull();
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS. **Step 5:** owner commit point.

### Task 4: `SmsService` — routing, ledger, log

**Files:** Create `backend/src/modules/notifications/sms/sms.service.ts`; modify `notifications.module.ts` (provide + export); create `backend/test/sms.e2e-spec.ts`; `test/helpers.ts` gains `lastSms(to: string): { text: string; via: string }`.

**Interfaces:**
- Consumes: Task 1 models, Task 2 `createProviderSender`, `smsSegments`.
- Produces:
```ts
export type PlatformSmsType = 'login_otp' | 'password_reset' | 'step_up' | 'admin_2fa' | 'invitation' | 'operator_welcome' | 'owner_portal_access' | 'payout_changed' | 'sms_test';
export type OrgSmsType = 'booking_otp' | 'booking' | 'stay_payment' | 'payment_receipt' | 'rent_reminder' | 'reminder_manual' | 'portal_access' | 'broadcast' | 'rent_change' | 'tenant_notice';
export type SmsSpec = { kind: 'platform'; type: PlatformSmsType } | { kind: 'org'; orgId: string; type: OrgSmsType };
export type SmsWarning = 'LOW' | 'EMPTY' | 'FAILING';
export interface SmsOutcome { status: 'SENT' | 'FAILED' | 'NO_UNITS'; route: SmsRoute | null; units: number; reason: string | null; logId: string; warn: SmsWarning | null }
export class SmsNotSentError extends Error { constructor(public readonly outcome: SmsOutcome) }
class SmsService {
  send(spec: SmsSpec, to: string, text: string): Promise<SmsOutcome>;   // never throws for provider/units problems
  platformSender(): Promise<ProviderSender>;                             // from PlatformSettings.smsProvider (+ env fallback as today)
}
```
Rules (in this order) for `kind: 'org'`:
1. Load `SmsAccount` (create on the fly with balance 0 if missing — older test orgs).
2. `mode === 'OWN'` and provider configured → send via org provider (route `ORG_PROVIDER`, 0 units). On success clear `failingSince`. On `ProviderError`: set `failingSince` (keep earliest) + `lastFailReason`; if `fallbackToPlatform` and `charge(n)` succeeds → send via platform (route `PLATFORM_FALLBACK`, refund on rejection); else `FAILED`, `warn: 'FAILING'` when `failWarnedOn !== today`.
3. `mode === 'PLATFORM'`: `charge(n)` = single `UPDATE sms_accounts SET balance = balance - n WHERE "orgId" = $1 AND balance >= n RETURNING balance` + ledger `CHARGE` (−n, `balanceAfter`) in one transaction. If no row: `type === 'booking_otp'` → send via platform route `PLATFORM_FREE`, 0 units; else `NO_UNITS`, `warn: 'EMPTY'` when `emptyWarnedOn !== today`. If charged → send; on `ProviderError` refund (+n, `REFUND`), status `FAILED`. After a charge, `warn: 'LOW'` when the new balance `< lowBalanceLevel` and the old was `>=`, or `lowWarnedOn !== today` and new `< lowBalanceLevel`.
4. `kind: 'platform'` → platform sender, route `PLATFORM`, 0 units, never touches accounts.
Every call writes one `SmsLog` (masked nothing — `to` stored as given; the UI masks). Ledger `smsLogId` links the charge.

- [ ] **Step 1: Failing e2e tests** (`test/sms.e2e-spec.ts`, using `onboardOrg` then setting the account directly through Prisma):
```ts
it('charges units for an organisation SMS and logs it', ...)            // balance 100, 1-part text → SENT, units 1, balance 99, ledger CHARGE −1 balanceAfter 99, outbox via 'platform'
it('counts long messages as several units', ...)                         // 200 GSM chars → units 2
it('does not send without units and warns once a day', ...)              // balance 0 → NO_UNITS, nothing in outbox, warn 'EMPTY'; second call same day warn null
it('sends guest booking codes free at zero units', ...)                  // balance 0, type booking_otp → SENT, route PLATFORM_FREE, units 0, balance 0
it('never charges platform messages', ...)                               // balance 0, kind platform → SENT route PLATFORM, balance 0, no ledger rows
it('sends through the organisation provider without units', ...)          // mode OWN, provider TEXTSMS, key 'ok' → SENT, route ORG_PROVIDER, via `org:${orgId}`, balance unchanged
it('does not rescue own-SMS failures without fallback', ...)             // key 'test-reject' → FAILED, reason 'The SMS provider rejected the API key', warn 'FAILING', failingSince set, nothing via platform
it('falls back to KodiHub when the owner allows it and units cover it', ...) // fallbackToPlatform true, balance 5 → SENT route PLATFORM_FALLBACK, balance 4
it('clears the failing state after a successful send', ...)
it('charges atomically under concurrency', ...)                          // balance 1, Promise.all of 2 sends → one SENT one NO_UNITS, balance 0
it('refunds units when the provider rejects', ...)                       // platform sender forced to reject (PlatformSettings TextSMS key 'test-reject', smsProvider TEXTSMS) → FAILED, balance back to start, ledger CHARGE + REFUND
```
- [ ] **Step 2:** `cd backend && npm run test:e2e -- sms` → FAIL (SmsService missing).
- [ ] **Step 3:** Implement `SmsService`; "today" via `todayInNairobi()`.
- [ ] **Step 4:** Same command → PASS (11 tests).
- [ ] **Step 5:** Owner commit point.

### Task 5: Route every existing SMS through `SmsSpec`

**Files:** Modify `notifications.service.ts` and callers:
`auth/auth.service.ts:552`, `stays/public/public-site.service.ts` (402, 594, 610, 633, 832, 877), `stays/bookings/bookings.service.ts` (123, 143, 189, 654, 703, 829, 1011, 1082, 1112), `stays/payments/stay-payments.service.ts:351`, `tenant-portal/messages.service.ts:57`, `portfolio/tenancies/rent-changes.service.ts:222`, `payments/payments.service.ts` (`sendPaymentReceipt` caller).

**Interfaces:**
- Consumes: Task 4 `SmsService.send`, `SmsSpec`, `SmsNotSentError`.
- Produces (new signatures):
```ts
sendCode(to: Recipient, purpose: 'login'|'reset'|'step-up'|'admin-2fa', code: string, minutes: number): Promise<void>;
sendBookingCode(orgId: string, phone: string, code: string, minutes: number, bizName: string): Promise<void>;
sendSms(spec: Extract<SmsSpec, { kind: 'org' }>, phone: string, text: string): Promise<void>; // throws SmsNotSentError unless SENT
sendPaymentReceipt(orgId: string, phone: string, p: {...unchanged}): Promise<void>;
private dispatchSms(spec: SmsSpec, phone: string, text: string): Promise<void>; // calls sms.send, raises warnings, throws SmsNotSentError when not SENT
```
Mapping: `sendCode` → `platform` with `login_otp|password_reset|step_up|admin_2fa`; `sendInvitation` → `invitation`; `sendOperatorWelcome` → `operator_welcome`; `deliver()` gains an `SmsSpec` param — `sendOwnerPortalAccess` → `owner_portal_access`, `sendPayoutChanged` → `payout_changed`. Booking callers → `booking` / `booking_otp`; stay payments → `stay_payment`; messages.service → map `MessageKind`: `REMINDER_DUE|REMINDER_OVERDUE` → `rent_reminder`, `REMINDER_MANUAL` → `reminder_manual`, `PORTAL_ACCESS` → `portal_access`, `BROADCAST` → `broadcast`; rent changes → `rent_change`.
`messages.service.ts` stores `error` = `"Not sent — no SMS units"` when `outcome.status === 'NO_UNITS'`, else the provider reason.

- [ ] **Step 1: Failing e2e tests** (append to `sms.e2e-spec.ts`):
```ts
it('sends a staff login code through KodiHub even at zero units', ...)   // org balance 0; POST login OTP → lastSms(phone).via === 'platform'; balance still 0
it('sends rent reminders as the organisation and records no-unit failures', ...) // balance 0, remind-now → messages row status FAILED error 'Not sent — no SMS units'
it('sends a host guest booking code as the host', ...)                   // host mode OWN TEXTSMS → lastSms(guestPhone).via === `org:${orgId}`
```
- [ ] **Step 2:** `npm run test:e2e -- sms` → the 3 new tests FAIL; `npx tsc --noEmit` fails at every old `sendSms(phone, text)` call (good: the compiler lists the call sites).
- [ ] **Step 3:** Change signatures, fix every caller the compiler reports; existing e2e helpers `lastCode` keep working (outbox entries unchanged apart from `via`).
- [ ] **Step 4:** `npm run build && npm test && npm run test:e2e` → all PASS (existing 170 + new).
- [ ] **Step 5:** Owner commit point.

### Task 6: Owner warnings

**Files:** Modify `notifications.service.ts` (inside `dispatchSms` after `sms.send`), `sms.service.ts` (`markWarned(orgId, warn)`); email templates in `email-templates.ts` (`sms_low`, `sms_empty`, `sms_failing`).

**Interfaces — Produces:** `private warnOwners(orgId: string, warn: SmsWarning, detail: { balance: number; reason: string | null }): Promise<void>` — for each active member with the OWNER system role: `notifyUser({ userId, orgId, kind: 'sms_low'|'sms_empty'|'sms_failing', title, body, actionUrl: '/app/settings/sms' })` plus one email (platform email, not SMS). Sets `lowWarnedOn` / `emptyWarnedOn` / `failWarnedOn` = today. Warning failures are logged, never thrown.
Copy: LOW title "SMS units running low", body "{balance} SMS units left. Buy more so messages to your tenants and guests keep going." · EMPTY "Out of SMS units" / "Messages to your tenants and guests are not being sent. Buy SMS units to start again." · FAILING "Your SMS account isn't sending" / "{reason}. Messages to your tenants and guests are failing. Check your SMS account, or buy KodiHub SMS units."

- [ ] **Step 1: Failing e2e tests:**
```ts
it('tells owners once a day when units run out', ...)  // 2 NO_UNITS sends → 1 user_notifications row kind 'sms_empty' for the owner
it('tells owners when their own SMS account fails', ...) // 'test-reject' → 1 row kind 'sms_failing', body starts 'The SMS provider rejected the API key'
it('warns when the balance drops below the low level', ...) // balance 51, level 50, send 2 units → 1 row 'sms_low'
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm run test:e2e -- sms` → PASS. **Step 5:** owner commit point.

### Task 7: Buying units (STK + C2B, credited once)

**Files:** Create `sms-purchases.service.ts`; modify `platform/platform-pay.service.ts` (STK start accepts `purpose`/`accountReference`/`description`; `handleStkCallback` and `handleC2b` branch).

**Interfaces:**
- Consumes: Task 3 maths, existing `PlatformPayService` STK setup and `DarajaClient`.
- Produces:
```ts
class SmsPurchasesService {
  quote(orgId: string): Promise<{ unitPrice: string; bundles: { units: number; amount: string }[]; minUnits: number }>;
  start(units: number, phone: string | undefined, idempotencyKey?: string): Promise<SmsPurchaseView>; // org context; checkBundleUnits; STK purpose 'SMS', accountReference `SMS${billingRef}`, description 'KodiHub SMS'
  get(id: string): Promise<SmsPurchaseView>;
  creditFromStk(stkRequestId: string, receipt: string, amount: bigint): Promise<void>;  // idempotent by receipt
  creditFromC2b(billingRef: string, receipt: string, amount: bigint, payerName: string | null): Promise<void>; // units = floor(amount / effective price); creates a PAID purchase source C2B
}
interface SmsPurchaseView { id: string; units: number; amount: string; state: 'PENDING'|'PAID'|'FAILED'; mpesaReceipt: string | null; createdAt: Date; paidAt: Date | null }
```
`PlatformPayService.handleStkCallback`: after the existing confirmation query, `if (req.purpose === 'SMS') { await smsPurchases.creditFromStk(req.id, cb.receipt, cb.amount); finish(...SUCCESS, paymentId null); return; }` — no `recordOnce`. Failed/cancelled STK → purchase `FAILED`. `handleC2b`: if `normalizeAccountRef(ref)` matches `/^SMS(H\d{5})$/` → `creditFromC2b($1, …)` and return; never `recordOnce`. Crediting = one transaction: purchase `PAID` (unique `mpesaReceipt` guards repeats), `balance += units`, ledger `PURCHASE`; clear `emptyWarnedOn`/`lowWarnedOn`; after commit, owners get `notifyUser` kind `sms_bought` + receipt email.

- [ ] **Step 1: Failing e2e tests** (reuse the fake `DarajaClient` pattern from `test/platform.e2e-spec.ts`):
```ts
it('starts an M-Pesa prompt for a bundle at the platform price', ...)   // POST /sms/buy {units:500} → STK amount 40000, accountReference 'SMSH00001', purchase PENDING
it('credits the bundle when M-Pesa confirms', ...)                       // STK callback success → purchase PAID, balance +500, ledger PURCHASE
it('credits a bundle once per receipt', ...)                             // callback twice + C2B with same receipt → +500 once
it('keeps bundle money off invoices', ...)                               // after SMS STK success: platform_payments count unchanged; normal /billing/pay STK still records a payment, sms balance unchanged
it('credits the units bought at the stored price', ...)                  // start at 80 cents, admin changes price to 100, callback → +500 (not 400)
it('turns a paybill payment with account SMS<ref> into units', ...)      // C2B 40000 to 'SMSH00001' → +500
it('refuses bundles below the minimum', ...)                             // units 50 → 422 field 'units' 'Buy at least 100 units'
it('needs sms:manage to buy', ...)                                       // caretaker/manager → 403
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm run test:e2e -- sms platform` → PASS (platform tests unchanged). **Step 5:** owner commit point.

### Task 8: Organisation and admin SMS API

**Files:** Create `sms-accounts.service.ts`, `sms.controller.ts`, `sms-admin.controller.ts`, `sms.dto.ts`; modify `platform-admin.service.ts` + `platform.dto.ts` (settings fields), `organizations.service.ts` and `auth.service.ts` (call `openAccount` when creating an organisation).

**Interfaces — Produces (all responses via `ok(...)`, money as strings of cents):**
```
GET   /sms                         sms:view    → SmsAccountView
PATCH /sms                         sms:manage  {lowBalanceLevel?: 0..100000, fallbackToPlatform?: boolean} (fallback only allowed when mode OWN → else 422)
GET   /sms/usage?status&from&to&page&pageSize   sms:view → paged SmsLogRow (to masked "+2547****678")
GET   /sms/top-ups?page&pageSize   sms:view    → paged purchases + ADJUSTMENT ledger rows
GET   /sms/quote                   sms:view    → Task 7 quote
POST  /sms/buy                     sms:manage  {units, phone?} + Idempotency-Key → SmsPurchaseView
GET   /sms/buy/:id                 sms:view
GET   /platform/organizations/:id/sms          admin → SmsAccountView + { hasApiKey, providerUser, sandbox, unitPrice }
PUT   /platform/organizations/:id/sms          @PlatformAdminOnly {mode, provider?, providerUser?, apiKey?, password? (HostPinnacle), senderId?, sandbox?, unitPrice?: string|null}
POST  /platform/organizations/:id/sms/test     @PlatformAdminOnly {phone, using?: 'saved'} → sends kind platform type 'sms_test' via the ORG's saved provider config; returns {sent, reason}
POST  /platform/organizations/:id/sms/adjust   @PlatformAdminOnly {units: int ≠ 0, reason: 3..200} → ledger ADJUSTMENT; refuse when balance would go < 0
GET   /platform/organizations/:id/sms/usage, /top-ups   admin (same shapes)
GET   /platform/reports/sms?month=YYYY-MM      admin → rows {orgId, name, unitsBought, amountPaid, unitsUsed, unitsFree}
PUT   /platform/settings  (existing) gains smsProvider, textsmsPartnerId, textsmsApiKey (write-only), textsmsSenderId, hostpinnacleUserId, hostpinnacleApiKey (write-only), hostpinnaclePassword (write-only), hostpinnacleSenderId, smsUnitPrice, smsBundles (1..6 ints ≥ smsMinUnits), smsMinUnits, smsFreeUnits
```
```ts
interface SmsAccountView { mode: 'PLATFORM'|'OWN'; provider: 'AFRICASTALKING'|'TEXTSMS'|null; senderId: string|null;
  balance: number; unitsBought: number; unitsUsed: number; lowBalanceLevel: number; fallbackToPlatform: boolean;
  unitPrice: string; failing: { since: string; reason: string } | null; canBuyInApp: boolean }
openAccount(tx: Tx, orgId: string): Promise<void>  // balance = settings.smsFreeUnits, ledger ADJUSTMENT 'Opening balance'
```
`PUT …/sms` with `mode: 'OWN'` requires provider, providerUser, senderId and (a saved or new) apiKey — plus a saved or new password for HostPinnacle — → 422 per missing field. Every admin write records `audit.record` (`sms.account.update`, `sms.adjust`) without secrets.

- [ ] **Step 1: Failing e2e tests:**
```ts
it('shows the organisation its balance, bought and used units', ...)
it('masks numbers in the usage list and filters by status', ...)
it('only KodiHub admin can switch an organisation to its own SMS', ...)      // owner PUT → 403; admin PUT → 200; GET never returns the key
it('asks for every own-SMS detail before switching', ...)                    // missing senderId → 422 field senderId; HOSTPINNACLE without password → 422 field password
it('sends an admin test SMS through the organisation account', ...)          // outbox via `org:${id}`, response {sent:true}; 'test-reject' → {sent:false, reason}
it('adjusts units with a reason and never below zero', ...)
it('opens new organisations with the free units', ...)                       // onboardOrg → balance 100, ledger 'Opening balance'
it('reports SMS sold and used per organisation for a month', ...)
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm run test:e2e && npm test && npm run lint` → PASS. **Step 5:** owner commit point.

### Task 9: Bulk sends check units first

**Files:** Modify `tenant-portal/broadcasts.service.ts` (`preview`, `create`), `tenant-portal/tenant-accounts.service.ts` (`remindNow`).

**Interfaces — Produces:** `preview()` adds `{ unitsPerMessage: number | null, unitsNeeded: number | null, balance: number | null, mode }` when given `text` (DTO gains optional `text`); `create()` on a PLATFORM-mode org throws `AppError.conflict('Not enough SMS units for this notice: it needs {n}, you have {b}.', 'SMS_UNITS_LOW')` when `smsSegments(text) × recipients > balance`. `remindNow` throws the same code when the reminder's units exceed the balance.

- [ ] **Step 1: Failing e2e tests:**
```ts
it('refuses a broadcast the balance cannot cover', ...)      // 3 tenants, 2-part text, balance 5 → 409 SMS_UNITS_LOW, no broadcast row
it('previews the units a broadcast needs', ...)              // → unitsNeeded 6, balance 5
it('lets own-SMS organisations broadcast without units', ...)
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm run test:e2e -- sms broadcasts tenant-portal` → PASS. **Step 5:** owner commit point.

### Task 10: Web — Settings → SMS page, buying, banner

**Files:** Create `frontend/src/features/sms/{types.ts,api.ts,rules.ts,rules.test.ts,SmsPage.tsx,BuySmsSheet.tsx,SmsBanner.tsx}`; modify `App.tsx` (route `settings/sms`), `app/navigation.ts` (+test; Settings entry `{ label: 'SMS', to: '/app/settings/sms', permission: 'sms:view', hint: 'SMS units, usage and how your messages are sent' }`), `app/AppShell.tsx` (render `SmsBanner` beside `BillingBanner`).

**Interfaces — Produces (`rules.ts`):**
```ts
smsModeLabel(a: SmsAccountView): string   // 'KodiHub sends your SMS' | 'Your own SMS account (sender ID MAKINI, TextSMS Kenya)'
bannerFor(a: SmsAccountView): { tone: 'warn'|'danger'; text: string; action: 'buy'|'check' } | null
  // PLATFORM & balance 0 → danger 'Out of SMS units — messages to your tenants and guests are not being sent.' buy
  // PLATFORM & balance < low → warn '{n} SMS units left.' buy
  // failing → danger 'Your SMS account isn’t sending: {reason}' check (+ buy)
maskedStatus(row): 'Sent' | 'Failed' | 'Not sent — no SMS units'
```
Page sections (follow `PaymentChannelsPage` / settings patterns): mode card; balance with bought/used and **Buy SMS** (needs `sms:manage`); low-balance level + fallback switch (OWN only) with Save; tabs **Usage** (filters status/date, paged table) and **Top-ups**. `BuySmsSheet`: bundle radio list + "Other amount" units input (live KES total from `bundleAmount` twin), phone (prefilled from the user), **Pay KES X with M-Pesa** → poll `GET /sms/buy/:id` every 3 s up to 2 min → "Done — {units} units added" / failure text.

- [ ] **Step 1: Failing tests** (`rules.test.ts`, navigation test):
```ts
expect(smsModeLabel(own)).toBe('Your own SMS account (sender ID MAKINI, TextSMS Kenya)');
expect(bannerFor({ ...platform, balance: 0 })).toEqual({ tone: 'danger', text: 'Out of SMS units — messages to your tenants and guests are not being sent.', action: 'buy' });
expect(bannerFor({ ...platform, balance: 20, lowBalanceLevel: 50 })?.text).toBe('20 SMS units left.');
expect(bannerFor({ ...platform, balance: 500 })).toBeNull();
expect(bundleAmount(333, 80n)).toBe(26700n);
// navigation: SMS entry visible with sms:view for all three kinds
```
- [ ] **Step 2:** `cd frontend && npx vitest run src/features/sms src/app/navigation.test.ts` → FAIL.
- [ ] **Step 3:** implement. **Step 4:** `npm run lint && npx tsc -b && npm test && npm run build` → PASS; browser check: buy flow against local API with the fake/sandbox Daraja, banner at 0 units. **Step 5:** owner commit point.

### Task 11: Web — units shown before bulk sends

**Files:** Modify `frontend/src/features/messages/MessagesPage.tsx` (broadcast form), the manual "Remind now" control (`frontend/src/features/tenants/…` — the component calling `remindNow`), `features/messages/rules.ts` (+test).

**Interfaces — Produces:** `unitsLine(parts: number, recipients: number, account: SmsAccountView | null): string` → `"About 6 SMS units · you have 5"`; own mode → `"Sent from your own SMS account"`. Send button disabled with the line in red when PLATFORM and needed > balance; the 409 `SMS_UNITS_LOW` message is shown if the server refuses.

- [ ] **Step 1: Failing test:** `expect(unitsLine(2, 3, { ...platform, balance: 5 })).toBe('About 6 SMS units · you have 5');`
- [ ] **Step 2–4:** run → FAIL → implement → `npm test && npm run build` PASS. **Step 5:** owner commit point.

### Task 12: Web — KodiHub admin

**Files:** Create `frontend/src/features/admin/{AdminSmsSettings.tsx,AdminOrgSms.tsx,AdminSmsReport.tsx}`; modify `AdminSettingsPage.tsx` (tab label `SMS`, body → `AdminSmsSettings`: provider radio, TextSMS partner ID / API key (write-only, "Saved — enter a new key to replace") / sender ID, HostPinnacle user ID / password / API key (both write-only) / sender ID, existing Africa's Talking fields, unit price (KES), bundles, minimum units, free units for new organisations), `OrganizationDetailPage.tsx` (new tab `SMS` → `AdminOrgSms`: mode switch, provider fields, **Send test SMS**, unit price override, balance with **Add / remove units** (units + reason), usage and top-ups lists), `AdminReportsPage.tsx` (SMS report: month picker, table, totals).

- [ ] **Step 1: Failing test** (`features/admin` rules if any pure helpers are added, else `features/platform/platform.test.ts`): `expect(adjustProblem(-200, 150)).toBe('This would take the balance below zero (150 units left).'); expect(adjustProblem(10, 150, '')).toBe('Give a reason');`
- [ ] **Step 2–4:** FAIL → implement → `npm run lint && npm test && npm run build` PASS; browser check as platform admin: switch an org to own SMS, test SMS (local `test-reject` shows the reason), adjust units. **Step 5:** owner commit point.

### Task 13: Close-out

**Files:** Modify `PENDING.md`, `docs/specs/2026-11-08-sms-platform-and-org-design.md` (status line only).
- [ ] **Step 1:** Add PENDING items: "Mobile: SMS balance and Buy SMS in settings (spec §6, call 6)"; "Confirm TextSMS balance endpoint with TextSMS before showing provider balance"; "Confirm HostPinnacle's success reply against a real account with its API key (errors observed: HTTP 200 {status:'error',statusCode,reason}; a test-mode call without the API key returned 'Invalid credentials')"; "Delivery reports (non-goal for now)".
- [ ] **Step 2:** Full run: backend `npm run lint && npm run build && npm test && npm run test:e2e`; web `npm run lint && npx tsc -b && npm test && npm run build` → all PASS.
- [ ] **Step 3:** Owner commit point: list every changed file.
