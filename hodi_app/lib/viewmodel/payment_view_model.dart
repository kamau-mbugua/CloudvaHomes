import 'package:flutter/material.dart';

class PaymentViewModel extends ChangeNotifier {
  bool _paymentSuccessful = false;

  bool get paymentSuccessful => _paymentSuccessful;

  void onPaymentSuccessful() {
    _paymentSuccessful = true;
    notifyListeners();
  }

  void resetPaymentStatus() {
    _paymentSuccessful = false;
  }
}