# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hodi App is a Flutter-based rental property management system that supports multiple build flavors (dev, uat, prod) with different base URLs and configurations. The app manages properties, tenants, houses, meters, invoices, payments, and expenditures.

## Development Commands

### Running the App

Run with specific flavor:
```bash
flutter run --flavor dev -t lib/main_dev.dart
flutter run --flavor uat -t lib/main_uat.dart
flutter run --flavor prod -t lib/main_prod.dart
```

### Building

**Android APK:**
```bash
flutter build apk --flavor dev -t lib/main_dev.dart
flutter build apk --flavor uat -t lib/main_uat.dart
flutter build apk --flavor prod -t lib/main_prod.dart
```

**Android App Bundle (for store):**
```bash
flutter build appbundle --flavor dev -t lib/main_dev.dart
flutter build appbundle --flavor uat -t lib/main_uat.dart
flutter build appbundle --flavor prod -t lib/main_prod.dart
```

**Optimized APK (reduced size):**
```bash
flutter build apk --flavor {flavor} -t lib/main_{flavor}.dart --target-platform android-arm64,android-x64
```

**iOS:**
```bash
flutter build ios --flavor dev -t lib/main_dev.dart --release
flutter build ios --flavor uat -t lib/main_uat.dart --release
flutter build ios --flavor prod -t lib/main_prod.dart --release
```

### Testing & Quality

```bash
# Run tests
flutter test

# Run single test
flutter test test/widget_test.dart

# Analyze code
flutter analyze

# Get dependencies
flutter pub get

# Clean build artifacts
flutter clean
```

### Flavor Management

Generate/regenerate flavors after modifying `pubspec.yaml`:
```bash
dart run flutter_flavorizr
```

## Architecture

### Core Structure

**Dependency Injection:** Uses `get_it` for service location. All dependencies are registered in `lib/di_container.dart` with lazy singletons for core services and factories for providers/view models.

**State Management:** Provider pattern is used throughout. Providers are registered in `di_container.dart` and injected via MultiProvider in the main entry point.

**Routing:** Fluro router with declarative route definitions:
- Routes defined in `lib/route/routes.dart` as static constants
- Route handlers configured in `lib/route/router_helper.dart`
- Arguments passed via `RouteSettings` in navigation calls

**Networking:**
- Dio client wrapper in `lib/networking/datasource/remote/dio/dio_client.dart`
- Base URL selected based on active flavor from `lib/flavors.dart`
- Bearer token authentication from SharedPreferences
- Logging interceptor for debugging network calls

### Layer Organization

```
lib/
├── screens/           # UI screens organized by feature domain
│   ├── auth/         # Login, password recovery
│   ├── home/         # Dashboard, main screens
│   ├── properties/   # Properties, houses, tenants, meters
│   ├── invoices/     # Estate and tenant invoices
│   ├── transactions/ # Payments, statements
│   ├── expenditure/  # Expenses, recurrent expenditure
│   ├── admin/        # User management
│   └── config/       # System configuration
├── providers/        # State management (Provider pattern)
├── viewmodel/        # View models for complex UI state
├── repository/       # Data access layer (bridges providers & networking)
├── networking/       # API client, interceptors, error handling
├── models/
│   ├── data/        # Domain models (login, tenants, properties, etc.)
│   └── response/    # Generic response wrappers
├── widgets/         # Reusable UI components
├── route/           # Fluro router setup and route definitions
├── utils/           # Constants, helpers
├── services/        # Platform services (permissions, etc.)
├── pdf/             # PDF generation and viewing
└── flavorizr/       # Flavor-specific templates
```

### Flavor System

Three flavors with separate entry points:
- **dev:** `lib/main_dev.dart` → Development environment
- **uat:** `lib/main_uat.dart` → User Acceptance Testing
- **prod:** `lib/main_prod.dart` → Production

Each entry point sets `F.appFlavor` which controls:
- App name/title
- Base URL (`lib/flavors.dart`)
- Application ID
- Build type (debug/release)

Flavor configuration is in `pubspec.yaml` under `flavorizr` section.

### Data Flow Pattern

1. **Screen** triggers action
2. **Provider** handles state and business logic
3. **Repository** fetches/posts data via DioClient
4. **DioClient** makes HTTP request with authentication
5. **Model** deserializes JSON response
6. **Provider** notifies listeners
7. **Screen** rebuilds with new state

### Key Patterns

**Models:** Plain Dart classes with `fromJson/toJson` factory methods. No code generation used.

**Navigation:** Always use `RouterHelper.navigateTo()` with route constants from `AppRoutes`. Pass complex arguments via `RouteSettings(arguments: {...})` map.

**Authentication:** Token stored in SharedPreferences with key `AppConstants.token`. DioClient automatically includes Bearer token in all requests.

**API Endpoints:** Centralized in `lib/utils/app_constants.dart` as static constants.

**Logging:** Custom logger configured in `lib/logger.dart`. Use `logger.i()` for info, `loggerNoStack.i()` to suppress stack traces.

## Important Implementation Notes

- **Provider Registration:** New providers MUST be registered in both `di_container.dart` (GetIt) and `main.dart` template (MultiProvider)
- **Route Arguments:** Route handlers expect arguments as `Map<String, dynamic>` from `context.settings!.arguments`
- **Flavor Updates:** After modifying flavors in `pubspec.yaml`, always run `dart run flutter_flavorizr` to regenerate configuration
- **API Client Updates:** When adding authenticated endpoints, they automatically use the bearer token. For public endpoints or token refresh, use `DioClient.updateHeader(getToken: newToken)`
- **Model Conventions:** All data models use manual JSON serialization (no json_serializable). Follow existing pattern with `fromJson` factory and `toJson` method
- **Permission Handling:** Permissions requested at startup in `main.dart` via `PermissionService`. Add new permissions to Android/iOS native configs
- **Theme Management:** ThemeProvider stores theme preference in SharedPreferences. Access via `Provider.of<ThemeProvider>(context)`

## Testing Strategy

- Widget tests in `test/` directory
- Test single widgets or screens in isolation
- Use `flutter test` to run all tests
- Current test coverage focuses on widget functionality