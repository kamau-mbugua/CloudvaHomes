import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/tenant_home_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

Map<String, Object?> overview({
  required int balance,
  int credit = 0,
  bool canPay = true,
}) => {
  'tenant': {
    'id': 't1',
    'code': 'T00001',
    'firstName': 'Tom',
    'lastName': 'Tenant',
    'phone': '+254700000002',
  },
  'organization': {
    'name': 'Test Org',
    'phone': '+254700000003',
    'email': 'office@example.invalid',
  },
  'balance': balance,
  'credit': credit,
  'depositHeld': 2000000,
  'tenancies': [
    {
      'id': 'y1',
      'unit': {'id': 'u1', 'number': 'A1'},
      'property': {'id': 'p1', 'code': 'TST', 'name': 'Test Court'},
      'rentAmount': 2000000,
      'billingDay': 1,
      'status': 'ACTIVE',
      'startDate': '2026-03-01',
      'endDate': null,
    },
  ],
  'openInvoices': balance > 0
      ? [
          {
            'id': 'i1',
            'number': 'INV-2026-000001',
            'period': '2026-10',
            'dueDate': '2026-10-05',
            'total': balance,
            'balance': balance,
            'overdue': true,
          },
        ]
      : [],
  'howToPay': [
    {
      'kind': 'MPESA_PAYBILL',
      'name': 'Main paybill',
      'shortcode': '600111',
      'accountRef': 'T00001',
    },
  ],
  'canPayInApp': canPay,
};

void main() {
  testWidgets('owing: amount, overdue invoice, paybill and Pay now', (
    tester,
  ) async {
    final adapter = FakeAdapter(
      (c) => (200, {'data': overview(balance: 2050050)}),
    );
    await pumpWithApi(
      tester,
      const TenantHomeScreen(),
      adapter: adapter,
      session: sessionJson(staff: false, tenant: true),
    );
    expect(adapter.calls.single.path, '/tenant/accounts/t1');
    expect(find.text('You owe'), findsOneWidget);
    expect(find.text('KES 20,500.50'), findsWidgets);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('600111'), findsOneWidget);
    expect(find.text('T00001'), findsOneWidget);
    expect(find.text('Pay now'), findsOneWidget);
  });

  testWidgets(
    'in credit: nothing to pay, credit shown, pay in advance; no button without M-Pesa',
    (tester) async {
      final adapter = FakeAdapter(
        (c) => (200, {'data': overview(balance: -100000, credit: 100000)}),
      );
      await pumpWithApi(
        tester,
        const TenantHomeScreen(),
        adapter: adapter,
        session: sessionJson(staff: false, tenant: true),
      );
      expect(find.text('Nothing to pay'), findsOneWidget);
      expect(find.text('KES 0.00'), findsOneWidget);
      expect(find.textContaining('KES 1,000.00 in credit'), findsOneWidget);
      expect(find.text('Pay in advance'), findsOneWidget);

      adapter.respond = (c) =>
          (200, {'data': overview(balance: 0, canPay: false)});
      await pumpWithApi(
        tester,
        const TenantHomeScreen(),
        adapter: adapter,
        session: sessionJson(staff: false, tenant: true),
      );
      expect(find.text('Pay in advance'), findsNothing);
    },
  );

  testWidgets(
    'Pay now sends one prompt with the balance rounded up and follows it to Paid',
    (tester) async {
      var polls = 0;
      final adapter = FakeAdapter(
        (c) => switch ((c.method, c.path)) {
          ('GET', '/tenant/accounts/t1') => (
            200,
            {'data': overview(balance: 2050050)},
          ),
          ('POST', '/tenant/accounts/t1/pay') => (
            202,
            {
              'data': {
                'id': 's1',
                'state': 'PENDING',
                'amount': (c.body as Map)['amount'],
                'phone': '+254700000002',
              },
            },
          ),
          ('GET', '/tenant/accounts/t1/pay/s1') => (
            200,
            {
              'data': {
                'id': 's1',
                'state': ++polls < 2 ? 'PENDING' : 'SUCCESS',
                'amount': 2050100,
                'phone': '+254700000002',
                'mpesaReceipt': 'SIMTEST01',
              },
            },
          ),
          _ => (404, null),
        },
      );
      await pumpWithApi(
        tester,
        const TenantHomeScreen(),
        adapter: adapter,
        session: sessionJson(staff: false, tenant: true),
      );
      await tester.tap(find.text('Pay now'));
      await settle(tester);
      expect(find.widgetWithText(TextField, '20501'), findsOneWidget);
      await tapAndWait(
        tester,
        find.text('Send M-Pesa prompt'),
        () => adapter.calls.any((c) => c.path.endsWith('/pay/s1')),
      );
      final post = adapter.calls.firstWhere((c) => c.method == 'POST');
      expect(post.body, {'amount': 2050100, 'phone': '+254700000002'});
      expect(post.headers['Idempotency-Key'], isA<String>());
      // Pending, then polled (every 10 ms in tests) to the final state.
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 150)),
      );
      await settle(tester);
      expect(find.text('Paid'), findsWidgets);
      expect(find.textContaining('SIMTEST01'), findsOneWidget);
      // Refreshes the balance after success.
      expect(
        adapter.calls.where((c) => c.path == '/tenant/accounts/t1').length,
        greaterThanOrEqualTo(2),
      );
    },
  );
}
