import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/core/widgets/phone_field.dart';

Future<TextEditingController> _pump(
  WidgetTester tester, {
  String initial = '',
  bool kenyaOnly = false,
}) async {
  final ctrl = TextEditingController(text: initial);
  await tester.pumpWidget(
    MaterialApp(
      theme: hodiTheme(Brightness.light),
      home: Scaffold(
        body: PhoneField(
          controller: ctrl,
          fieldKey: const Key('phone'),
          kenyaOnly: kenyaOnly,
        ),
      ),
    ),
  );
  return ctrl;
}

void main() {
  group('composePhone', () {
    test('drops spaces and the leading 0', () {
      expect(composePhone(kenya, '0712 345 678'), '+254712345678');
      expect(composePhone(kenya, '712345678'), '+254712345678');
    });
    test('is empty when nothing was typed', () {
      expect(composePhone(kenya, '  '), '');
    });
  });

  group('splitPhone', () {
    test('finds the country from the dialling code', () {
      final s = splitPhone('+256701234567');
      expect(s.country.iso, 'UG');
      expect(s.national, '701234567');
    });
    test('keeps a local number in Kenya', () {
      final s = splitPhone('0712345678');
      expect(s.country.iso, 'KE');
      expect(s.national, '0712345678');
    });
    test('prefers the longest code (+254 over +2x)', () {
      expect(splitPhone('+254712345678').country.iso, 'KE');
      expect(splitPhone('+27821234567').country.iso, 'ZA');
    });
  });

  testWidgets('defaults to Kenya and writes the whole number', (tester) async {
    final ctrl = await _pump(tester);
    expect(find.text('+254'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('phone')), '0712 345 678');
    expect(ctrl.text, '+254712345678');
  });

  testWidgets('shows a stored number split into country and local part', (
    tester,
  ) async {
    await _pump(tester, initial: '+256701234567');
    expect(find.text('+256'), findsOneWidget);
    expect(find.text('701234567'), findsOneWidget);
  });

  testWidgets('picking another country changes the number', (tester) async {
    final ctrl = await _pump(tester);
    await tester.enterText(find.byKey(const Key('phone')), '701234567');
    await tester.tap(find.byKey(const Key('phone-country')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Search country or code'),
      'Uganda',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Uganda'));
    await tester.pumpAndSettle();
    expect(ctrl.text, '+256701234567');
  });

  testWidgets('a pasted international number picks its country', (
    tester,
  ) async {
    final ctrl = await _pump(tester);
    await tester.enterText(find.byKey(const Key('phone')), '+255712345678');
    await tester.pump();
    expect(find.text('+255'), findsOneWidget);
    expect(ctrl.text, '+255712345678');
  });

  testWidgets('M-Pesa fields stay on Kenya with no picker', (tester) async {
    final ctrl = await _pump(tester, kenyaOnly: true);
    expect(find.byIcon(Icons.arrow_drop_down), findsNothing);
    await tester.tap(find.byKey(const Key('phone-country')));
    await tester.pumpAndSettle();
    expect(find.text('Search country or code'), findsNothing);
    await tester.enterText(find.byKey(const Key('phone')), '0712345678');
    expect(ctrl.text, '+254712345678');
  });
}
