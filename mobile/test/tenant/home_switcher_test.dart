import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/home_scope_widgets.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

Map<String, Object?> tenancy(
  String id,
  String tenantId,
  String unit,
  String org, {
  int due = 0,
  int overdue = 0,
}) => {
  'id': id,
  'tenantId': tenantId,
  'tenantCode': 'T1',
  'orgName': org,
  'unit': {'id': 'u-$id', 'number': unit},
  'property': {'id': 'p1', 'name': 'Acacia Heights'},
  'rentAmount': 1600000,
  'billingDay': 5,
  'status': 'ACTIVE',
  'startDate': '2026-01-01',
  'endDate': null,
  'due': due,
  'overdue': overdue,
  'daysLate': overdue > 0 ? 9 : 0,
  'nextDueDate': null,
};

Map<String, Object?> consolidated() => {
  'balance': 4150000,
  'credit': 0,
  'depositHeld': 0,
  'homes': 2,
  'tenancies': [
    tenancy('ty1', 't1', 'G1', 'Ivory Breeze', due: 1600000),
    tenancy('ty3', 't2', 'S2', 'Ruaka Estates', overdue: 2550000, due: 2550000),
  ],
  'openInvoices': [],
  'accounts': [],
};

void main() {
  testWidgets('the switcher lists every home and picking one shows the strip', (
    tester,
  ) async {
    final adapter = FakeAdapter((c) => (200, {'data': consolidated()}));
    await pumpWithApi(
      tester,
      const Column(children: [HomeSwitcherChip(), HomeScopeStrip()]),
      adapter: adapter,
      session: sessionJson(staff: false, tenant: true),
    );
    expect(find.text('All my homes (2)'), findsOneWidget);
    expect(find.textContaining('Showing only'), findsNothing);

    await tester.tap(find.text('All my homes (2)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('G1, Acacia Heights · Ivory Breeze'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Showing only G1, Acacia Heights'),
      findsOneWidget,
    );

    await tester.tap(find.text('Show all'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Showing only'), findsNothing);
  });
}
