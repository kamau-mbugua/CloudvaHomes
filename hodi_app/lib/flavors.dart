import 'package:hodi_app/utils/app_constants.dart';

enum Flavor {
  dev,
  uat,
  prod,
}

class F {
  static Flavor? appFlavor;

  static String get name => appFlavor?.name ?? '';
  static String get url => appFlavor?.name ?? '';

  static String get title {
    switch (appFlavor) {
      case Flavor.dev:
        return 'Hodi Dev';
      case Flavor.uat:
        return 'Hodi UAT';
      case Flavor.prod:
        return 'Hodi App';
      default:
        return 'Hodi App';
    }
  }

  static String get baseUrl {
    switch (appFlavor) {
      case Flavor.dev:
        return 'https://hodi-test.qnex.io/api/';
      case Flavor.uat:
        return 'https://hodi-test.qnex.io/api/';
      case Flavor.prod:
        return 'https://hodi.qnex.io/api/';
      default:
        return AppConstants.baseUrl;
    }
  }
}
