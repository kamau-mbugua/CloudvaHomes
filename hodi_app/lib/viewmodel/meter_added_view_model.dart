import 'package:flutter/material.dart';

class MeterAddedViewModel extends ChangeNotifier {
  bool _meterAdded = false;
  bool get meterAdded => _meterAdded;

  void onMeterAdded() {
    _meterAdded = true;
    notifyListeners();
  }

  void resetMeterAddedStatus() {
    _meterAdded = false;
  }
}