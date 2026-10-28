/// Build-time settings, passed with `--dart-define` (see `mobile/README.md`). No secrets here:
/// everything in an app binary can be read by anyone who has it.
abstract final class AppConfig {
  /// The API base, ending in `/api/v1`. On the Android emulator the host machine is 10.0.2.2.
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:8080/api/v1',
  );

  /// `dev`, `uat` or `prod`; non-prod builds show a ribbon.
  static const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');

  static bool get isProd => flavor == 'prod';
}
