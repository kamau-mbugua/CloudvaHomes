markdown
# hodi_app

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Setup

### Prerequisites

- Flutter SDK: [Install Flutter](https://flutter.dev/docs/get-started/install)
- Dart SDK: Included with Flutter
- Android Studio: [Install Android Studio](https://developer.android.com/studio)
- FVM: [Install FVM](https://fvm.app/docs/getting_started/installation)
- Xcode (for iOS development): [Install Xcode](https://developer.apple.com/xcode/)

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/your-username/hodi_app.git
   cd hodi_app
   ```

2. Install dependencies:
   ```sh
   flutter pub get
   ```

3. Generate flavors:
   ```sh
   dart run flutter_flavorizr
   ```

## Building the App

### Android

To build the app for different flavors on Android, use the following commands:

- **Development:**
  ```sh
  flutter build apk --flavor dev -t lib/main_dev.dart
  ```

- **UAT:**
  ```sh
  flutter build apk --flavor uat -t lib/main_uat.dart
  ```

- **Production:**
  ```sh
  flutter build apk --flavor prod -t lib/main_prod.dart
  ```
- **General, Low APK SIZE:**
  ```sh
    flutter build {buildType:apk,appbundle} --flavor {flavor} -t lib/main_{flavor}.dart --target-platform android-arm64,android-x64
    ```

### iOS

To build the app for different flavors on iOS, use the following commands:

- **Development:**
  ```sh
  flutter build ios --flavor dev -t lib/main_dev.dart
  ```

- **UAT:**
  ```sh
  flutter build ios --flavor uat -t lib/main_uat.dart
  ```

- **Production:**
  ```sh
  flutter build ios --flavor prod -t lib/main_prod.dart
  ```

## Adding a New Flavor

To add a new flavor, follow these steps:

1. Update the `pubspec.yaml` file:
   ```yaml
   flavorizr:
     flavors:
       newflavor:
         app:
           name: Hodi NewFlavor
           description: "Hodi App NewFlavor"
           version: 1.0.0
           buildNumber: 1
         flavorType: newflavor
         name: NewFlavor
         color: Colors.purple
         flavorBuildType: debug
         flavorProperties:
           baseUrl: "https://hodi-newflavor.qnex.io/api/"
         android:
           applicationId: "com.qnex.hodi.newflavor"
           applicationIdSuffix: ".newflavor"
   ```

2. Run `flutter_flavorizr` to generate the new flavor configuration:
   ```sh
   dart run flutter_flavorizr
   ```

3. Create a new entry point for the new flavor in `lib/main_newflavor.dart`:
   ```dart
   import 'flavors.dart';
   import 'main.dart' as runner;

   Future<void> main() async {
     F.appFlavor = Flavor.newflavor;
     await runner.main();
   }
   ```

4. Build the app for the new flavor:

    - **Android:**
      ```sh
      flutter build apk --flavor newflavor -t lib/main_newflavor.dart
      ```

    - **iOS:**
      ```sh
      flutter build ios --flavor newflavor -t lib/main_newflavor.dart
      ```

## Running the App

To run the app for different flavors, use the following commands:

- **Development:**
  ```sh
  flutter run --flavor dev -t lib/main_dev.dart
  ```

- **UAT:**
  ```sh
  flutter run --flavor uat -t lib/main_uat.dart
  ```

- **Production:**
  ```sh
  flutter run --flavor prod -t lib/main_prod.dart
  ```

- **New Flavor:**
  ```sh
  flutter run --flavor newflavor -t lib/main_newflavor.dart
  ```

To build an Android App Bundle (AAB) and an iOS store app, follow these steps:

### Android

To build an Android App Bundle for different flavors, use the following commands:

- **Development:**
  ```sh
  flutter build appbundle --flavor dev -t lib/main_dev.dart
  ```

- **UAT:**
  ```sh
  flutter build appbundle --flavor uat -t lib/main_uat.dart
  ```

- **Production:**
  ```sh
  flutter build appbundle --flavor prod -t lib/main_prod.dart
  ```

### iOS

To build the app for the App Store, use the following commands:

- **Development:**
  ```sh
  flutter build ios --flavor dev -t lib/main_dev.dart --release
  ```

- **UAT:**
  ```sh
  flutter build ios --flavor uat -t lib/main_uat.dart --release
  ```

- **Production:**
  ```sh
  flutter build ios --flavor prod -t lib/main_prod.dart --release
  ```

These commands will generate the necessary build files for both Android and iOS store distributions.