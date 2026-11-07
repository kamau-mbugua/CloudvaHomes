import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/router.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/core/widgets/account_sheet.dart';

import '../helpers/fake_http.dart';

Map<String, Object?> _hostSessionJson({bool tenant = false}) => {
  'accessToken': 'access-host',
  'accessTokenExpiresAt': '2026-11-06T12:00:00.000Z',
  'refreshToken': 'refresh-host',
  'user': {
    'id': 'u-host',
    'firstName': 'Wanjiku',
    'lastName': 'Host',
    'email': 'wanjiku@example.invalid',
    'phone': '+254712345678',
    'isPlatformAdmin': false,
  },
  'organizations': [
    {
      'id': 'org-host-1',
      'name': 'Diani Breezes',
      'kind': 'HOST',
      'roleName': 'Owner',
      'isOwner': true,
    },
  ],
  'activeOrganization': {
    'id': 'org-host-1',
    'name': 'Diani Breezes',
    'kind': 'HOST',
    'status': 'ACTIVE',
  },
  'permissions': [
    'listings:view',
    'listings:create',
    'listings:update',
    'bookings:view',
    'bookings:create',
    'bookings:update',
    'site:view',
    'site:update',
  ],
  'ownerOf': <Object?>[],
  'tenantOf': tenant
      ? [
          {
            'tenantId': 'ten-1',
            'name': 'Wanjiku Host',
            'organization': {'id': 'org-landlord-1', 'name': 'Kilimani Courts'},
          },
        ]
      : <Object?>[],
};

class _FixedSessionController extends SessionController {
  _FixedSessionController(this._initial);
  final Session _initial;

  @override
  Future<Session?> build() async => _initial;
}

void main() {
  test(
    'redirectFor sends AppMode.host from /staff to /host and guards /host',
    () {
      final hostSession = Session.fromJson(_hostSessionJson());
      expect(effectiveMode(hostSession, null), AppMode.host);

      expect(
        redirectFor(
          session: AsyncData<Session?>(hostSession),
          mode: AppMode.host,
          location: '/staff',
        ),
        '/host',
      );
      expect(
        redirectFor(
          session: AsyncData<Session?>(hostSession),
          mode: AppMode.host,
          location: '/host/listings',
        ),
        isNull,
      );
      expect(
        redirectFor(
          session: AsyncData<Session?>(hostSession),
          mode: AppMode.staff,
          location: '/host',
        ),
        '/staff',
      );
    },
  );

  testWidgets(
    'a session with a HOST membership and a tenant account can switch between host and tenant mode',
    (tester) async {
      final dualSession = Session.fromJson(_hostSessionJson(tenant: true));
      final adapter = FakeAdapter(
        (_) => (200, {'data': _hostSessionJson(tenant: true)}),
      );

      late WidgetRef capturedRef;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            sessionProvider.overrideWith(
              () => _FixedSessionController(dualSession),
            ),
          ],
          child: MaterialApp(
            theme: hodiTheme(Brightness.light),
            home: Consumer(
              builder: (context, ref, _) {
                capturedRef = ref;
                final mode = ref.watch(modeProvider);
                return Scaffold(
                  body: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('MODE:${mode?.name}'),
                        ElevatedButton(
                          onPressed: () => AccountSheet.show(context),
                          child: const Text('Open switcher'),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Default mode for HOST org is host.
      expect(capturedRef.read(modeProvider), AppMode.host);
      expect(find.text('MODE:host'), findsOneWidget);

      // Open the mode switcher sheet: both the HOST org and tenant account are listed.
      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();

      expect(find.text('Diani Breezes'), findsOneWidget);
      expect(find.text('My rent'), findsOneWidget);
      expect(find.text('Kilimani Courts'), findsOneWidget);

      // Tap the tenant account to switch to tenant mode.
      await tester.tap(find.text('My rent'));
      await tester.pumpAndSettle();

      expect(capturedRef.read(modeProvider), AppMode.tenant);
      expect(find.text('MODE:tenant'), findsOneWidget);

      // Re-open the switcher and tap the HOST organisation to return to host mode.
      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Diani Breezes'));
      await tester.pumpAndSettle();

      expect(capturedRef.read(modeProvider), AppMode.host);
      expect(find.text('MODE:host'), findsOneWidget);
    },
  );
}
