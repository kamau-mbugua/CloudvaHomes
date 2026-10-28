import 'package:flutter/material.dart';

import '../repository/splash_repo.dart';


class SplashProvider extends ChangeNotifier {
  final SplashRepo? splashRepo;
  SplashProvider({required this.splashRepo});


  Future<bool> initSharedData() {
    return splashRepo!.initSharedData();
  }
  Future<bool> removeSharedData() {
    return splashRepo!.removeSharedData();
  }
}
