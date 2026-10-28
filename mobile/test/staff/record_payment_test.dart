import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/staff_api.dart';
import 'package:hodi/features/staff/staff_models.dart';
import 'package:hodi/features/staff/tenants/record_payment_sheet.dart';

import 'helpers.dart';

const _perms = {
  'payments:create',
  'payments:view',
  'channels:view',
  'tenants:view',
};

final _tenant = TenantRef(
  id: 't1',
  code: 'T0001',
  firstName: 'Amina',
  lastName: 'Test',
  phone: '+254700000010',
);

Map<String, Handler> _handlers({required Handler onPost}) => {
  'GET /payment-channels': (_) => {
    'data': [
      {'id': 'c1', 'kind': 'CASH', 'name': 'Office cash', 'status': 'ACTIVE'},
      {
        'id': 'c2',
        'kind': 'MPESA_PAYBILL',
        'name': 'Main paybill',
        'status': 'ACTIVE',
        'shortcode': '600000',
      },
    ],
  },
  'GET /tenants/t1/open-invoices': (_) => {
    'data': [
      {
        'id': 'i1',
        'number': 'INV-2026-000001',
        'kind': 'MONTHLY',
        'period': '2026-10',
        'issueDate': '2026-10-01',
        'dueDate': '2026-10-05',
        'total': 1500000,
        'balance': 1500000,
        'overdue': true,
      },
    ],
  },
  'GET /tenants/t1': (_) => {'data': tenantJson()},
  'POST /payments': onPost,
};

/// The sheet, plus a widget that keeps the tenant's balance on screen (as the tenant page
/// would), so invalidation shows up as a re-read.
Widget _harness({String Function()? newKey}) => Scaffold(
  body: Column(
    children: [
      Consumer(
        builder: (_, ref, _) {
          final t = ref.watch(tenantProvider('t1')).valueOrNull;
          return Text('balance ${t?.balance}');
        },
      ),
      Expanded(
        child: RecordPaymentSheet(tenant: _tenant, newKey: newKey),
      ),
    ],
  ),
);

Future<void> _submit(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('pay-submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('pay-submit')));
}

Future<void> _chooseCash(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('pay-channel')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Office cash (Cash)').last);
  await tester.pumpAndSettle();
}

void main() {
  group('PaymentRules', () {
    test('M-Pesa codes are normalised and checked', () {
      expect(
        PaymentRules.normaliseReference('MPESA_PAYBILL', ' sjr4 xk2l9p '),
        'SJR4XK2L9P',
      );
      expect(PaymentRules.checkReference('MPESA_TILL', ''), isNotNull);
      expect(PaymentRules.checkReference('MPESA_TILL', 'ab-12'), isNotNull);
      expect(PaymentRules.checkReference('MPESA_TILL', 'sjr4xk2l9p'), isNull);
      expect(PaymentRules.checkReference('CHEQUE', ' '), isNotNull);
      expect(PaymentRules.checkReference('CASH', ''), isNull);
    });

    test('amounts must be positive KES', () {
      expect(PaymentRules.checkAmount(''), isNotNull);
      expect(PaymentRules.checkAmount('0'), 'Enter an amount above zero.');
      expect(PaymentRules.checkAmount('12.345'), isNotNull);
      expect(PaymentRules.checkAmount('25,000.50'), isNull);
    });

    test('allocate pays the chosen invoice first, then oldest due', () {
      OpenInvoice inv(String id, String due, int balance) => OpenInvoice(
        id: id,
        number: id,
        kind: 'MONTHLY',
        period: '2026-10',
        dueDate: due,
        total: balance,
        balance: balance,
        overdue: false,
      );
      final open = [
        inv('new', '2026-10-05', 1000000),
        inv('old', '2026-09-05', 500000),
        inv('mid', '2026-09-20', 300000),
      ];
      final out = PaymentRules.allocate(1200000, open, 'new');
      expect(out.map((a) => (a.invoiceId, a.amount)).toList(), [
        ('new', 1000000),
        ('old', 200000),
      ]);
      // More than everything owed: the rest is credit (no line for it).
      final all = PaymentRules.allocate(9900000, open, 'mid');
      expect(all.fold<int>(0, (s, a) => s + a.amount), 1800000);
      expect(all.first.invoiceId, 'mid');
    });
  });

  testWidgets(
    'shows field errors and sends nothing when the form is incomplete',
    (tester) async {
      final adapter = FakeAdapter(
        _handlers(onPost: (_) => fail('must not POST')),
      );
      await pumpScreen(
        tester,
        _harness(),
        adapter: adapter,
        permissions: _perms,
      );

      await _submit(tester);
      await tester.pumpAndSettle();

      expect(
        find.text('Enter the amount in KES, e.g. 25,000.'),
        findsOneWidget,
      );
      expect(find.text('Choose how the money came in.'), findsOneWidget);
      expect(adapter.sent('POST', '/payments'), isEmpty);

      // An M-Pesa channel needs its code.
      await tester.tap(find.byKey(const Key('pay-channel')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Main paybill (M-Pesa paybill)').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('pay-amount')), '5000');
      await _submit(tester);
      await tester.pumpAndSettle();
      expect(
        find.text('Enter the M-Pesa code from the message.'),
        findsOneWidget,
      );
      expect(adapter.sent('POST', '/payments'), isEmpty);
    },
  );

  testWidgets(
    'a resubmit after a dropped connection reuses the Idempotency-Key, then refreshes balances',
    (tester) async {
      var posts = 0;
      final adapter = FakeAdapter(
        _handlers(
          onPost: (_) =>
              ++posts == 1 ? DropConnection() : {'data': paymentJson()},
        ),
      );
      var keys = 0;
      await pumpScreen(
        tester,
        _harness(newKey: () => 'key-${++keys}'),
        adapter: adapter,
        permissions: _perms,
      );
      final tenantReadsBefore = adapter.sent('GET', '/tenants/t1').length;

      await tester.enterText(find.byKey(const Key('pay-amount')), '10,000');
      await _chooseCash(tester);
      await _submit(tester);
      await tester.pumpAndSettle();

      // The first attempt failed with no answer: nothing retried by itself.
      expect(adapter.sent('POST', '/payments'), hasLength(1));
      expect(find.textContaining('Can’t reach Hodi'), findsOneWidget);

      await _submit(tester);
      await tester.pumpAndSettle();

      final posted = adapter.sent('POST', '/payments');
      expect(posted, hasLength(2));
      final k1 = posted[0].headers['Idempotency-Key'];
      final k2 = posted[1].headers['Idempotency-Key'];
      expect(k1, isNotNull);
      expect(k1, k2);
      expect(posted[1].data, {
        'tenantId': 't1',
        'channelId': 'c1',
        'amount': 1000000,
        'receivedAt': toDayForTest(nairobiToday()),
        'notifyTenant': true,
      });

      expect(find.text('Payment recorded — RCT-2026-000012'), findsOneWidget);
      // The tenant's balance was invalidated and read again.
      expect(
        adapter.sent('GET', '/tenants/t1').length,
        greaterThan(tenantReadsBefore),
      );
    },
  );

  testWidgets(
    'changing a detail after a failure starts a new attempt (new key)',
    (tester) async {
      final adapter = FakeAdapter(
        _handlers(
          onPost: (_) => Reply(422, {
            'error': {
              'code': 'VALIDATION_FAILED',
              'message': 'Validation failed',
              'details': [
                {'field': 'amount', 'message': 'Too large'},
              ],
            },
          }),
        ),
      );
      var keys = 0;
      await pumpScreen(
        tester,
        _harness(newKey: () => 'key-${++keys}'),
        adapter: adapter,
        permissions: _perms,
      );
      await tester.enterText(find.byKey(const Key('pay-amount')), '10000');
      await _chooseCash(tester);
      await _submit(tester);
      await tester.pumpAndSettle();
      expect(find.text('Too large'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('pay-amount')), '9000');
      await _submit(tester);
      await tester.pumpAndSettle();
      final posted = adapter.sent('POST', '/payments');
      expect(posted, hasLength(2));
      expect(
        posted[0].headers['Idempotency-Key'],
        isNot(posted[1].headers['Idempotency-Key']),
      );
    },
  );
}

String toDayForTest(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
