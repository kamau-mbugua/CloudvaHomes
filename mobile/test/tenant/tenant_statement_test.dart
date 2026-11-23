import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/tenant_api.dart';
import 'package:hodi/features/tenant/tenant_more_pages.dart';
import 'package:hodi/features/tenant/tenant_statement_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import '../helpers/fake_printing.dart';
import 'tenant_dashboard_test.dart' show session;

StatementEntry _e(String date, {int debit = 0, int credit = 0}) =>
    StatementEntry(
      date: date,
      reference: 'R',
      description: 'x',
      debit: debit,
      credit: credit,
      balance: 0,
    );

Map<String, Object?> _statement({int closing = 3500000}) => {
  'from': '2026-09-01',
  'to': '2026-11-23',
  'openingBalance': 0,
  'closingBalance': closing,
  'entries': [
    {
      'date': '2026-10-04',
      'reference': 'INV-2026-000010',
      'description': 'Rent October',
      'debit': 3500000,
      'credit': 0,
      'balance': 3500000,
    },
    {
      'date': '2026-10-06',
      'reference': 'RCT-2026-000004',
      'description': 'M-Pesa payment',
      'debit': 0,
      'credit': 3500000,
      'balance': 0,
    },
    {
      'date': '2026-11-04',
      'reference': 'INV-2026-000011',
      'description': 'Rent November',
      'debit': 3500000,
      'credit': 0,
      'balance': 3500000,
    },
  ],
};

void main() {
  test('entries are grouped by month, in order', () {
    final groups = groupByMonth([
      _e('2026-10-04', debit: 1),
      _e('2026-10-06', credit: 1),
      _e('2026-11-04', debit: 1),
    ]);
    expect(groups.map((g) => g.$1), ['October 2026', 'November 2026']);
    expect(groups.first.$2, hasLength(2));
  });

  test('a negative balance is credit', () {
    expect(balanceText(-150000), 'KES 1,500.00 credit');
    expect(balanceText(150000), 'KES 1,500.00');
  });

  testWidgets('summary, months and a PDF preview', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    fakePrinting();
    final adapter = FakeAdapter(
      (c) => switch (c.path) {
        final p when p.endsWith('/statement') => (200, {'data': _statement()}),
        final p when p.contains('/statement/pdf') => (200, 'pdf'),
        _ => (
          200,
          {
            'data': {
              'balance': 0,
              'credit': 0,
              'depositHeld': 0,
              'homes': 0,
              'tenancies': [],
              'openInvoices': [],
              'accounts': [],
            },
          },
        ),
      },
    );
    await pumpWithApi(
      tester,
      const TenantStatementScreen(),
      adapter: adapter,
      session: session(),
    );
    expect(find.text('You owe'), findsOneWidget);
    expect(find.byKey(const Key('statement-closing')), findsOneWidget);
    expect(find.text('OCTOBER 2026'), findsOneWidget);
    expect(find.text('NOVEMBER 2026'), findsOneWidget);
    expect(find.text('M-Pesa payment'), findsOneWidget);
    expect(find.text('−KES 35,000.00'), findsOneWidget);

    await tester.tap(find.byKey(const Key('statement-pdf')));
    await settle(tester, andSettle: false);
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(DocumentPreviewScreen), findsOneWidget);
    expect(
      adapter.calls.any((c) => c.path.contains('/statement/pdf?from=')),
      isTrue,
    );
  });

  testWidgets('a range chip changes the period asked for', (tester) async {
    final adapter = FakeAdapter(
      (c) => switch (c.path) {
        final p when p.endsWith('/statement') => (
          200,
          {'data': _statement(closing: 0)},
        ),
        _ => (200, {'data': {}}),
      },
    );
    await pumpWithApi(
      tester,
      const TenantStatementScreen(),
      adapter: adapter,
      session: session(),
    );
    expect(find.text('All paid'), findsOneWidget);
    await tester.tap(find.byKey(const Key('statement-recent')));
    await settle(tester);
    final last = adapter.calls.lastWhere((c) => c.path.endsWith('/statement'));
    expect(last.query['from'], isNull);
  });
}
