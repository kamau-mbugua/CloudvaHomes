import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/sms/sms_models.dart';

Map<String, Object?> accountJson({
  String mode = 'PLATFORM',
  int balance = 100,
  int low = 50,
  Map<String, Object?>? failing,
}) => {
  'mode': mode,
  'provider': mode == 'OWN' ? 'TEXTSMS' : null,
  'senderId': mode == 'OWN' ? 'MAKINI' : null,
  'balance': balance,
  'unitsBought': 500,
  'unitsUsed': 400,
  'lowBalanceLevel': low,
  'fallbackToPlatform': false,
  'unitPrice': '80',
  'failing': failing,
  'canBuyInApp': true,
};

void main() {
  test('reads the SMS account', () {
    final a = SmsAccount.fromJson(accountJson());
    expect(a.balance, 100);
    expect(a.unitPrice, 80);
    expect(a.unitsBought, 500);
    expect(a.failing, isNull);
  });

  test('says plainly how messages are sent', () {
    expect(
      smsModeLabel(SmsAccount.fromJson(accountJson())),
      'KodiHub sends your SMS',
    );
    expect(
      smsModeLabel(SmsAccount.fromJson(accountJson(mode: 'OWN'))),
      'Your own SMS account (sender ID MAKINI, TextSMS Kenya)',
    );
  });

  test('warns when units are out or low, or the own account fails', () {
    expect(
      smsBanner(SmsAccount.fromJson(accountJson(balance: 0)))?.text,
      'Out of SMS units — messages to your tenants and guests are not being sent.',
    );
    expect(
      smsBanner(SmsAccount.fromJson(accountJson(balance: 20)))?.text,
      '20 SMS units left.',
    );
    expect(
      smsBanner(SmsAccount.fromJson(accountJson(balance: 20)))?.danger,
      isFalse,
    );
    expect(smsBanner(SmsAccount.fromJson(accountJson(balance: 500))), isNull);
    final failing = smsBanner(
      SmsAccount.fromJson(
        accountJson(
          mode: 'OWN',
          failing: {
            'since': '2026-11-08T10:00:00Z',
            'reason': 'Invalid credentials',
          },
        ),
      ),
    );
    expect(
      failing?.text,
      'Your SMS account isn’t sending: Invalid credentials',
    );
    expect(failing?.buy, isFalse);
  });

  test('prices bundles in whole shillings like the server', () {
    expect(smsBundleAmount(500, 80), 40000);
    expect(smsBundleAmount(333, 80), 26700);
  });

  test('labels usage rows', () {
    expect(smsStatusLabel('SENT'), 'Sent');
    expect(smsStatusLabel('NO_UNITS'), 'Not sent — no SMS units');
  });
}
