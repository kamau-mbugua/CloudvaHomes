# Phase 19, slice 4 — Suggest the meter reading from the photo (on-device OCR)

One slice only. Parent brief: `docs/plans/2026-11-25-phase-19-caretaker-app.md` (Slice 4).
Spec: `docs/specs/2026-11-24-roadmap-features-design.md` §6 ("Meter reading with OCR").
Claude reviews the result against this file.

## Rules for this run

1. **Never `git commit` or `git push`.** Leave changes in the working tree.
2. **Build only what is listed under "What to build".** No other features, screens or
   refactors. Ideas go in the Progress note at the bottom.
3. **Before writing code**, reply with:
   - the files you will add or change;
   - the package version you will add;
   - how you will make OCR replaceable in tests.

   Stop if it doesn't match this brief.
4. Every test under "Tests that must exist" is required, including the failure cases.
5. Finish by filling in the **Progress** section at the bottom of this file (built, not built,
   anything done differently and why, each check run and its result).
6. Don't touch `hodi_app/`. Customer-facing text says KodiHQ. **App only: no backend or web
   changes.** The server already stores `ocrUsed` / `ocrEdited` (slice 2).

## Why

Typing a 6-digit reading at a dark meter box is slow and error-prone. When the caretaker
takes the meter photo they already take, the phone reads the digits and **suggests** the
number. The caretaker still confirms it, and the existing checks still apply. Readings
record whether the suggestion was used and whether it was changed, so we can measure how
accurate it is (`ocrUsed`, `ocrEdited`, slice 2).

## What exists (read these first)

- Reading screen: `ReadingScreen` in `mobile/lib/features/staff/more/meters_screen.dart`.
  - The photo is taken through `PhotoField` → `pickPhoto(context)`
    (`mobile/lib/features/staff/more/photo.dart`). It returns a JPEG `Uint8List`, at most
    1600 px on the longest side.
  - The photo is kept in `_photo`; Remove sets it to null.
  - `_save` validates, asks "Check this reading" when use is unusual, then saves online or,
    with no connection, through `_saveOffline` into `ReadingQueue`.
- Quantity helpers: `normaliseQuantity`, `milli`, `trimQuantity`, `formatMilli` in
  `mobile/lib/features/staff/more/reading_checks.dart`.
- OCR flags are already carried end to end:
  - `StaffApi.saveReading(ocrUsed:, ocrEdited:)` sends them only when true;
  - `PendingReading.ocrUsed` / `ocrEdited` hold them in the queue;
  - `flushPendingReadings` passes them on.
  - Today nothing sets them, so they are always false.
- Sheet row for the meter: `SheetRow` (`suggestedPrevious`, `reading?.previous`) from
  `readingSheetProvider` (`mobile/lib/features/staff/more/meters_data.dart`). It can be
  missing (offline with no cache). `Meter.serialNo` is on `widget.meter`.
- Platforms:
  - Android `minSdk = max(flutter, 23)`; iOS deployment target 15.0 (`ios/Podfile`).
  - Flavors: `lib/main_dev.dart`, `lib/main_prod.dart`.
- Tests to model on: `mobile/test/staff/reading_checks_test.dart`,
  `mobile/test/staff/offline_meters_test.dart`, `mobile/test/staff/helpers.dart`.

## What to build

### 1. Package

- Add `google_mlkit_text_recognition`, Latin script only, on-device.
- Use the newest version that resolves **without upgrading any other package in
  `pubspec.lock`**. A dry run resolves `0.16.0` today, while `1.0.3` exists. Report the
  version and, if it isn't the newest, what blocks it. **Don't upgrade other dependencies
  to unblock it.**
- If iOS needs a higher deployment target or Podfile change to build, make only the minimum
  change and report it.
- No other new packages.

### 2. Pure digit picking — `mobile/lib/features/staff/more/meter_ocr.dart` (new)

`String? suggestReading(String text, {String? previous, String? serialNo})` returns a
quantity string that `normaliseQuantity` accepts, or `null`.

**Building the candidates**, line by line:
- Inside a token that contains at least one digit, read `O`/`o` as `0` and `I`/`l`/`|` as
  `1`.
- A candidate is a run of digits with at most one decimal point (`.` or `,` → `.`).
- **Not** a candidate when:
  - a letter touches it on either side (so `m3`, `m³` and `No5` aren't readings);
  - it has more than 9 digits before the point (barcodes);
  - it has more than 3 decimals.
- A line made only of digits and spaces is **also** a candidate with its spaces removed:
  dial digits are often read as `0 1 2 3 4`.
- Drop any candidate whose digits equal the meter's serial number digits, when `serialNo`
  has 4 or more digits.
- Strip leading zeros, but keep one before a decimal point: `01234.5` → `1234.5`,
  `000.5` → `0.5`.

**Choosing one:**
- With `previous`: keep only candidates `>= previous`, compared in milli-units, and pick
  the one closest to `previous`. On a tie, pick the one with more digits. If none is
  `>= previous`, return `null`: suggesting a number the screen will refuse is worse than
  none.
- Without `previous`: pick the candidate with the most digits; on a tie, the first one.

Readings with no printed decimal point are taken as whole numbers. The caretaker corrects
them, and `ocrEdited` measures how often.

### 3. A replaceable reader — same file

- `abstract class MeterOcr { Future<String?> readText(Uint8List jpeg); }`. It returns the
  recognised text, or `null` on any failure. **It never throws.**
- `MlKitMeterOcr`, used on Android and iOS only:
  - writes the JPEG to a temp file;
  - runs `TextRecognizer(script: TextRecognitionScript.latin)` with
    `InputImage.fromFilePath`;
  - deletes the temp file in `finally`;
  - closes the recogniser when the provider is disposed.
- `NoMeterOcr` returns `null`. Use it on every other platform, and in all tests by default.
- `meterOcrProvider`: `Platform.isAndroid || Platform.isIOS` → `MlKitMeterOcr`, otherwise
  `NoMeterOcr`. Tests override it with a fake.
- Taking the photo must be replaceable in tests too. Add `meterPhotoPickerProvider` (a
  `Provider` returning `Future<Uint8List?> Function(BuildContext)`, default `pickPhoto`),
  used **only** by `ReadingScreen`. Don't change `photo.dart` or `PhotoField`.

### 4. Reading screen

**After a photo is picked:**
- Run `readText` and then `suggestReading`, using the same previous value `_save` uses
  (`row.reading?.previous ?? row.suggestedPrevious`, or none when the row isn't loaded)
  and `widget.meter.serialNo`.
- Show a small "Reading the photo…" line while it runs. Give up after **5 seconds** and
  show nothing.
- If there's a suggestion, show a row under the photo (`Key('ocr-suggestion')`):
  **"Suggested from photo: 1234.5 m³"** with buttons **Use** and **Ignore**.
  - **Use** puts the number in the reading field, replacing whatever is there, and
    remembers it as the used suggestion.
  - **Ignore** hides the row.
- No suggestion, or a failure: show nothing; the caretaker types as today.

**When the photo changes:**
- Taking another photo or removing the photo clears the suggestion and the used
  suggestion.
- A result that comes back after the photo changed, or after the screen closed, is
  dropped.

**On save** (online and offline):
- `ocrUsed` = a suggestion was used for the current photo.
- `ocrEdited` = `ocrUsed` and the normalised number being saved differs from the used
  suggestion.
- Typing the same number by hand without tapping Use is **not** OCR (both false).
- Pass both to `saveReading`, and to the `PendingReading` in `_saveOffline`.
- The existing checks (below previous, unusual use) run exactly as today on whatever number
  is in the field.
- Saving while OCR is still running is allowed. It saves with both flags false.

**Privacy:** the photo and the text never leave the phone for OCR. Don't log the
recognised text.

## Tests that must exist

Unit (`mobile/test/staff/meter_ocr_test.dart`), `suggestReading` with these inputs at least:
- `"01234.5"` with previous `"1200"` → `"1234.5"`;
- `"0 1 2 3 4"` → `"1234"`;
- `"O1234"` → `"1234"`;
- `"m3 1234"` → `"1234"`, and `"m3"` alone → `null`;
- the serial number present, `"SN 20190815\n1234"`, with `serialNo: "20190815"` → `"1234"`;
- two candidates above previous → the closer one;
- only candidates below previous → `null`;
- `"1234,5"` → `"1234.5"`;
- a 10-digit run → ignored;
- empty text → `null`;
- `"000.5"` → `"0.5"`.

Widget (`mobile/test/staff/meter_ocr_screen_test.dart`), with `meterOcrProvider` and
`meterPhotoPickerProvider` overridden:
- a photo with readable digits shows "Suggested from photo"; **Use** fills the field; Save
  sends `ocrUsed: true` and no `ocrEdited`;
- Use, then change the number, then Save → `ocrUsed: true, ocrEdited: true`;
- **Ignore** hides it; typing and saving sends neither flag;
- OCR returns `null` or throws inside the fake → no row, saving works, no flags;
- slow OCR (longer than 5 s, with fake time) → no row;
- a slow result arriving after the photo was removed → no row;
- no connection after Use → the queued `PendingReading` has `ocrUsed == true`;
- a suggestion that makes the use unusual still shows "Check this reading" on Save.

## Out of scope

- Live camera preview, cropping, or reading from the camera stream.
- Cloud OCR, or sending the photo anywhere new.
- Any backend or web change; showing OCR accuracy anywhere.
- Inspections, units, pushes (slice 5).

## Checks before handing back

```bash
cd mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze --fatal-infos && flutter test
cd mobile && flutter build appbundle --release --flavor prod -t lib/main_prod.dart
cd mobile && flutter build ios --release --no-codesign --flavor prod -t lib/main_prod.dart
```

Report the size of the release `.aab` before and after the change. If a build can't run on
this machine (signing, Xcode), say which one and why. Don't change signing or CI files.

## Progress

### Built
- **Package & platform configuration**
  - `mobile/pubspec.yaml` & `mobile/pubspec.lock`: Added `google_mlkit_text_recognition: ^0.16.0`, resolving `google_mlkit_text_recognition: 0.16.0` and `google_mlkit_commons: 0.12.0` with **no upgrades** to any existing locked dependency. Versions `0.17.0` through `1.0.3` require `sdk: '^3.12.0'` and `flutter: '>=3.44.0'` (via `google_mlkit_commons >=0.13.0`), whereas local/CI Flutter is pinned to `3.41.1` / Dart `3.11.0`.
  - `mobile/ios/Podfile`, `mobile/ios/Podfile.lock` & `mobile/ios/Runner.xcodeproj/project.pbxproj`: Raised the iOS deployment target from `15.0` to `15.5` (the minimum required by `GoogleMLKit/TextRecognition ~> 9.0.0` and `MLKitVision ~> 10.0.0` in `0.16.0`).
  - `mobile/android/app/proguard-rules.pro` *(new)* & `mobile/android/app/build.gradle.kts`: Added `-dontwarn` rules for the four `compileOnly` non-Latin script packages (`chinese`, `devanagari`, `japanese`, `korean`) after `:app:minifyProdReleaseWithR8` failed without them (exact R8 error below).
- **Pure digit picking & replaceable OCR/photo providers** — `mobile/lib/features/staff/more/meter_ocr.dart` *(new)*:
  - `suggestReading(text, {previous, serialNo})`: normalises `O`/`o` → `0` and `I`/`l`/`|` → `1` inside tokens containing at least one digit, converts `,` → `.`, rejects candidates touching letters (including `m3`, `m³`, `No5`), > 9 whole digits, or > 3 decimals, supports spaced dial lines (`"0 1 2 3 4"` → `"1234"`), filters out candidates matching 4+ digit meter serial numbers, strips leading zeros while preserving `"0.x"`, and picks the closest candidate `>= previous` in milli-units (tie-breaking on raw digit count) or the longest candidate when `previous` is absent.
  - `MeterOcr`, `MlKitMeterOcr` (Latin-only on-device `TextRecognizer`, writes temp JPEG and deletes in `finally`, closes recogniser on provider disposal), `NoMeterOcr`, `meterOcrProvider`, and `meterPhotoPickerProvider` (default `pickPhoto`, leaving `photo.dart` and `PhotoField` untouched).
- **Reading screen OCR flow** — `mobile/lib/features/staff/more/meters_screen.dart`:
  - Picks photos through `meterPhotoPickerProvider`, runs `MeterOcr.readText` inside a screen-level `try/catch` (catching both synchronous throws and async rejections) with a 5-second timeout, shows `"Reading the photo…"` while running, and renders `Key('ocr-suggestion')` (`"Suggested from photo: <value> <unit>"` with **Use** and **Ignore** buttons).
  - Drops stale results when the photo is removed/replaced or the screen unmounts (`_ocrRunId` + `identical(_photo, photoBytes)`), clears suggestion and used-suggestion state whenever the photo changes or is removed, and passes `ocrUsed` and `ocrEdited` to both `StaffApi.saveReading` and `PendingReading` in `_saveOffline` while preserving all existing validation and unusual-use checks. Never logs recognised text.
- **Unit & widget tests**
  - `mobile/test/staff/meter_ocr_test.dart` *(new)*: 11 unit tests covering every required `suggestReading` case and edge cases.
  - `mobile/test/staff/meter_ocr_screen_test.dart` *(new)*: 8 widget tests covering readable suggestion + **Use** + Save (`ocrUsed: true`, no `ocrEdited`), **Use** + edit + Save (`ocrUsed: true, ocrEdited: true`), **Ignore** + manual entry (neither flag), `null` return and sync/async throws from `readText` caught by `ReadingScreen`, > 5 s timeout, stale results after photo removal and photo replacement, offline queue persistence (`PendingReading.ocrUsed == true`), and unusual-use confirmation (`"Check this reading"`) on suggested values.

### Not built
- Live camera stream OCR, cropping, cloud OCR, or any backend/web/analytics UI changes (out of scope per brief).

### Done differently & notes
1. **Screen-level error handling:** `ReadingScreen._runOcr` wraps `Future<String?>.sync(() => ocr.readText(photoBytes)).timeout(const Duration(seconds: 5))` in `try { ... } on Object` so even a `MeterOcr` implementation that throws synchronously or rejects asynchronously is caught by the screen itself, verified by widget test.
2. **Android R8 ProGuard rule:** First ran `flutter build appbundle --release --flavor prod -t lib/main_prod.dart` without any ProGuard changes. It failed in `:app:minifyProdReleaseWithR8` with:
   ```text
   ERROR: Missing classes detected while running R8. Please add the missing classes or apply additional keep rules that are generated in mobile/build/app/outputs/mapping/prodRelease/missing_rules.txt.
   ERROR: R8: Missing class com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions$Builder (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions$Builder (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions$Builder (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions$Builder (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   Missing class com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions (referenced from: com.google.mlkit.vision.text.TextRecognizer com.google_mlkit_text_recognition.TextRecognizer.initialize(io.flutter.plugin.common.MethodCall))
   ```
   Added targeted `-dontwarn` rules for `chinese`, `devanagari`, `japanese`, and `korean` in `mobile/android/app/proguard-rules.pro` and wired `proguardFiles(...)` in `mobile/android/app/build.gradle.kts` (`release` buildType).
3. **iOS flavor flag:** `Runner.xcodeproj` only defines standard `Debug`, `Release`, and `Profile` Xcode build configurations (no `Release-prod` Xcode scheme/configuration; Android defines `dev`/`prod` Gradle `productFlavors`, while Dart environment selection uses `-t lib/main_prod.dart`). Per the brief's rule not to alter Xcode signing/scheme setup, we left Xcode schemes untouched and verified the full CocoaPods + Xcode release device build via `flutter build ios --release --no-codesign -t lib/main_prod.dart`.

### Release `.aab` size (`build/app/outputs/bundle/prodRelease/app-prod-release.aab`)
- **Before Slice 4:** `49,196,977` bytes (`49.2 MB` reported by Flutter CLI / `47M` `ls -lh`)
- **After Slice 4:** `63,342,351` bytes (`63.3 MB` reported by Flutter CLI / `60M` `ls -lh`) — `+14,145,374` bytes (`+14.1 MB`, bundled on-device Latin ML Kit text recognition model & native libraries across ABIs; Google Play serves single-ABI splits to devices)

### Checks run
- `cd mobile && dart format --output=none --set-exit-if-changed lib test` — **passed** (`0 changed`)
- `cd mobile && flutter analyze --fatal-infos` — **passed** (`No issues found!`)
- `cd mobile && flutter test` — **passed** (`294` tests passed, `0` failed)
- `cd mobile && flutter build appbundle --release --flavor prod -t lib/main_prod.dart` — **passed** (`app-prod-release.aab`, `63.3MB` / `63,342,351` bytes)
- `cd mobile && flutter build ios --release --no-codesign --flavor prod -t lib/main_prod.dart` — **exited 1** (`Runner.xcodeproj` has `Debug`/`Release`/`Profile` configurations only, no `Release-prod` configuration)
- `cd mobile && flutter build ios --release --no-codesign -t lib/main_prod.dart` — **passed** (`pod install` + Xcode archive build succeeded: `build/ios/iphoneos/Runner.app`, `79.2MB`)

### Fixed after review (Claude)
- `ocrEdited` compares numbers, not text: "1234.50" retyped from a "1234.5" suggestion is not
  an edit (new widget test).
- `meterOcrProvider` decides by platform only; the check on the test binding's name was
  removed (`flutter test` runs as the host OS, so it gets `NoMeterOcr` anyway).
- The R8 error above had a full local path; shortened to `mobile/build/...`.
- Checks after the fixes: format clean, analyze clean, 295 app tests pass.
