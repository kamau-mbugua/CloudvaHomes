import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/sms/sms_banner.dart';

import '../../helpers/app_harness.dart';
import '../../helpers/fake_http.dart';
import 'sms_models_test.dart' show accountJson;

void main() {
  testWidgets('warns everyone who can see SMS when units run out', (
    tester,
  ) async {
    final adapter = FakeAdapter(
      (_) => (200, {'data': accountJson(balance: 0)}),
    );
    await pumpWithApi(
      tester,
      const SmsBanner(),
      adapter: adapter,
      session: sessionJson(permissions: ['sms:view', 'sms:manage']),
    );
    expect(
      find.text(
        'Out of SMS units — messages to your tenants and guests are not being sent.',
      ),
      findsOneWidget,
    );
    expect(find.text('Buy SMS'), findsOneWidget);
  });

  testWidgets('says nothing while there are enough units', (tester) async {
    final adapter = FakeAdapter(
      (_) => (200, {'data': accountJson(balance: 500)}),
    );
    await pumpWithApi(
      tester,
      const SmsBanner(),
      adapter: adapter,
      session: sessionJson(permissions: ['sms:view']),
    );
    expect(find.textContaining('SMS units'), findsNothing);
  });

  testWidgets('no banner and no request without sms:view', (tester) async {
    final adapter = FakeAdapter(
      (_) => (200, {'data': accountJson(balance: 0)}),
    );
    await pumpWithApi(
      tester,
      const SmsBanner(),
      adapter: adapter,
      session: sessionJson(permissions: ['settings:view']),
    );
    expect(find.textContaining('SMS units'), findsNothing);
    expect(adapter.calls, isEmpty);
  });
}
