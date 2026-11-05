import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/tenant_dashboard_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import 'home_switcher_test.dart' show tenancy;
import 'tenant_dashboard_test.dart' show account, session;

FakeAdapter api(List<Map<String, Object?>> months) => FakeAdapter(
  (c) => switch (c.path) {
    '/tenant/accounts/overview' => (
      200,
      {
        'data': {
          'balance': 0,
          'credit': 0,
          'depositHeld': 0,
          'homes': 1,
          'tenancies': [tenancy('ty1', 't1', 'G1', 'Ivory Breeze')],
          'openInvoices': [],
          'accounts': [account('t1', 'Ivory Breeze', 0)],
        },
      },
    ),
    '/tenant/accounts/overview/monthly' => (200, {'data': months}),
    '/tenant/accounts/overview/activity' => (200, {'data': []}),
    _ when c.path.endsWith('/requests') => (
      200,
      {
        'data': [],
        'meta': {'page': 1, 'totalPages': 1},
      },
    ),
    _ => (200, {'data': []}),
  },
);

List<Map<String, Object?>> sixMonths() => [
  for (final (i, m) in [
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
  ].indexed)
    {
      'period': m,
      'invoiced': i < 4 ? 0 : 1600000,
      'paid': i == 4 ? 1600000 : 0,
    },
];

Future<void> pumpPhone(
  WidgetTester tester,
  FakeAdapter adapter, {
  double textScale = 1,
}) async {
  tester.view.physicalSize = const Size(390 * 3, 1800 * 3);
  tester.view.devicePixelRatio = 3;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await pumpWithApi(
    tester,
    const TenantDashboardScreen(),
    adapter: adapter,
    session: session(),
  );
}

void main() {
  for (final scale in [1.0, 1.3, 2.0]) {
    testWidgets('the chart fits a phone with text at ${scale}x', (
      tester,
    ) async {
      await pumpPhone(tester, api(sixMonths()), textScale: scale);
      expect(tester.takeException(), isNull);
      expect(find.text('Billed vs paid · last 6 months'), findsOneWidget);
    });
  }

  testWidgets('two landlords at 2x text: the to-pay lines fit', (tester) async {
    final adapter = FakeAdapter(
      (c) => switch (c.path) {
        '/tenant/accounts/overview' => (
          200,
          {
            'data': {
              'balance': 4150000,
              'credit': 0,
              'depositHeld': 0,
              'homes': 2,
              'tenancies': [
                tenancy('ty1', 't1', 'G1', 'Ivory Breeze', due: 1600000),
                tenancy('ty3', 't2', 'S2', 'Ruaka Estates', due: 2550000),
              ],
              'openInvoices': [],
              'accounts': [
                account('t1', 'Ivory Breeze Property Managers', 1600000),
                account('t2', 'Ruaka Estates Limited', 2550000),
              ],
            },
          },
        ),
        '/tenant/accounts/overview/monthly' => (200, {'data': sixMonths()}),
        _ when c.path.endsWith('/requests') => (
          200,
          {
            'data': [],
            'meta': {'page': 1, 'totalPages': 1},
          },
        ),
        _ => (200, {'data': []}),
      },
    );
    await pumpPhone(tester, adapter, textScale: 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows the figures of the latest month, and of a month you tap', (
    tester,
  ) async {
    await pumpPhone(tester, api(sixMonths()));
    expect(
      find.text('Nov 2026: billed KES 16,000.00 · paid KES 0.00'),
      findsOneWidget,
    );
    await tester.tap(find.text('Oct'));
    await tester.pumpAndSettle();
    expect(
      find.text('Oct 2026: billed KES 16,000.00 · paid KES 16,000.00'),
      findsOneWidget,
    );
  });

  testWidgets('says so when nothing was billed or paid', (tester) async {
    await pumpPhone(
      tester,
      api([
        for (final m in [
          '2026-06',
          '2026-07',
          '2026-08',
          '2026-09',
          '2026-10',
          '2026-11',
        ])
          {'period': m, 'invoiced': 0, 'paid': 0},
      ]),
    );
    expect(
      find.text('Nothing billed or paid in these months yet.'),
      findsOneWidget,
    );
  });
}
