import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_error.dart';
import 'package:hodi/core/widgets/stk_sheet.dart';

StkStatus _s(String state, {String? desc}) => StkStatus(
  id: 's1',
  state: state,
  amount: 100000,
  phone: '+254700000002',
  resultDesc: desc,
);

Future<void> _pump(WidgetTester tester, StkPaySheet sheet) =>
    tester.pumpWidget(MaterialApp(home: Scaffold(body: sheet)));

void main() {
  testWidgets(
    'validates the amount, shows field errors from the server, reuses one key',
    (tester) async {
      final keys = <String>[];
      var attempt = 0;
      await _pump(
        tester,
        StkPaySheet(
          title: 'Pay',
          intro: 'Intro',
          defaultAmount: 0,
          defaultPhone: null,
          submit: (amount, phone, key) async {
            keys.add(key);
            if (attempt++ == 0) {
              throw ApiError(
                status: 422,
                code: 'VALIDATION',
                message: 'Check the form',
                details: [
                  (field: 'phone', message: 'Enter a Safaricom number'),
                ],
              );
            }
            return _s('PENDING');
          },
          poll: (_) async => _s('PENDING'),
          pollEvery: const Duration(hours: 1),
        ),
      );
      await tester.tap(find.text('Send M-Pesa prompt'));
      await tester.pump();
      expect(find.text('Enter an amount in whole shillings.'), findsOneWidget);

      await tester.enterText(
        find.widgetWithText(TextField, 'Amount (KES)'),
        '1000',
      );
      await tester.tap(find.text('Send M-Pesa prompt'));
      await tester.pump();
      expect(find.text('Enter a Safaricom number'), findsOneWidget);

      await tester.tap(find.text('Send M-Pesa prompt'));
      await tester.pump();
      expect(find.text('Check the phone'), findsOneWidget);
      expect(find.text('Waiting'), findsOneWidget);
      expect(keys, hasLength(2));
      expect(keys.toSet(), hasLength(1));
    },
  );

  testWidgets('a cancelled prompt says nothing was paid', (tester) async {
    StkStatus? finished;
    await _pump(
      tester,
      StkPaySheet(
        title: 'Pay',
        intro: 'Intro',
        defaultAmount: 100000,
        defaultPhone: '0700000002',
        submit: (_, _, _) async => _s('CANCELLED'),
        poll: (_) async => _s('CANCELLED'),
        onFinished: (s) => finished = s,
      ),
    );
    await tester.tap(find.text('Send M-Pesa prompt'));
    await tester.pump();
    expect(find.textContaining('Nothing was paid'), findsOneWidget);
    expect(finished?.state, 'CANCELLED');
  });
}
