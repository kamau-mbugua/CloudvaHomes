import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/router.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/core/widgets/account_sheet.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

Map<String, Object?> _hostSessionJson({
  bool tenant = false,
  bool owner = false,
  String? platformRole,
  List<Map<String, Object?>> invitations = const [],
  String activeOrgId = 'org-host-1',
  String activeOrgName = 'Diani Breezes',
  String activeOrgKind = 'HOST',
}) => {
  'accessToken': 'access-host',
  'accessTokenExpiresAt': '2026-11-06T12:00:00.000Z',
  'refreshToken': 'refresh-host',
  'user': {
    'id': 'u-host',
    'firstName': 'Wanjiku',
    'lastName': 'Host',
    'email': 'wanjiku@example.invalid',
    'phone': '+254700000012',
    'isPlatformAdmin': platformRole == 'SUPERADMIN',
    'platformRole': platformRole,
  },
  'organizations': [
    {
      'id': 'org-host-1',
      'name': 'Diani Breezes',
      'kind': 'HOST',
      'roleName': 'Owner',
      'isOwner': true,
    },
    if (activeOrgId != 'org-host-1')
      {
        'id': activeOrgId,
        'name': activeOrgName,
        'kind': activeOrgKind,
        'roleName': 'Caretaker',
        'isOwner': false,
      },
  ],
  'invitations': invitations,
  'activeOrganization': {
    'id': activeOrgId,
    'name': activeOrgName,
    'kind': activeOrgKind,
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
  'ownerOf': owner
      ? [
          {
            'landlordId': 'land-1',
            'name': 'Wanjiku Landlord',
            'organization': {'id': 'org-agency-1', 'name': 'Apex Agency'},
          },
        ]
      : <Object?>[],
  'tenantOf': tenant
      ? [
          {
            'tenantId': 'ten-1',
            'name': 'Wanjiku Host',
            'organization': {'id': 'org-landlord-1', 'name': 'Kilimani Courts'},
            'units': [
              {
                'tenancyId': 'ty-1',
                'unitNumber': 'B4',
                'propertyName': 'Palm Gardens',
              },
            ],
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
            tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
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

      // Open the mode switcher sheet: group headings and per-home rows match spec.
      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();

      expect(find.text('Organisations'), findsOneWidget);
      expect(find.text('Homes I rent'), findsOneWidget);
      expect(find.text('Diani Breezes'), findsOneWidget);
      expect(find.text('Short stays · Owner'), findsOneWidget);
      expect(find.text('B4, Palm Gardens'), findsOneWidget);
      expect(find.text('Tenant · Kilimani Courts'), findsOneWidget);

      // Tap the home to switch to tenant mode and save place + homeId.
      await tester.tap(find.text('B4, Palm Gardens'));
      await tester.pumpAndSettle();

      expect(capturedRef.read(modeProvider), AppMode.tenant);
      expect(find.text('MODE:tenant'), findsOneWidget);
      expect(adapter.calls.last.path, '/auth/switch-context');
      expect((adapter.calls.last.body as Map)['place'], 'TENANT');
      expect((adapter.calls.last.body as Map)['homeId'], 'ty-1');

      // Re-open the switcher and tap the HOST organisation to return to host mode.
      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Diani Breezes'));
      await tester.pumpAndSettle();

      expect(capturedRef.read(modeProvider), AppMode.host);
      expect(find.text('MODE:host'), findsOneWidget);
      expect(adapter.calls.last.path, '/auth/switch-context');
      expect((adapter.calls.last.body as Map)['place'], 'STAFF');
    },
  );

  test(
    'a salesperson defaults to their organisation and can choose the platform',
    () {
      final s = Session.fromJson(_hostSessionJson(platformRole: 'SALESPERSON'));
      expect(s.isPlatformOperator, isTrue);
      expect(s.isSuperAdmin, isFalse);
      expect(effectiveMode(s, null), AppMode.host);
      expect(effectiveMode(s, AppMode.platform), AppMode.platform);

      final raw = _hostSessionJson(platformRole: 'SALESPERSON')
        ..['organizations'] = <Object?>[]
        ..['activeOrganization'] = null;
      expect(effectiveMode(Session.fromJson(raw), null), AppMode.platform);
    },
  );

  test('platformRoleLabel names the role in words', () {
    expect(
      platformRoleLabel(
        Session.fromJson(_hostSessionJson(platformRole: 'SALESPERSON')).user,
      ),
      'Salesperson',
    );
    expect(
      platformRoleLabel(
        Session.fromJson(_hostSessionJson(platformRole: 'SUPERADMIN')).user,
      ),
      'Superadmin',
    );
  });

  testWidgets(
    'a salesperson who owns a host organisation can switch to the platform and back',
    (tester) async {
      final json = _hostSessionJson(platformRole: 'SALESPERSON');
      final s = Session.fromJson(json);
      final adapter = FakeAdapter((_) => (200, {'data': json}));

      late WidgetRef capturedRef;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
            sessionProvider.overrideWith(() => _FixedSessionController(s)),
          ],
          child: MaterialApp(
            theme: hodiTheme(Brightness.light),
            home: Consumer(
              builder: (context, ref, _) {
                capturedRef = ref;
                ref.watch(modeProvider);
                return Scaffold(
                  body: Center(
                    child: ElevatedButton(
                      onPressed: () => AccountSheet.show(context),
                      child: const Text('Open switcher'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(capturedRef.read(modeProvider), AppMode.host);

      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();
      expect(find.text('KodiHub Platform'), findsOneWidget);
      expect(find.text('SALESPERSON'), findsNothing);
      await tester.tap(find.text('KodiHub Platform'));
      await tester.pumpAndSettle();
      expect(capturedRef.read(modeProvider), AppMode.platform);
      expect(adapter.calls.last.path, '/auth/switch-context');
      expect((adapter.calls.last.body as Map)['place'], 'PLATFORM');

      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Diani Breezes'));
      await tester.pumpAndSettle();
      expect(capturedRef.read(modeProvider), AppMode.host);
    },
  );

  testWidgets(
    'account sheet shows Invited tag, asks to confirm, and accepts invitation in place',
    (tester) async {
      final initialJson = _hostSessionJson(
        invitations: [
          {
            'membershipId': 'mem-inv-1',
            'organization': {
              'id': 'org-land-2',
              'name': 'Savannah Courts',
              'kind': 'LANDLORD',
            },
            'roleName': 'Caretaker',
          },
        ],
      );
      final acceptedJson = _hostSessionJson(
        activeOrgId: 'org-land-2',
        activeOrgName: 'Savannah Courts',
        activeOrgKind: 'LANDLORD',
      );
      final adapter = FakeAdapter(
        (call) => switch (call.path) {
          '/auth/memberships/mem-inv-1/accept' => (200, {'data': acceptedJson}),
          _ => (404, null),
        },
      );

      late WidgetRef capturedRef;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
            sessionProvider.overrideWith(
              () => _FixedSessionController(Session.fromJson(initialJson)),
            ),
          ],
          child: MaterialApp(
            theme: hodiTheme(Brightness.light),
            home: Consumer(
              builder: (context, ref, _) {
                capturedRef = ref;
                ref.watch(modeProvider);
                return Scaffold(
                  body: Center(
                    child: ElevatedButton(
                      onPressed: () => AccountSheet.show(context),
                      child: const Text('Open switcher'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();

      expect(find.text('Savannah Courts'), findsOneWidget);
      expect(find.text('Landlord · Caretaker'), findsOneWidget);
      expect(find.text('Invited'), findsOneWidget);

      await tapAndWait(
        tester,
        find.text('Savannah Courts'),
        () => find.text('Join').evaluate().isNotEmpty,
      );
      await tester.pumpAndSettle();

      expect(find.text('Join Savannah Courts as Caretaker?'), findsOneWidget);
      await tapAndWait(
        tester,
        find.text('Join'),
        () => capturedRef.read(modeProvider) == AppMode.staff,
      );
      await tester.pumpAndSettle();

      expect(
        adapter.calls.any(
          (c) =>
              c.method == 'POST' &&
              c.path == '/auth/memberships/mem-inv-1/accept',
        ),
        isTrue,
      );
      expect(capturedRef.read(modeProvider), AppMode.staff);
      expect(
        capturedRef.read(sessionProvider).valueOrNull?.activeOrganization?.id,
        'org-land-2',
      );
    },
  );

  testWidgets(
    'account sheet shows All my homes with >=2 homes and Landlord of group',
    (tester) async {
      final json = _hostSessionJson(owner: true);
      json['tenantOf'] = [
        {
          'tenantId': 'ten-1',
          'name': 'Wanjiku Host',
          'organization': {'id': 'org-landlord-1', 'name': 'Kilimani Courts'},
          'units': [
            {
              'tenancyId': 'ty-1',
              'unitNumber': 'G1',
              'propertyName': 'Acacia Heights',
            },
            {
              'tenancyId': 'ty-2',
              'unitNumber': 'B4',
              'propertyName': 'Palm Gardens',
            },
          ],
        },
      ];
      final adapter = FakeAdapter((_) => (200, {'data': json}));
      late WidgetRef capturedRef;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
            sessionProvider.overrideWith(
              () => _FixedSessionController(Session.fromJson(json)),
            ),
          ],
          child: MaterialApp(
            theme: hodiTheme(Brightness.light),
            home: Consumer(
              builder: (context, ref, _) {
                capturedRef = ref;
                ref.watch(modeProvider);
                return Scaffold(
                  body: Center(
                    child: ElevatedButton(
                      onPressed: () => AccountSheet.show(context),
                      child: const Text('Open switcher'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Open switcher'));
      await tester.pumpAndSettle();

      expect(find.text('All my homes'), findsOneWidget);
      expect(find.text('Tenant · 2 homes'), findsOneWidget);
      expect(find.text('G1, Acacia Heights'), findsOneWidget);
      expect(find.text('B4, Palm Gardens'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.text('Wanjiku Landlord'),
        150,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Landlord of'), findsOneWidget);
      expect(find.text('Wanjiku Landlord'), findsOneWidget);
      expect(find.text('Landlord · Apex Agency'), findsOneWidget);

      await tester.tap(find.text('Wanjiku Landlord'));
      await tester.pumpAndSettle();
      expect(capturedRef.read(modeProvider), AppMode.owner);
      expect(adapter.calls.last.path, '/auth/switch-context');
      expect((adapter.calls.last.body as Map)['place'], 'OWNER');
      expect((adapter.calls.last.body as Map)['landlordId'], 'land-1');
    },
  );
}
