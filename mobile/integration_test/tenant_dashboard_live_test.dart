import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/app.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:integration_test/integration_test.dart';

import 'live_helpers.dart';

/// Tenant portal redesign on the simulator, with the local dev data (a tenant with two
/// homes): dashboard, chart (tap a month), home switcher + strip, More.
///   flutter drive -d SIMULATOR_ID --driver=test_driver/integration_test.dart \
///     --target=integration_test/tenant_dashboard_live_test.dart \
///     --dart-define=API_URL=http://localhost:8080/api/v1 --dart-define=OTP_LOG=/path/to/api.log
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('tenant dashboard, chart, home switcher and More', (
    tester,
  ) async {
    await SecureTokenStore().clear();
    await tester.pumpWidget(const ProviderScope(child: HodiApp()));
    await waitFor(tester, find.text('Sign in with a one-time code'));
    await tapOn(tester, find.text('Sign in with a one-time code'));
    await typeInto(tester, 'Phone number or email', '0711000210');
    final before = codeCount();
    await tapOn(tester, find.text('Send code'));
    await typeInto(tester, 'Code', await nextCode(before));
    await tapOn(tester, find.text('Sign in'));

    await waitFor(tester, find.text('All my homes (2)'));
    await waitFor(tester, find.text('My homes'));
    await shot(binding, tester, 't01-dashboard');

    final chart = find.textContaining('Billed vs paid');
    await tester.scrollUntilVisible(
      chart,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await shot(binding, tester, 't02-chart');
    final oct = find.text('Oct');
    if (oct.evaluate().isNotEmpty) {
      await tapOn(tester, oct.first);
      await shot(binding, tester, 't03-chart-oct');
    }

    await tester.scrollUntilVisible(
      find.text('My homes'),
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    await tapOn(tester, find.text('All my homes (2)'));
    await shot(binding, tester, 't04-switcher');
    await tapOn(tester, find.textContaining('G2, Ruaka Gardens ·'));
    await waitFor(
      tester,
      find.textContaining('Showing only G2, Ruaka Gardens'),
    );
    await shot(binding, tester, 't05-one-home');

    await tapOn(tester, find.text('More'));
    await shot(binding, tester, 't06-more');
    await tapOn(tester, find.text('Show all'));
  });
}
