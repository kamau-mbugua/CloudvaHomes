import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/sms/sms_screen.dart';

import '../../staff/helpers.dart';
import 'sms_models_test.dart' show accountJson;

void main() {
  Map<String, Object?> quote() => {
    'unitPrice': '80',
    'minUnits': 100,
    'bundles': [
      {'units': 500, 'amount': '40000'},
      {'units': 1000, 'amount': '80000'},
    ],
  };

  Future<void> pump(
    WidgetTester tester,
    FakeAdapter adapter,
    Set<String> permissions,
  ) async {
    phoneSize(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overridesFor(adapter, permissions),
          stkPollIntervalProvider.overrideWithValue(Duration.zero),
        ],
        child: const MaterialApp(home: SmsScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows the balance and buys a bundle by M-Pesa', (tester) async {
    var balance = 100;
    final adapter = FakeAdapter({
      'GET /sms': (_) => {'data': accountJson(balance: balance)},
      'GET /sms/quote': (_) => {'data': quote()},
      'GET /sms/usage': (_) => page([]),
      'GET /sms/top-ups': (_) => page([]),
      'POST /sms/buy': (_) => {
        'data': {
          'id': 'p1',
          'units': 500,
          'amount': '40000',
          'state': 'PENDING',
          'mpesaReceipt': null,
        },
      },
      'GET /sms/buy/p1': (_) {
        balance = 600;
        return {
          'data': {
            'id': 'p1',
            'units': 500,
            'amount': '40000',
            'state': 'PAID',
            'mpesaReceipt': 'SIM123',
          },
        };
      },
    });
    await pump(tester, adapter, {'sms:view', 'sms:manage'});

    expect(find.text('KodiHub sends your SMS'), findsOneWidget);
    expect(find.text('100'), findsOneWidget);

    await tester.tap(find.byKey(const Key('sms-buy')));
    await tester.pumpAndSettle();
    expect(find.text('500 units'), findsOneWidget);
    expect(find.text('KES 400.00'), findsWidgets);

    await tester.tap(find.byKey(const Key('sms-buy-pay')));
    await tester.pumpAndSettle();

    final posts = adapter.sent('POST', '/sms/buy');
    expect(posts.single.data, {'units': 500, 'phone': '+254700000001'});
    expect(posts.single.headers['Idempotency-Key'], isNotNull);
    expect(find.text('Done — 500 SMS units added.'), findsOneWidget);
  });

  testWidgets(
    'owners set the warning level; people without sms:manage only look',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /sms': (_) => {'data': accountJson()},
        'GET /sms/usage': (_) => page([
          {
            'id': 'l1',
            'at': '2026-11-08T10:00:00Z',
            'type': 'rent_reminder',
            'to': '+2547****111',
            'units': 0,
            'status': 'NO_UNITS',
            'route': null,
            'reason': null,
          },
        ]),
        'GET /sms/top-ups': (_) => page([]),
        'PATCH /sms': (_) => {'data': accountJson(low: 20)},
      });
      await pump(tester, adapter, {'sms:view', 'sms:manage'});
      await tester.scrollUntilVisible(
        find.byKey(const Key('sms-low')),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byKey(const Key('sms-low')), '20');
      await tester.tap(find.byKey(const Key('sms-save')));
      await tester.pumpAndSettle();
      expect(adapter.sent('PATCH', '/sms').single.data, {
        'lowBalanceLevel': 20,
      });
      await tester.scrollUntilVisible(
        find.text('Not sent — no SMS units'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Not sent — no SMS units'), findsOneWidget);
    },
  );

  testWidgets('without sms:manage there is no buying or saving', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /sms': (_) => {'data': accountJson()},
      'GET /sms/usage': (_) => page([]),
      'GET /sms/top-ups': (_) => page([]),
    });
    await pump(tester, adapter, {'sms:view'});
    expect(find.byKey(const Key('sms-buy')), findsNothing);
    expect(find.byKey(const Key('sms-save')), findsNothing);
  });
}
