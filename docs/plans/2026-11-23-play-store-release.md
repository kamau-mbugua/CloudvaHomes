# KodiHQ Android: Play Store release

The checklist for the first Play Store release of the KodiHQ app (`co.ke.kodihub`, a new
listing; the legacy Hodi app `com.qnex.hodi` is not updated in place). **Done** items are in the
code; **Owner** items need the Play Console, keys or a decision and can't be done from the repo.

## Done in code (2026-11-23)

| Area | What |
|------|------|
| Account deletion (Play policy) | In the app: Account → **Delete account**. On the web: My account → Delete account, the tenant profile, and the public page **`https://app.kodihq.co.ke/delete-account`** (for the listing's deletion link; signed out it explains the steps and links to sign in). `POST /api/v1/me/delete` with a step-up code. Soft delete: see below. |
| Terms and privacy | The app and web link Cloudva's [terms](https://www.cloudvalabs.com/terms) and [privacy policy](https://www.cloudvalabs.com/privacy): sign-in page, registration ("By creating an account you agree…"), account sheet, delete screen. Data requests go to `privacy@cloudvalabs.com`, as the policy says. |
| Permissions | The release manifest asks only for: internet, network state, notifications, wake lock, push (C2DM) and a receiver permission of its own. The media/storage permissions `open_filex` adds are removed (`tools:node="remove"`): photos come through the system photo picker, PDFs open from app storage. Play rejects photo/video access without a core need. |
| Target SDK | 36 (Flutter default); min SDK 24. |
| Icon | Adaptive launcher icon (navy background, the mark as a vector, monochrome for Android 13 themed icons) in `android/app/src/main/res/mipmap-anydpi-v26/`. The PNG icons stay for older Android. |
| Store graphics | `mobile/store/play/icon-512.png` (from the 1024 iOS master) and `feature-graphic-1024x500.png`. |
| Security | No cleartext traffic in release, `allowBackup=false`, tokens in Keystore-backed secure storage, no keystore in the repo. |
| Build | `flutter build appbundle --release --flavor prod -t lib/main_prod.dart` → `build/app/outputs/bundle/prodRelease/app-prod-release.aab` (48.8 MB). Without `key.properties` it is **debug-signed and Play refuses it**. |

### What deleting an account does

The user row stays (payments, receipts and the audit log name who did what, and organisations must
keep those records) but:

- it's marked `deletedAt`, status DISABLED; every session ends at once; push tokens are dropped;
- email, phone and password are cleared, so nobody can sign in as them and the same email/phone
  can open a new account later (kept aside in `deletedEmail` / `deletedPhone`, see the open item
  on purging);
- staff memberships end; tenant and landlord records stop pointing at the login (the records stay
  the organisation's; a tenant who signs in again later gets a new login linked to the same record);
- refused for the **only owner** of an open organisation (hand over first) and for KodiHQ
  platform operators (closed by another super admin).

## Owner: before the first upload

1. **Deploy the backend first** (migration `20261123150000_user_soft_delete`, the new endpoint) and
   the web app (`/delete-account`). The app's delete button calls the API, and Play reviewers
   open the deletion link.
2. **Upload key.** Create it once, keep it out of the repo and back it up (password manager +
   offline copy). Losing it means asking Google to reset the upload key.

   ```bash
   keytool -genkeypair -v -keystore ~/keys/kodihq-upload.jks -keyalg RSA -keysize 4096 \
     -validity 10000 -alias upload
   ```

   Then `mobile/android/key.properties` (git-ignored) as in `mobile/README.md`, or CI secrets.
   Turn on **Play App Signing** (Google holds the app signing key; you hold the upload key).
3. **Version.** `version: 1.0.0+1` in `pubspec.yaml`. Every upload needs a higher build number
   (`+2`, `+3`, …).
4. **Push notifications (optional).** The build has no `google-services.json`, so push is off and
   the app works without it. To turn it on: `flutterfire configure` for `co.ke.kodihub`, then
   rebuild. If you do, the Data safety answer for device IDs below applies.
5. **Build and check** on a real phone: install from the internal testing track, sign in each way,
   pay by M-Pesa in the sandbox, open an invoice PDF, delete a throwaway account.

## Owner: Play Console

- **Create the app:** name `KodiHQ`, default language English (UK or US), app (not game), free.
- **Testing:** start with *Internal testing*. If the developer account is a **personal** account
  created after November 2023, Google requires a *closed test with at least 12 testers for 14 days*
  before production; organisation accounts don't have that rule. Check which you have.
- **Store listing** (drafts below; have marketing look at them).
- **Screenshots:** 2–8 phone screenshots (portrait 1080×1920 or larger) still needed. Take them
  from the prod build on a demo organisation with made-up names, never real tenants. Suggested:
  sign-in page, tenant home with balance, M-Pesa payment, invoice, host Today, calendar, a
  listing.
- **App access:** the app needs a login, so give reviewers a demo account with **email and password**
  (a code-only account can't be reviewed: the code goes to our phone). Use a demo organisation
  with made-up data, not a real customer.
- **Privacy policy URL:** `https://www.cloudvalabs.com/privacy`
- **Account deletion URL:** `https://app.kodihq.co.ke/delete-account`
- **Ads:** none. **Target audience:** 18 and over (the terms require 18+). **Content rating:**
  answer the questionnaire; no violence, sexual content, gambling or user-to-user chat with
  strangers. Expect *Everyone / PEGI 3*.
- **Financial features declaration:** the app shows rent and invoices and starts M-Pesa payments
  through Safaricom's Daraja to a landlord's own paybill/till; KodiHQ doesn't hold money or lend.
  How to declare this is a judgement call: **check with Legal/Compliance** before answering.

### Store listing drafts

- **App name (≤30):** `KodiHQ`
- **Short description (≤80, this one is 75):**
  `Rent, invoices, M-Pesa payments and short stays, for landlords and tenants.`
- **Full description (≤4000):**

  > KodiHQ brings landlords, agencies, tenants, property owners and short-stay hosts into one app.
  >
  > **Tenants:** see what you owe, pay rent by M-Pesa, and get your receipt as soon as the money
  > lands. Your invoices, receipts and statement are always to hand.
  >
  > **Landlords and agencies:** record payments, follow up arrears, read meters with a photo,
  > handle maintenance requests and keep every property and unit up to date.
  >
  > **Short-stay hosts:** see who arrives and leaves today, manage bookings and guests on a
  > calendar, keep units clean and ready, and take bookings on your own site.
  >
  > **Owners:** follow statements and payouts for the properties an agency manages for you.
  >
  > Sign in with your email or phone, with a password or a one-time code. Your account details
  > come from your landlord, agency or host, so you see only what's yours.

### Data safety form (draft, from what the code does: confirm with Legal)

| Data type | Collected | Why | Optional? |
|-----------|-----------|-----|-----------|
| Name | Yes | Account, shown on records | Required |
| Email address | Yes | Sign-in, receipts and notices | Optional (phone or email) |
| Phone number | Yes | Sign-in, SMS codes, M-Pesa prompts | Optional (phone or email) |
| Purchase history / financial info (rent payments, invoices; *not* card numbers) | Yes | App functionality | Required for tenants |
| Photos | Yes, only the ones a user picks (meter readings, maintenance, listings) | App functionality | Optional |
| Device or other IDs | Only if push is turned on (FCM token) | Notifications | Optional |
| Location, contacts, audio, health, web history, ads ID | No | | |

- **Encrypted in transit:** yes (HTTPS only; cleartext is blocked in release).
- **Users can request deletion:** yes, in the app and at the deletion URL.
- **Shared with third parties:** service providers acting for us (SMS by Africa's Talking, email,
  M-Pesa by Safaricom, hosting) count as *processing*, not sharing, under Play's definitions.
  Confirm with Legal.
- **No** analytics or crash reporting SDK is in the app today.

## Open items (decisions)

1. **Purging deleted accounts.** Soft-deleted rows keep `deletedEmail` / `deletedPhone` and the
   name. The privacy policy says account data is kept "for the life of the account plus a grace
   period after closure, typically not exceeding 24 months". A scheduled job that anonymises the
   row (name to "Deleted user", clears `deletedEmail` / `deletedPhone` / `deletionReason`) after
   the grace period is not built yet. **Decide the grace period** (e.g. 30 or 90 days); the app
   only says "our privacy policy explains how long the rest is kept".
2. **Product privacy notice.** Cloudva's policy says products may publish their own notice naming
   their sub-processors. KodiHQ has none, and the policy and terms still say "KodiHub". Ask Legal
   whether KodiHQ needs its own notice (Africa's Talking, Safaricom Daraja, email provider,
   hosting region) before launch, and to update the product name on cloudvalabs.com.
3. **Restoring a mistaken deletion** is manual (support moves `deletedEmail` / `deletedPhone`
   back, sets status ACTIVE and clears `deletedAt`), if the email or phone hasn't been reused.
