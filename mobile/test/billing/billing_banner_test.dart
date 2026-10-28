import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/billing/billing_banner.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

final _billing = {
  'status': 'GRACE',
  'plan': {'name': 'Standard', 'pricePerUnit': 15000, 'minimumMonthly': 200000},
  'price': {'pricePerUnit': 15000, 'minimumMonthly': 200000, 'custom': false},
  'trialEndsAt': null,
  'noSuspendUntil': null,
  'billingRef': 'H00001',
  'balance': 200000,
  'credit': 0,
  'overdue': {'amount': 200000, 'since': '2026-10-20'},
  'payTo': {'paybill': '777777', 'accountRef': 'H00001'},
  'canPayInApp': true,
};

void main() {
  testWidgets('nothing when the organisation is in good standing', (
    tester,
  ) async {
    final adapter = FakeAdapter((_) => (200, {'data': _billing}));
    await pumpWithApi(
      tester,
      const BillingBanner(),
      adapter: adapter,
      session: sessionJson(permissions: ['settings:view']),
    );
    expect(find.textContaining('Hodi bill'), findsNothing);
    expect(adapter.calls, isEmpty);
  });

  testWidgets('GRACE shows the overdue amount and date with Pay now', (
    tester,
  ) async {
    final adapter = FakeAdapter((_) => (200, {'data': _billing}));
    await pumpWithApi(
      tester,
      const BillingBanner(),
      adapter: adapter,
      session: sessionJson(
        status: 'GRACE',
        permissions: ['settings:view', 'settings:update'],
      ),
    );
    expect(
      find.text('Your Hodi bill of KES 2,000.00 was due on 20 Oct 2026.'),
      findsOneWidget,
    );
    expect(find.text('Pay now'), findsOneWidget);
  });

  testWidgets(
    'SUSPENDED without settings:view: read-only note, ask the owner, no Pay now, no billing call',
    (tester) async {
      final adapter = FakeAdapter((_) => (200, {'data': _billing}));
      await pumpWithApi(
        tester,
        const BillingBanner(),
        adapter: adapter,
        session: sessionJson(status: 'SUSPENDED'),
      );
      expect(
        find.textContaining('read-only until the Hodi bill is paid'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Ask your organisation’s owner'),
        findsOneWidget,
      );
      expect(find.text('Pay now'), findsNothing);
      expect(adapter.calls, isEmpty);
    },
  );
}
