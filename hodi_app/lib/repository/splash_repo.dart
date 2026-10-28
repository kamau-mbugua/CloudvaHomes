import 'package:shared_preferences/shared_preferences.dart';

class SplashRepo {
  final SharedPreferences? sharedPreferences;
  SplashRepo({required this.sharedPreferences});

  Future<bool> initSharedData() {
    if(!sharedPreferences!.containsKey('onBoardingSkip')) {
      return sharedPreferences!.setBool('onBoardingSkip', true);
    }
    return Future.value(true);
  }

  Future<bool> removeSharedData() {
    return sharedPreferences!.clear();
  }

}
