import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/account/devices_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';
import '../tenant/tenant_dashboard_test.dart' show session;

void main() {
  testWidgets('lists devices and signs another one out', (tester) async {
    final adapter = FakeAdapter(
      (c) => switch ((c.method, c.path)) {
        ('GET', '/me/sessions') => (
          200,
          {
            'data': [
              {
                'id': 's1',
                'device': 'KodiHQ app',
                'ip': '10.0.0.1',
                'signedInAt': '2026-11-20T08:00:00.000Z',
                'lastActiveAt': '2026-11-24T08:00:00.000Z',
                'current': true,
              },
              {
                'id': 's2',
                'device': 'Chrome on Windows',
                'ip': null,
                'signedInAt': '2026-11-21T08:00:00.000Z',
                'lastActiveAt': '2026-11-23T08:00:00.000Z',
                'current': false,
              },
            ],
          },
        ),
        ('DELETE', '/me/sessions/s2') => (204, null),
        _ => (200, {'data': {}}),
      },
    );
    await pumpWithApi(
      tester,
      const DevicesScreen(),
      adapter: adapter,
      session: session(),
    );
    expect(find.text('KodiHQ app · this device'), findsOneWidget);
    expect(find.text('Chrome on Windows'), findsOneWidget);

    await tester.tap(find.byKey(const Key('device-signout-s2')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(
      adapter.calls.where(
        (c) => c.method == 'DELETE' && c.path == '/me/sessions/s2',
      ),
      hasLength(1),
    );
  });
}
