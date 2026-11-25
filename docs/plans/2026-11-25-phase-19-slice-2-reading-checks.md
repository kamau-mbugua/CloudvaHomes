# Phase 19, slice 2 — Unusual-use warning and OCR fields on meter readings

One slice only. Parent brief: `docs/plans/2026-11-25-phase-19-caretaker-app.md` (Slice 2).
Spec: `docs/specs/2026-11-24-roadmap-features-design.md` §6 ("Meter reading with OCR": checks).
Claude reviews the result against this file.

## Rules for this run

1. **Never `git commit` or `git push`.** Leave changes in the working tree.
2. **Build only what is listed under "What to build".** No other features, endpoints, screens or
   refactors. Ideas go in the Progress note at the bottom.
3. **Before writing code**, reply with the list of files you will change and the migration you
   will add. Stop if it doesn't match this brief.
4. Every test under "Tests that must exist" is required, including the failure cases.
5. Finish by filling in the **Progress** section at the bottom of this file (built, not built,
   anything done differently and why, each check run and its result).
6. Don't touch `hodi_app/`. Customer-facing text says KodiHQ.

## Why

A caretaker can mistype a reading (an extra digit, a misread dial). Today the only check is
"not below the previous reading". A reading far above the meter's usual use gets billed to the
tenant. We ask for confirmation before saving such a reading. We also add two fields so that
OCR (slice 4) can later record whether the number came from the photo and whether the
caretaker changed it. **This slice does not add OCR itself.**

## What exists (read these first)

- Server reading sheet and save: `backend/src/modules/billing/meters/meters.service.ts`
  (`sheet()` and `save()`), DTOs in `meters.dto.ts` (`ReadingDto`, `SaveReadingsDto`,
  `ReadingSheetQueryDto`), quantity helpers `toMilli` / `fromMilli` in
  `backend/src/modules/billing/billing-math.ts`. A reading's use is `current - previous`.
  One reading per meter and month (`@@unique([meterId, period])`).
- App reading screen: `mobile/lib/features/staff/more/meters_screen.dart`
  (`ReadingScreen._save`, `_saveOffline`, `normaliseQuantity`, `milli`). Sheet row model
  `SheetRow` in `mobile/lib/features/staff/staff_models.dart`. API call
  `StaffApi.saveReading` in `mobile/lib/features/staff/staff_api.dart`.
- App offline queue: `mobile/lib/features/staff/more/reading_queue.dart` (`PendingReading`,
  `ReadingQueue.flush`) and `flushPendingReadings` in `meters_screen.dart`.
- Web reading sheet: `frontend/src/features/billing/MeterReadingsPage.tsx`, helpers in
  `frontend/src/features/billing/rules.ts`, quantity helpers in `frontend/src/lib/quantity.ts`.
- Existing tests: `backend/test/billing.e2e-spec.ts` (meter readings and the sheet), `mobile/test/staff/offline_reading_test.dart`,
  `mobile/test/staff/reading_queue_test.dart`, `frontend/src/features/billing/billing.test.ts`.

## What to build

### A. Server

1. **Migration** `backend/prisma/migrations/20261126090000_reading_ocr_fields/migration.sql`
   (hand-written) and `schema.prisma`: on `MeterReading` add
   `ocrUsed Boolean @default(false)` and `ocrEdited Boolean @default(false)`.
2. **Save** (`ReadingDto`): accept optional `ocrUsed` and `ocrEdited` booleans
   (`@IsOptional() @IsBoolean()`). Store `ocrUsed ?? false` and `ocrEdited ?? false` on every
   save, including corrections: a reading corrected by hand without the flags is no longer an
   OCR reading. Requests without the fields keep working exactly as today.
3. **Average use**: a pure function `averageUse(readings)` in a new file
   `backend/src/modules/billing/meters/meter-math.ts`, with a unit spec next to it:
   - input: the meter's readings **before** the sheet's period (newest first), each with
     `previous` and `current`;
   - uses at most the 6 newest; returns `null` if fewer than 2;
   - returns the mean of `current - previous` as a quantity string (same format as the other
     quantities, via `fromMilli`), rounded down to whole milli-units.
4. **Sheet** (`GET /meter-readings/sheet`): each row gains `averageUse: string | null` from
   that function. Change the readings query in `sheet()` to load enough history (the current
   period plus up to 6 earlier). Each existing `reading` object also gains `ocrUsed` and
   `ocrEdited`.
5. **The server does not block or warn.** The check is a client-side confirmation; the server
   keeps only its existing "not below the previous reading" rule.

### B. App

1. **Pure check** in a new file `mobile/lib/features/staff/more/reading_checks.dart`:
   `bool isUnusualUse({required String previous, required String current, String? averageUse})`
   — true only when `averageUse` is a number above 0 and `current - previous > 3 × averageUse`.
   Use the existing milli-unit approach (no floating point).
2. **`SheetRow`** gains `averageUse` (nullable; missing in JSON → null).
3. **`ReadingScreen._save`**: after the existing validation and before any upload or save, if
   the sheet row is loaded and `isUnusualUse` is true, show a dialog:
   - title "Check this reading";
   - body "This is X <unit>, more than 3 times the usual use (about Y <unit>). Check the meter
     before saving."
   - buttons **Cancel** (nothing is saved, the screen stays open with the number) and
     **Save anyway** (continues the normal save, including the offline path).
   The previous reading used is the same one the existing check uses (`row.suggestedPrevious`
   for a new reading, `row.reading.previous` when correcting).
4. **OCR flags pass-through** (always false in this slice; slice 4 sets them):
   - `StaffApi.saveReading` gains optional `ocrUsed` / `ocrEdited`, sent only when true;
   - `PendingReading` gains `ocrUsed` / `ocrEdited` (default false), saved in its JSON, and an
     old queue file without them must still load;
   - `flushPendingReadings` passes them to `saveReading`.

### C. Web

1. **Pure check** `isUnusualUse(previous, current, averageUse)` in
   `frontend/src/features/billing/rules.ts`, same rule as the app, using `parseQuantity`.
2. **`MeterReadingsPage`**: rows where the typed reading is unusual show a small warning next to
   the use ("More than 3× usual (about Y)"). When saving, if any row is unusual, ask once with
   `ConfirmDialog` from `frontend/src/components/ConfirmDelete.tsx`: "N readings are more than 3 times the usual use.
   Save anyway?" Cancel saves nothing.
3. Add `averageUse` to the sheet row type in `frontend/src/features/billing/types.ts`.

## Tests that must exist

Backend (unit, `meter-math.spec.ts`):
- fewer than 2 earlier readings → `null`;
- 7 earlier readings → only the newest 6 are averaged;
- a reading with `previous` set by hand (meter swap) is averaged on its own `current - previous`.

Backend (e2e, in `backend/test/billing.e2e-spec.ts`):
- the sheet's `averageUse` ignores the current period's own reading;
- saving with `ocrUsed: true, ocrEdited: true` stores both and the sheet returns them;
- correcting that reading without the fields sets both back to false;
- a save without the fields still works (old app versions).

App:
- `isUnusualUse`: above 3× → true; exactly 3× → false; `averageUse` null or "0" → false;
- widget test: an unusual reading shows the dialog; **Cancel sends no `PUT /meter-readings`**
  and keeps the typed number; **Save anyway** sends exactly one PUT;
- widget test: no connection + Save anyway → the reading lands in the offline queue;
- queue test: an old JSON entry without `ocrUsed` / `ocrEdited` loads with both false, and
  `flush` sends them when true.

Web:
- `isUnusualUse` unit tests (same cases as the app), in `billing.test.ts`.

## Out of scope

- OCR, ML Kit, or any camera change (slice 4).
- Changing the server's "below previous reading" refusal.
- Offline caching of the meter list (separate slice).
- Any change to invoices, billing or the meter CSV import.

## Checks before handing back

```bash
cd backend  && npx prisma generate && npx prettier --check "src/**/*.ts" "test/**/*.ts" && npx tsc --noEmit && npm run lint && npm run test && npm run test:e2e
cd frontend && npx tsc -b && npm run lint && npm run test
cd mobile   && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test
```

## Progress

- Files changed:
  - `backend/prisma/migrations/20261126090000_reading_ocr_fields/migration.sql` *(new)*
  - `backend/prisma/schema.prisma` (and regenerated `backend/src/generated/prisma/*`)
  - `backend/src/modules/billing/meters/meters.dto.ts`
  - `backend/src/modules/billing/meters/meter-math.ts` *(new)*
  - `backend/src/modules/billing/meters/meter-math.spec.ts` *(new)*
  - `backend/src/modules/billing/meters/meters.service.ts`
  - `backend/test/billing.e2e-spec.ts`
  - `mobile/lib/features/staff/more/reading_checks.dart` *(new)*
  - `mobile/lib/features/staff/more/meters_screen.dart`
  - `mobile/lib/features/staff/more/reading_queue.dart`
  - `mobile/lib/features/staff/staff_api.dart`
  - `mobile/lib/features/staff/staff_models.dart`
  - `mobile/test/staff/reading_checks_test.dart` *(new)*
  - `mobile/test/staff/reading_queue_test.dart`
  - `frontend/src/features/billing/types.ts`
  - `frontend/src/features/billing/rules.ts`
  - `frontend/src/features/billing/MeterReadingsPage.tsx`
  - `frontend/src/features/billing/billing.test.ts`
- Built:
  - Added `ocrUsed` and `ocrEdited` (`Boolean @default(false)`) to `MeterReading` via migration `20261126090000_reading_ocr_fields`, accepted both optionally on `PUT /api/v1/meter-readings`, persisted `ocrUsed ?? false` and `ocrEdited ?? false` on every create/correction, and returned both on `GET /api/v1/meter-readings/sheet`.
  - Added `averageUse(readings)` in `meter-math.ts` (mean `current - previous` of up to 6 newest prior readings rounded down to whole milli-units, or `null` when fewer than 2) and exposed `averageUse` per row on `GET /api/v1/meter-readings/sheet` (loading up to 7 readings `<= period` so the current period's reading is always excluded).
  - Added `isUnusualUse` in `mobile/lib/features/staff/more/reading_checks.dart` (`averageUse > 0` and `current - previous > 3 × averageUse` in integer milli-units), `SheetRow.averageUse`, the confirmation dialog ("Check this reading" / Cancel / Save anyway) in `ReadingScreen._save` before upload/save (using `row.reading.previous` when correcting and `row.suggestedPrevious` for a new reading, covering both online and offline queue paths), and `ocrUsed`/`ocrEdited` pass-through in `PendingReading`, `StaffApi.saveReading`, and `flushPendingReadings`.
  - Added `isUnusualUse` in `frontend/src/features/billing/rules.ts`, inline per-row warning (`More than 3× usual (about Y)`) next to Used on `MeterReadingsPage.tsx`, and a `ConfirmDialog` confirmation before saving when any changed row is unusual.
  - Added all required unit, widget (including correcting an existing reading), queue backward-compatibility, and e2e tests.
- Not built / done differently (and why):
  - None. In `ReadingScreen._save`, the client-side below-previous check was also aligned to use `row.reading?.previous ?? row.suggestedPrevious` when correcting so it matches both the server's rule and the unusual-use check's `previous` value (e.g. after a meter swap).
- Checks run and results:
  - `cd backend && npx prisma generate && npx prettier --check "src/**/*.ts" "test/**/*.ts" && npx tsc --noEmit && npm run lint && npm run test` — **passed** (0 lint/type/format issues; 61 unit test files, 313 tests passed).
  - `cd backend && npm run test:e2e` — **passed** (migrations applied cleanly; 41 e2e test files, 290 tests passed).
  - `cd frontend && npx tsc -b && npm run lint && npm run test` — **passed** (0 lint/type issues; 65 test files, 733 tests passed).
  - `cd mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test` — **passed** (0 format/analyzer issues; 259 tests passed).
