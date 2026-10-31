import 'package:flutter/services.dart' show appFlavor;

/// Build- and launch-time environment settings (`dev` and `prod` flavors).
/// Can be set via `--dart-define=FLAVOR=dev|prod --dart-define=API_URL=...`,
/// native `--flavor dev|prod`, or the entrypoint (`lib/main_dev.dart`, `lib/main_prod.dart`).
abstract final class AppConfig {
  static const devApiUrl = 'https://dapi.kodihub.co.ke/api/v1';
  static const prodApiUrl = 'https://api.kodihub.co.ke/api/v1';
  static const localApiUrl = 'http://localhost:8080/api/v1';

  static const devWebUrl = 'https://dev.kodihub.co.ke';
  static const prodWebUrl = 'https://app.kodihub.co.ke';
  static const localWebUrl = 'http://localhost:5173';

  static const _envFlavor = String.fromEnvironment('FLAVOR');
  static const _envApiUrl = String.fromEnvironment('API_URL');

  static String? _configuredFlavor;
  static String? _configuredApiUrl;

  /// Called by `main_dev.dart` / `main_prod.dart` before `runApp`.
  static void configure({required String flavor, String? apiUrl}) {
    _configuredFlavor = flavor;
    _configuredApiUrl = apiUrl;
  }

  /// Active flavor: `dev` or `prod` (non-prod builds show a flavor badge).
  static String get flavor {
    if (_envFlavor.isNotEmpty) return _envFlavor;
    if (_configuredFlavor != null && _configuredFlavor!.isNotEmpty) {
      return _configuredFlavor!;
    }
    if (appFlavor != null && appFlavor!.isNotEmpty) return appFlavor!;
    return 'dev';
  }

  static String _normalizeApiUrl(String url) {
    if (url.contains('dev.34-35-37-207.sslip.io')) return devApiUrl;
    if (url.contains('app.34-35-173-255.sslip.io')) return prodApiUrl;
    return url;
  }

  /// The API base URL, ending in `/api/v1`.
  static String get apiUrl {
    if (_envApiUrl.isNotEmpty) return _normalizeApiUrl(_envApiUrl);
    if (_configuredApiUrl != null && _configuredApiUrl!.isNotEmpty) {
      return _normalizeApiUrl(_configuredApiUrl!);
    }
    return switch (flavor) {
      'prod' => prodApiUrl,
      'local' => localApiUrl,
      _ => devApiUrl,
    };
  }

  /// The matching web app URL (`https://dev.kodihub.co.ke` for dev, `https://app.kodihub.co.ke` for prod).
  static String get webUrl => switch (flavor) {
    'prod' => prodWebUrl,
    'local' => localWebUrl,
    _ => devWebUrl,
  };

  static bool get isProd => flavor == 'prod';
}
