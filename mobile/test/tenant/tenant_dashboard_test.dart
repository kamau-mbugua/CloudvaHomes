import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/tenant_dashboard_screen.dart';
import 'package:hodi/features/tenant/tenant_more_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import 'home_switcher_test.dart' show tenancy;

Map<String, Object?> account(String id, String org, int balance) => {
  'tenant': {
    'id': id,
    'code': id,
    'firstName': 'Tom',
    'lastName': 'T',
    'phone': '+254700000002',
  },
  'organization': {'name': org, 'phone': null, 'email': null},
  'balance': balance,
  'credit': 0,
  'depositHeld': 500000,
  'tenancies': [],
  'openInvoices': [],
  'howToPay': [],
  'canPayInApp': true,
};

Map<String, Object?> session() {
  final s = sessionJson(staff: false, tenant: true);
  s['tenantOf'] = [
    {
      'tenantId': 't1',
      'name': 'Tom T',
      'organization': {'id': 'o1', 'name': 'Ivory Breeze'},
    },
    {
      'tenantId': 't2',
      'name': 'Tom T',
      'organization': {'id': 'o2', 'name': 'Ruaka Estates'},
    },
  ];
  return s;
}

void main() {
  testWidgets('two landlords: total, one owed line each, and both homes', (
    tester,
  ) async {
    final adapter = FakeAdapter(
      (c) => switch (c.path) {
        '/tenant/accounts/overview' => (
          200,
          {
            'data': {
              'balance': 4150000,
              'credit': 0,
              'depositHeld': 1000000,
              'homes': 2,
              'tenancies': [
                tenancy('ty1', 't1', 'G1', 'Ivory Breeze', due: 1600000),
                tenancy(
                  'ty3',
                  't2',
                  'S2',
                  'Ruaka Estates',
                  overdue: 2550000,
                  due: 2550000,
                ),
              ],
              'openInvoices': [],
              'accounts': [
                account('t1', 'Ivory Breeze', 1600000),
                account('t2', 'Ruaka Estates', 2550000),
              ],
            },
          },
        ),
        '/tenant/accounts/overview/monthly' => (
          200,
          {
            'data': [
              {'period': '2026-11', 'invoiced': 1600000, 'paid': 0},
            ],
          },
        ),
        '/tenant/accounts/overview/activity' => (200, {'data': []}),
        _ when c.path.endsWith('/requests') => (
          200,
          {
            'data': [],
            'meta': {'page': 1, 'totalPages': 1},
          },
        ),
        _ when c.path.endsWith('/inspections') => (200, {'data': []}),
        _ => (404, errorBody('NOT_FOUND', 'nope')),
      },
    );
    await pumpWithApi(
      tester,
      const TenantDashboardScreen(),
      adapter: adapter,
      session: session(),
    );
    expect(find.text('KES 41,500.00'), findsOneWidget);
    expect(find.text('Across 2 homes'), findsOneWidget);
    expect(find.text('Ivory Breeze'), findsWidgets);
    expect(find.text('Ruaka Estates'), findsWidgets);
    expect(find.text('KES 25,500.00'), findsOneWidget);
    expect(find.text('My homes'), findsOneWidget);
    expect(find.textContaining('overdue · 9 days late'), findsOneWidget);
    expect(find.text('Pay now'), findsOneWidget);
  });

  testWidgets('More lists the other pages, theme and sign out', (tester) async {
    await pumpWithApi(
      tester,
      const TenantMoreScreen(),
      adapter: FakeAdapter((_) => (200, {'data': []})),
      session: session(),
    );
    for (final label in [
      'Statement',
      'Documents',
      'Notices',
      'My profile',
      'Dark theme',
      'Sign out',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
  });
}
