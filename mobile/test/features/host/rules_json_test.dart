import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/host_models.dart';

void main() {
  test('rules are sent in the API shape (backend StayRules)', () {
    expect(const StayRules().toJson(), {
      'bookingMode': 'INSTANT',
      'payWhen': 'FULL',
      'depositPercent': null,
      'depositFixed': null,
      'balanceDue': 'ON_ARRIVAL',
      'balanceDaysBefore': 0,
      'cancellation': 'MODERATE',
      'customFullRefundDays': null,
      'customLatePercent': null,
    });
    final deposit = const StayRules(
      bookingMode: 'REQUEST',
      payment: StayPaymentRule(
        kind: 'DEPOSIT',
        depositPercent: 30,
        balanceDueDaysBefore: 3,
      ),
      cancellation: StayCancelRule(
        kind: 'CUSTOM',
        fullRefundDays: 10,
        partialPercent: 25,
      ),
    ).toJson();
    expect(deposit['payWhen'], 'DEPOSIT');
    expect(deposit['depositPercent'], 30);
    expect(deposit['balanceDue'], 'BEFORE_CHECKIN');
    expect(deposit['balanceDaysBefore'], 3);
    expect(deposit['cancellation'], 'CUSTOM');
    expect(deposit['customFullRefundDays'], 10);
    expect(deposit['customLatePercent'], 25);
  });

  test('rules are read from the API shape and round-trip', () {
    final read = StayRules.fromJson({
      'bookingMode': 'REQUEST',
      'payWhen': 'ON_ARRIVAL',
      'cancellation': 'STRICT',
    });
    expect(read.bookingMode, 'REQUEST');
    expect(read.payment.kind, 'ON_ARRIVAL');
    expect(read.cancellation.kind, 'STRICT');

    final back = StayRules.fromJson(
      const StayRules(
        payment: StayPaymentRule(
          kind: 'DEPOSIT',
          depositPercent: 40,
          balanceDueDaysBefore: 2,
        ),
      ).toJson(),
    );
    expect(back.payment.kind, 'DEPOSIT');
    expect(back.payment.depositPercent, 40);
    expect(back.payment.balanceDueDaysBefore, 2);
  });

  test('the site says whether guests can pay', () {
    final site = HostSite.fromJson({
      'published': true,
      'rules': {
        'payWhen': 'FULL',
        'bookingMode': 'INSTANT',
        'cancellation': 'MODERATE',
      },
      'checkInTime': '14:00',
      'checkOutTime': '10:00',
      'guestPayments': {'paybill': false, 'mpesaPrompt': false},
    });
    expect(site.guestCanPay, isFalse);
    expect(guestPaymentWarning(site.guestCanPay, 'FULL_UPFRONT'), isNotNull);
    expect(guestPaymentWarning(site.guestCanPay, 'ON_ARRIVAL'), isNull);
    expect(guestPaymentWarning(true, 'FULL_UPFRONT'), isNull);
    expect(guestPaymentWarning(null, 'FULL_UPFRONT'), isNull);
  });
}
