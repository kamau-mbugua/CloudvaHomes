import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/config.dart';
import 'package:hodi/features/billing/billing_banner.dart';
import 'package:hodi/features/billing/plan_billing_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

/// Store (Play) builds don't sell KodiHQ's own services in the app and don't point to other
/// ways to pay (store anti-steering rules): no Pay now, no paybill details.
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

FakeAdapter _api() => FakeAdapter(
  (c) => switch (c.path) {
    '/billing' => (200, {'data': _billing}),
    _ => (
      200,
      {
        'data': [],
        'meta': {'page': 1, 'totalPages': 1},
      },
    ),
  },
);

void main() {
  test('purchases are off in prod (store) builds, on in dev', () {
    expect(AppConfig.isProd, isFalse);
    expect(AppConfig.inAppPurchases, isTrue);
  });

  group('store build', () {
    setUp(() => AppConfig.purchasesOverride = false);
    tearDown(() => AppConfig.purchasesOverride = null);

    testWidgets('Plan & billing shows the bill, but no Pay now or paybill', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await pumpWithApi(
        tester,
        const PlanBillingScreen(),
        adapter: _api(),
        session: sessionJson(
          status: 'GRACE',
          permissions: ['settings:view', 'settings:update'],
        ),
      );
      expect(find.text('KES 2,000.00'), findsWidgets);
      expect(find.byKey(const Key('billing-no-pay')), findsOneWidget);
      expect(find.text('Pay now'), findsNothing);
      expect(find.text('777777'), findsNothing);
      expect(find.text('H00001'), findsNothing);
    });

    testWidgets('the overdue banner offers View bill, not Pay now', (
      tester,
    ) async {
      await pumpWithApi(
        tester,
        const BillingBanner(),
        adapter: _api(),
        session: sessionJson(
          status: 'GRACE',
          permissions: ['settings:view', 'settings:update'],
        ),
      );
      expect(find.text('View bill'), findsOneWidget);
      expect(find.text('Pay now'), findsNothing);
    });
  });
}
