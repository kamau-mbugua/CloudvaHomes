# Platform SMS and organisation SMS — design

Date: 2026-11-08 · Status: approved

## 1. Why

Today every SMS on KodiHub, from every organisation, goes out through one KodiHub
Africa's Talking account with KodiHub's sender ID, and nobody pays for it per message.
That has to change:

- Some organisations want KodiHub to send their SMS. KodiHub should charge them for it,
  and they should see how many SMS units they have bought, used and have left.
- Other organisations have their own SMS account and sender ID (e.g. `MAKINI`). Their
  tenants and guests should get messages from that sender ID, sent and paid for through
  that account.
- Either way, messages that protect a KodiHub account (login codes, password resets, …)
  stay KodiHub's job, sent and paid for by KodiHub.

Success: an owner can tell at a glance how their SMS is sent and what it costs; a message
to a tenant or guest is either sent and counted, or visibly not sent with the reason; KodiHub
never quietly pays for an organisation's messages.

## 2. The two kinds of message

**Platform messages** — about a person's KodiHub account. Always sent by KodiHub's own
provider and sender ID, paid by KodiHub, never using an organisation's units, never blocked
by an organisation's balance or settings.

**Organisation messages** — an organisation talking to its own tenants, guests, landlords
and owners. Sent according to the organisation's SMS mode (section 3).

Every SMS-sending call must declare which kind it is (and which organisation, for
organisation messages). A send that does not say is a bug, caught by type, not by default.

### Classification of today's messages

| Message (sender today) | Kind |
|---|---|
| Login, password-reset, step-up and admin 2FA codes (`sendCode` LOGIN / PASSWORD_RESET / STEP_UP / ADMIN_2FA) — staff, tenants, landlords, owners | Platform |
| Staff invitation to join an organisation on KodiHub (`sendInvitation`) | Platform |
| New organisation owner welcome (`sendOperatorWelcome`) | Platform |
| KodiHub's own invoice to an organisation (`sendPlatformInvoiceIssued`) | Platform |
| Owner-portal access for an agency's landlord (`sendOwnerPortalAccess`) | Platform *(call: it hands out KodiHub login access)* |
| Payout details changed alert (`sendPayoutChanged`) | Platform *(call: security alert)* |
| Codes for setting up payment methods / M-Pesa connection (step-up) | Platform |
| Tenant welcome / portal access, tenant added to organisation, unit assigned (`sendTenantWelcome`, `sendTenantAddedToOrg`, `sendTenantUnitAssigned`) | Organisation *(call: the organisation inviting its tenant)* |
| Tenant invoice issued, payment receipt, rent reminders (automatic and manual), rent-change notices, broadcasts | Organisation |
| Guest booking phone check and cancel code (`sendCode` GUEST_BOOKING) | Organisation |
| Booking confirmations, holds, payment requests and receipts, cancellations (stays) | Organisation |

New messages added later must be placed in this table in the same change.

Email and push notifications are out of scope: they keep working as today.

## 3. An organisation's SMS mode

Each organisation is in exactly one mode. New organisations start on **Platform SMS**.

### 3.1 Platform SMS (prepaid units)

- Organisation messages go through KodiHub's provider, with KodiHub's sender ID.
- Each organisation message uses **units** from the organisation's balance.
- **1 unit = 1 SMS part**: up to 160 characters (GSM-7), 153 per part when longer;
  messages with characters outside GSM-7 (e.g. emoji) are 70 / 67 per part. The number of
  units is worked out before sending and shown in previews where the sender writes text
  (broadcasts, manual reminders).
- **Not enough units → not sent.** The message is recorded as *not sent — no SMS units*,
  nothing is charged, and the organisation is told (section 6). Platform messages are never
  affected.
- Units are taken only for messages the provider accepted. A message the provider rejects
  is recorded as failed and its units are given back.
- The balance can never go below zero, even with many messages sending at once (take units
  atomically before the provider call; give them back on rejection).

### 3.2 Own SMS (organisation's provider)

- Set up by **KodiHub admin only**: provider (TextSMS Kenya, Africa's Talking or HostPinnacle), its
  credentials and the sender ID. Secrets are stored encrypted, write-only (never shown again,
  like the Daraja keys). Admin can send a test SMS before switching the organisation over.
- Organisation messages go through the organisation's provider with its sender ID. No units
  are used.
- **If the organisation's provider fails** (wrong credentials, their account out of credit,
  sender ID not approved, provider down): the message is recorded as *failed* with the
  provider's reason, **nothing is sent through KodiHub instead**, and the organisation is
  warned (section 6). The warning offers to **buy KodiHub SMS units**.
- An organisation on own SMS may also hold KodiHub units (bought from that warning or the
  SMS page). The owner can then switch on **"If my SMS account fails, send through KodiHub
  using my units"** (off by default). With it on, a failed message is retried once through
  KodiHub's provider and sender ID and charged in units; with it off, it just fails.
  *(Call: this is how "provide them a way to purchase SMS from the platform" works without
  KodiHub ever stepping in unasked.)*
- Admin can switch an organisation back to Platform SMS at any time; its unit balance is kept.

### 3.3 Who can change what

- Mode, provider credentials, sender ID: KodiHub admin.
- Buying units, the fallback switch, low-balance level: the organisation's owner (and roles
  given a new `sms:manage` permission). Viewing the SMS page: `sms:view`.

## 4. Providers

Both KodiHub (for platform messages and Platform-SMS organisations) and organisations on own
SMS can use either provider. KodiHub admin chooses KodiHub's own provider in platform
settings (today only Africa's Talking is configurable there).

- **Africa's Talking** — existing sender (`AfricasTalkingSmsSender`): username, API key,
  sender ID, sandbox flag.
- **TextSMS Kenya** — new sender. API key, partner ID, sender ID (`shortcode`). Send:
  `POST https://sms.textsms.co.ke/api/services/sendsms/` with `apikey`, `partnerID`,
  `message`, `shortcode`, `mobile` (JSON or query). The response is
  `{ "responses": [ { "respose-code": 200, "response-description": "Success", "mobile": …,
  "messageid": …, … } ] }` — note the field is spelled `respose-code` in their docs. The
  balance endpoint is inconsistent in their docs (`/api/services/getbalance/`); confirm it
  with TextSMS before relying on it. Source: https://textsms.co.ke/bulk-sms-api/
- **HostPinnacle** — new sender. User ID, password, API key, sender ID. Send:
  `POST https://smsportal.hostpinnacle.co.ke/SMSApi/send`, multipart form, header `apiKey`,
  body `userid`, `password`, `senderid`, `msg`, `mobile` (254XXXXXXXXX), `sendMethod=quick`,
  `msgType` (`text`, or `unicode` when the message has characters outside GSM-7),
  `duplicatecheck=true`, `output=json`. Source: HostPinnacle's Postman collection (provided
  by the owner, 2026-11-08). It has no example replies. Observed: errors come back as HTTP 200
  `{"status":"error","statusCode":"216","reason":"Invalid credentials"}`; the success
  reply is still unconfirmed. It also offers `test=true` ("test message without delivery") and
  `GET /account/readstatus`, useful later for checking credentials without sending. Treat HTTP 2xx with a JSON `status` of `success` as sent and
  anything else as failed with the reply's message; confirm against a real account with the
  admin test SMS before switching anyone over. Password and API key are both secrets.
- Senders sit behind one interface so a further provider is a new class, not a new flow.
- A provider's "accepted" response counts as sent. Delivery reports are out of scope for now.

## 5. Buying units (Platform SMS)

- **KodiHub sets the price per unit** (platform setting, e.g. KES 0.80) and can give an
  organisation its own price. The price that applies is shown before buying and stored on
  each purchase.
- **Bundles**: KodiHub admin defines a short list (e.g. 500 / 1,000 / 5,000 units); the
  organisation can also type its own number of units (minimum set by admin). Amounts are
  whole shillings (M-Pesa); round the total up.
- **Paying**: M-Pesa prompt to KodiHub's paybill, reusing the existing platform M-Pesa
  integration (`PlatformStkRequest` / platform payments). A bundle payment must never be
  allocated to KodiHub monthly invoices, and an invoice payment must never become units.
  Units are added once M-Pesa confirms, exactly once per M-Pesa receipt.
- After payment: the units appear at once, and the owner gets a receipt (email, plus an
  in-app notice).
- **Admin top-up**: KodiHub admin can add (or remove) units by hand — free credit, or a bank
  payment — always with a reason, recorded in the platform audit log.
- Bundles are separate from the monthly KodiHub invoice.

## 6. What people see

### Organisation — Settings → SMS (new page)

- Mode in plain words: "KodiHub sends your SMS" (with balance) or "Your own SMS account
  (sender ID MAKINI, TextSMS Kenya)" (no balance unless they hold units).
- Balance, units bought and used, **Buy SMS** (bundle picker → phone → M-Pesa prompt →
  waiting → done).
- Top-ups list (date, units, amount, M-Pesa receipt or "added by KodiHub", reason).
- Usage list: when, to whom (masked), which message type, units, status (sent / failed /
  not sent — no units), with filters by date and status.
- Low-balance level (default 50 units) and the fallback switch (own SMS only).

### Warnings to the organisation

- **Low units** (crossing the low-balance level) and **out of units** (first message not
  sent): in-app notice to owners plus one email, then a banner on the dashboard while it
  lasts. At most one warning of each kind per day.
- **Own SMS failing**: in-app notice + email on the first failure, banner while failures
  continue (cleared by the next successful send), with the provider's reason in plain words
  and a **Buy KodiHub SMS** button.
- The places that send to tenants/guests in bulk (broadcasts, manual reminders) show the
  units needed and the balance before sending, and refuse to start if the balance can't
  cover them.

### KodiHub admin

- Platform settings: KodiHub's provider (TextSMS Kenya or Africa's Talking), credentials,
  sender ID, price per unit, bundles, minimum custom bundle.
- Each organisation: SMS mode, provider and sender ID, test SMS, unit price override,
  balance, add/remove units, usage and top-ups.
- A platform view of SMS sold and used (units, KES) per organisation per month.

### Mobile app

Owners can see the balance and buy units from the mobile app's settings. *(Call: keeps the
two apps level; can follow the web in a second step.)*

## 7. Records

Every SMS, platform or organisation, is recorded with: organisation (null for platform
messages without one), kind (platform / organisation), message type, recipient, units,
route used (KodiHub / own provider / KodiHub fallback), provider, provider message id,
status and reason. This replaces nothing in the existing `Message` table (reminders and
broadcasts keep using it); it is the ledger units are reconciled against.

Units move only through a ledger of entries (purchase, admin adjustment, message charge,
refund of a failed send) whose sum is the balance.

## 8. Non-goals

- Delivery reports, inbound SMS / replies.
- Email or WhatsApp billing.
- Organisations entering their own provider credentials themselves.
- Postpaid SMS (billing SMS on the monthly invoice).
- Changing who receives which message, or message wording.

## 9. Left to the builder

Table and column names, how the per-message routing is wired into
`NotificationsService.dispatchSms`, how GSM-7 detection is implemented, job/queue use for
warnings, exact page layouts (follow the existing settings and Payment channels pages), and
the migration that puts every existing organisation on Platform SMS with an opening balance
(see open questions).

## 10. Calls I made (owner to confirm)

1. Owner-portal access and payout-changed alerts are platform messages; tenant welcome /
   portal access is an organisation message.
2. Units are per SMS part (160 / 153 GSM-7, 70 / 67 otherwise), matching how providers charge.
3. Own-SMS fallback to KodiHub is opt-in by the owner and only spends units they bought.
4. Low-balance default 50 units; warnings at most once a day per kind.
5. New permissions `sms:view` and `sms:manage`, given to owners by default.
6. Mobile shows balance and buying, possibly after the web.
7. Messages not sent for lack of units are not retried automatically when units arrive
   (reminders go out again on their next run anyway); the usage list shows them.

8. **Opening balance**: a platform setting "free SMS units for new organisations"
   (default 100). On launch every existing organisation gets that many units too, as an
   admin-adjustment ledger entry with reason "Opening balance", so nobody's reminders stop
   on day one.
9. **Guest booking codes never block bookings**: when a host on Platform SMS is out of units,
   the guest's booking code (GUEST_BOOKING) is still sent through KodiHub at KodiHub's cost
   (recorded as "sent by KodiHub, no units"), and the host gets the out-of-units warning.
   The balance never goes below zero.

Status: approved by the owner on 2026-11-08; calls 8 and 9 made on the owner's behalf
(no answer given), easy to change.

## 11. Open questions

- **Unit price and bundles** to configure at launch (admin can set and change these later).
