import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/router.dart';

import '../helpers/fake_http.dart';

void main() {
  Session session({bool staff = true, bool tenant = false}) =>
      Session.fromJson(sessionJson(staff: staff, tenant: tenant));

  group('mode', () {
    test(
      'staff by default, tenant when only a tenant, switchable when both',
      () {
        expect(effectiveMode(session(), null), AppMode.staff);
        expect(
          effectiveMode(session(staff: false, tenant: true), null),
          AppMode.tenant,
        );
        expect(
          effectiveMode(session(tenant: true), AppMode.tenant),
          AppMode.tenant,
        );
        expect(effectiveMode(session(), AppMode.tenant), AppMode.staff);
        expect(effectiveMode(session(staff: false), null), isNull);
        expect(effectiveMode(null, AppMode.staff), isNull);
      },
    );
  });

  group('redirect', () {
    String? go(AsyncValue<Session?> s, AppMode? m, String at) =>
        redirectFor(session: s, mode: m, location: at);

    test('splash while loading, offline on error', () {
      expect(go(const AsyncLoading(), null, '/tenant'), '/');
      expect(go(const AsyncLoading(), null, '/'), isNull);
      expect(
        go(AsyncError(Exception(), StackTrace.empty), null, '/'),
        '/offline',
      );
    });

    test('signed out → sign-in; public pages stay', () {
      expect(go(const AsyncData(null), null, '/staff'), '/sign-in');
      expect(go(const AsyncData(null), null, '/sign-in/code'), isNull);
      expect(go(const AsyncData(null), null, '/register'), isNull);
    });

    test('owner mode routes to /owner when user owns properties', () {
      final raw = sessionJson(staff: false);
      raw['ownerOf'] = [
        {
          'landlordId': 'l1',
          'name': 'Jane Landlord',
          'organization': {'id': 'o1', 'name': 'Apex Agency'},
        },
      ];
      final ownerSession = Session.fromJson(raw);
      expect(effectiveMode(ownerSession, null), AppMode.owner);
      expect(
        go(AsyncData<Session?>(ownerSession), AppMode.owner, '/sign-in'),
        '/owner',
      );
      expect(
        go(AsyncData<Session?>(ownerSession), AppMode.owner, '/owner/payouts'),
        isNull,
      );
    });

    test('platform admin routes to /platform instead of /no-access', () {
      final raw = sessionJson(staff: false);
      (raw['user'] as Map<String, dynamic>)['isPlatformAdmin'] = true;
      (raw['user'] as Map<String, dynamic>)['platformRole'] = 'SUPERADMIN';
      final platformSession = Session.fromJson(raw);
      expect(effectiveMode(platformSession, null), AppMode.platform);
      expect(
        go(AsyncData<Session?>(platformSession), AppMode.platform, '/sign-in'),
        '/platform',
      );
      expect(
        go(
          AsyncData<Session?>(platformSession),
          AppMode.platform,
          '/platform/orgs',
        ),
        isNull,
      );
    });

    test('signed in → home of the mode; the other mode is off-limits', () {
      final s = AsyncData<Session?>(session(tenant: true));
      expect(go(s, AppMode.staff, '/sign-in'), '/staff');
      expect(go(s, AppMode.staff, '/tenant/invoices'), '/staff');
      expect(go(s, AppMode.tenant, '/tenant/invoices'), isNull);
      expect(
        go(AsyncData<Session?>(session(staff: false)), null, '/'),
        '/no-access',
      );
    });
  });

  group('SessionController', () {
    late FakeAdapter adapter;
    late MemoryTokenStore store;
    late ProviderContainer c;

    ProviderContainer make() => ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(fakeClient(adapter)),
        tokenStoreProvider.overrideWithValue(store),
      ],
    );

    setUp(() => store = MemoryTokenStore());
    tearDown(() => c.dispose());

    test(
      'restores from the stored refresh token and keeps the rotated one',
      () async {
        store.token = 'stored';
        adapter = FakeAdapter((call) {
          expect(call.path, '/auth/refresh');
          expect(call.body, {'refreshToken': 'stored', 'client': 'mobile'});
          return (200, {'data': sessionJson(refreshToken: 'rotated')});
        });
        c = make();
        final s = await c.read(sessionProvider.future);
        expect(s!.user.firstName, 'Olive');
        expect(store.token, 'rotated');
      },
    );

    test('a revoked refresh token clears storage and shows sign-in', () async {
      store.token = 'revoked';
      adapter = FakeAdapter(
        (_) => (401, errorBody('SESSION_REVOKED', 'Please sign in again')),
      );
      c = make();
      expect(await c.read(sessionProvider.future), isNull);
      expect(store.token, isNull);
    });

    test('offline at launch keeps the token for later', () async {
      store.token = 'kept';
      adapter = FakeAdapter((_) => throw StateError('offline'));
      c = make();
      await expectLater(c.read(sessionProvider.future), throwsA(anything));
      expect(store.token, 'kept');
    });

    test(
      'code sign-in stores the refresh token; sign-out revokes and clears',
      () async {
        adapter = FakeAdapter(
          (call) => switch (call.path) {
            '/auth/otp/verify' => (
              200,
              {'data': sessionJson(staff: false, tenant: true)},
            ),
            '/auth/logout' => (204, null),
            _ => (404, null),
          },
        );
        c = make();
        await c.read(sessionProvider.future);
        await c
            .read(sessionProvider.notifier)
            .signInWithCode('0700000001', '123456');
        expect(c.read(modeProvider), AppMode.tenant);
        expect(store.token, 'refresh-1');
        await c.read(sessionProvider.notifier).signOut();
        expect(adapter.calls.last.path, '/auth/logout');
        expect(adapter.calls.last.body, {'refreshToken': 'refresh-1'});
        expect(store.token, isNull);
        expect(c.read(sessionProvider).value, isNull);
      },
    );
  });
}
