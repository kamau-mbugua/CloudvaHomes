# Hodi mobile

The Flutter app for staff and tenants, on the new API (`backend/`). Plan:
`docs/plans/2026-10-28-phase-9-mobile.md`. The legacy app in `hodi_app/` is reference only.

## Run

```bash
flutter pub get

# iOS simulator against the local API (backend: npm run start:dev on :8080)
flutter run --dart-define=API_URL=http://localhost:8080/api/v1

# Android emulator: the host machine is 10.0.2.2
flutter run --dart-define=API_URL=http://10.0.2.2:8080/api/v1

# Other environments
flutter run --dart-define=FLAVOR=uat --dart-define=API_URL=https://<uat-api-host>/api/v1
flutter build appbundle --release --dart-define=FLAVOR=prod --dart-define=API_URL=https://<api-host>/api/v1
```

Locally the API runs with simulated M-Pesa (prompts succeed after about 4 s) and prints
sign-in codes to its log instead of sending SMS.

## Checks

```bash
dart format lib test
flutter analyze   # must say "No issues found!"
flutter test
```

## Live check (simulator + local API)

`integration_test/live_test.dart` drives the real app against the local API and the dev data:
- **Tenant:** code sign-in, balance, an M-Pesa payment, an invoice, payments, the statement.
- **Staff:** sign-in, a tenant, recording a payment, an M-Pesa prompt, a meter reading with a photo (the
  picker is faked).

It reads sign-in codes from the API's log, so start the API with its output going to a file.
It writes to the dev database (payments, a reading on an unread meter).

```bash
SCREENSHOT_DIR=build/screenshots flutter drive -d <simulator-id> \
  --driver=test_driver/integration_test.dart --target=integration_test/live_test.dart \
  --dart-define=API_URL=http://localhost:8080/api/v1 --dart-define=OTP_LOG=/path/to/api.log
```

Repeated runs hit the sign-in code rate limit (429). In dev only, clear it with
`delete from rate_limit_buckets`.

## Layout

- `lib/core/`: config, theme, money/dates, the API client (token refresh, error envelope),
  session (secure storage), router, shared widgets (paged list, M-Pesa prompt sheet).
- `lib/features/auth|tenant|staff|billing/`: one folder per area; each has its own API
  file with typed models and Riverpod providers.

Money is integer cents everywhere; only `core/money.dart` formats it. Money-moving POSTs
carry an Idempotency-Key and are never retried automatically.

## Release signing

There is **no keystore in this repo**. A release build signs with `android/key.properties`
(git-ignored), which CI writes from secrets:

```properties
storeFile=/path/to/upload-keystore.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

The application id stays `com.qnex.hodi` so the release can update the existing Play listing.
That requires the existing upload key or a key reset through Play Console. The legacy repo
committed its keystore, so the key should be rotated (see the plan).
