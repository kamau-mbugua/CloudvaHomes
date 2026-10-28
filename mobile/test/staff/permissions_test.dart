import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/money/money_screens.dart';
import 'package:hodi/features/staff/staff_models.dart';
import 'package:hodi/features/staff/tenants/tenants_screens.dart';

import 'helpers.dart';

Widget _actions() =>
    Scaffold(body: TenantActions(tenant: Tenant.fromJson(tenantJson())));

void main() {
  testWidgets('no money actions without the permissions', (tester) async {
    await pumpScreen(
      tester,
      _actions(),
      adapter: FakeAdapter({}),
      permissions: {'tenants:view'},
    );
    expect(find.byKey(const Key('action-record-payment')), findsNothing);
    expect(find.byKey(const Key('action-stk')), findsNothing);
    expect(find.byKey(const Key('action-remind')), findsNothing);
  });

  testWidgets('record payment without channels:view hides the M-Pesa prompt', (
    tester,
  ) async {
    await pumpScreen(
      tester,
      _actions(),
      adapter: FakeAdapter({}),
      permissions: {'payments:create'},
    );
    expect(find.byKey(const Key('action-record-payment')), findsOneWidget);
    expect(find.byKey(const Key('action-stk')), findsNothing);
    expect(find.byKey(const Key('action-remind')), findsNothing);
  });

  testWidgets('every action with every permission; reminder posts', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'POST /tenants/t1/reminder': (_) => {
        'data': {'to': '+254700000010', 'status': 'SENT', 'error': null},
      },
    });
    await pumpScreen(
      tester,
      _actions(),
      adapter: adapter,
      permissions: {'payments:create', 'channels:view', 'tenants:update'},
    );
    expect(find.byKey(const Key('action-record-payment')), findsOneWidget);
    expect(find.byKey(const Key('action-stk')), findsOneWidget);
    await tester.tap(find.byKey(const Key('action-remind')));
    await tester.pumpAndSettle();
    expect(adapter.sent('POST', '/tenants/t1/reminder'), hasLength(1));
    expect(find.text('Reminder sent to +254700000010.'), findsOneWidget);
  });

  testWidgets(
    'unmatched M-Pesa: no assign or ignore without reconciliation:update',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /inbound-transactions/x1': (_) => {'data': inboundJson()},
      });
      await pumpScreen(
        tester,
        const InboundDetailScreen(inboundId: 'x1'),
        adapter: adapter,
        permissions: {'reconciliation:view', 'tenants:view'},
      );
      expect(find.text('TEST000001'), findsWidgets);
      expect(find.byKey(const Key('inbound-assign')), findsNothing);
      expect(find.byKey(const Key('inbound-ignore')), findsNothing);
    },
  );

  testWidgets('Money shows only the tabs the role can see', (tester) async {
    final adapter = FakeAdapter({'GET /invoices': (_) => page([])});
    await pumpScreen(
      tester,
      const MoneyScreen(),
      adapter: adapter,
      permissions: {'invoices:view'},
    );
    expect(find.text('Invoices'), findsOneWidget);
    expect(find.text('Payments'), findsNothing);
    expect(find.text('M-Pesa'), findsNothing);
  });
}

Map<String, Object?> inboundJson({String status = 'UNMATCHED'}) => {
  'id': 'x1',
  'source': 'MPESA_C2B',
  'providerRef': 'TEST000001',
  'amount': 500000,
  'payerName': 'AMINA TEST',
  'payerPhone': '+254700000010',
  'accountRef': 'A1',
  'occurredAt': '2026-10-28T08:00:00.000Z',
  'matchStatus': status,
  'matchedBy': status == 'MATCHED' ? 'MANUAL' : null,
  'channel': {'id': 'c2', 'name': 'Main paybill', 'kind': 'MPESA_PAYBILL'},
  'tenant': status == 'MATCHED' ? tenantRefJson() : null,
  'payment': status == 'MATCHED'
      ? {'id': 'p9', 'number': 'RCT-2026-000099'}
      : null,
  'ignoredReason': null,
  'suggestions': [
    {'tenant': tenantRefJson(), 'reason': 'Phone matches'},
  ],
};
