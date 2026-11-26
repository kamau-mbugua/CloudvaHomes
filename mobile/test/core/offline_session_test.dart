import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_error.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/notifications/push_service.dart';
import 'package:hodi/core/offline/offline_cache.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/router.dart';

import '../helpers/fake_http.dart';
import '../staff/helpers.dart' as staff_helpers;

class _FakePushTokenSource implements PushTokenSource {
  _FakePushTokenSource(this.tokenInfo);
  final ({String token, String platform})? tokenInfo;

  @override
  Future<({String token, String platform})?> currentToken() async => tokenInfo;
}

Map<String, Object?> _hostSessionJson() {
  final json = sessionJson(staff: true);
  (json['organizations'] as List).first['kind'] = 'HOST';
  (json['activeOrganization'] as Map<String, Object?>)['kind'] = 'HOST';
  return json;
}

void main() {
  late Directory tempDir;
  late OfflineCache cache;
  late MemoryTokenStore store;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('offline_session_test_');
    cache = OfflineCache(tempDir);
    store = MemoryTokenStore();
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  ProviderContainer makeContainer(
    staff_helpers.FakeAdapter adapter, {
    PushTokenSource? pushSource,
    Duration? reconnectInterval = const Duration(hours: 1),
  }) => ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(staff_helpers.fakeApi(adapter)),
      tokenStoreProvider.overrideWithValue(store),
      offlineCacheProvider.overrideWith((_) async => cache),
      offlineReconnectIntervalProvider.overrideWithValue(reconnectInterval),
      if (pushSource != null)
        pushTokenSourceProvider.overrideWithValue(pushSource),
    ],
  );

  test(
    '1. online sign-in stores snapshot without tokens; sign-out, account deletion and 401/403 launch refresh clear it',
    () async {
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/login': (_) => {
          'data': sessionJson(token: 'secret-access', refreshToken: 'secret-r'),
        },
        'POST /auth/logout': (_) => staff_helpers.Reply(204, null),
        'POST /me/delete': (_) => {
          'data': {'deleted': true},
        },
        'POST /auth/refresh': (_) => staff_helpers.Reply(
          401,
          errorBody('SESSION_REVOKED', 'Please sign in again'),
        ),
      });
      final c = makeContainer(adapter);
      addTearDown(c.dispose);

      await c.read(sessionProvider.future);
      await c
          .read(sessionProvider.notifier)
          .signInWithPassword('owner@example.invalid', 'pw');

      final snap = await store.readSessionSnapshot();
      expect(snap, isNotNull);
      expect(snap!.data.containsKey('accessToken'), isFalse);
      expect(snap.data.containsKey('refreshToken'), isFalse);
      expect(snap.data.containsKey('accessTokenExpiresAt'), isFalse);
      expect((snap.data['user'] as Map)['firstName'], 'Olive');

      // Sign-out clears token, snapshot and OfflineCache.
      await cache.write('u1|o1', 'today|all', [
        {'period': '2026-11'},
      ]);
      await c.read(sessionProvider.notifier).signOut();
      expect(store.token, isNull);
      expect(await store.readSessionSnapshot(), isNull);
      expect(await cache.read('u1|o1', 'today|all'), isNull);

      // Account deletion clears token, snapshot and OfflineCache.
      await c
          .read(sessionProvider.notifier)
          .signInWithPassword('owner@example.invalid', 'pw');
      await cache.write('u1|o1', 'today|all', [
        {'period': '2026-11'},
      ]);
      expect(await store.readSessionSnapshot(), isNotNull);
      await c
          .read(sessionProvider.notifier)
          .deleteAccount(stepUpToken: 'step-1');
      expect(store.token, isNull);
      expect(await store.readSessionSnapshot(), isNull);
      expect(await cache.read('u1|o1', 'today|all'), isNull);

      // 401 refresh at launch clears token, snapshot and OfflineCache.
      await store.write('revoked-token');
      await store.writeSessionSnapshot(sessionJson());
      await cache.write('u1|o1', 'today|all', [
        {'period': '2026-11'},
      ]);
      final c2 = makeContainer(adapter);
      addTearDown(c2.dispose);
      expect(await c2.read(sessionProvider.future), isNull);
      expect(store.token, isNull);
      expect(await store.readSessionSnapshot(), isNull);
      expect(await cache.read('u1|o1', 'today|all'), isNull);
    },
  );

  test(
    '2. launch with stored token + 2-day-old staff snapshot on DropConnection or 503 opens offline staff session and keeps token',
    () async {
      await store.write('kept-refresh');
      await store.writeSessionSnapshot(
        sessionJson(permissions: ['meters:view', 'units:view']),
        savedAt: DateTime.now().toUtc().subtract(const Duration(days: 2)),
      );

      // Network drop at launch -> offline staff session, router goes to /staff (not /offline).
      final dropAdapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => staff_helpers.DropConnection(),
      });
      final c1 = makeContainer(dropAdapter);
      addTearDown(c1.dispose);

      final s1 = await c1.read(sessionProvider.future);
      expect(s1, isNotNull);
      expect(s1!.offline, isTrue);
      expect(s1.accessToken, isEmpty);
      expect(store.token, 'kept-refresh');
      expect(
        redirectFor(
          session: AsyncData<Session?>(s1),
          mode: c1.read(modeProvider),
          location: '/',
        ),
        '/staff',
      );

      // 503 at launch -> treated like no signal: opens offline session and keeps token.
      final adapter503 = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => staff_helpers.Reply(503, {
          'error': {'code': 'UNAVAILABLE', 'message': 'Maintenance'},
        }),
      });
      final c2 = makeContainer(adapter503);
      addTearDown(c2.dispose);

      final s2 = await c2.read(sessionProvider.future);
      expect(s2, isNotNull);
      expect(s2!.offline, isTrue);
      expect(store.token, 'kept-refresh');
      expect(await store.readSessionSnapshot(), isNotNull);
    },
  );

  test('3. 31-day-old snapshot rethrows at launch -> /offline', () async {
    await store.write('kept-refresh');
    await store.writeSessionSnapshot(
      sessionJson(staff: true),
      savedAt: DateTime.now().toUtc().subtract(const Duration(days: 31)),
    );
    final adapter = staff_helpers.FakeAdapter({
      'POST /auth/refresh': (_) => staff_helpers.DropConnection(),
    });
    final c = makeContainer(adapter);
    addTearDown(c.dispose);

    await expectLater(c.read(sessionProvider.future), throwsA(isA<ApiError>()));
    expect(store.token, 'kept-refresh');
    expect(
      redirectFor(
        session: c.read(sessionProvider),
        mode: c.read(modeProvider),
        location: '/',
      ),
      '/offline',
    );
  });

  test('4. missing snapshot rethrows at launch -> /offline', () async {
    await store.write('kept-refresh');
    final adapter = staff_helpers.FakeAdapter({
      'POST /auth/refresh': (_) => staff_helpers.DropConnection(),
    });
    final c = makeContainer(adapter);
    addTearDown(c.dispose);

    await expectLater(c.read(sessionProvider.future), throwsA(isA<ApiError>()));
    expect(store.token, 'kept-refresh');
    expect(
      redirectFor(
        session: c.read(sessionProvider),
        mode: c.read(modeProvider),
        location: '/',
      ),
      '/offline',
    );
  });

  test('5. tenant or host snapshot rethrows at launch -> /offline', () async {
    for (final nonStaff in [
      sessionJson(staff: false, tenant: true),
      _hostSessionJson(),
    ]) {
      await store.write('kept-refresh');
      await store.writeSessionSnapshot(
        nonStaff,
        savedAt: DateTime.now().toUtc().subtract(const Duration(days: 1)),
      );
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => staff_helpers.DropConnection(),
      });
      final c = makeContainer(adapter);
      addTearDown(c.dispose);

      await expectLater(
        c.read(sessionProvider.future),
        throwsA(isA<ApiError>()),
      );
      expect(
        redirectFor(
          session: c.read(sessionProvider),
          mode: c.read(modeProvider),
          location: '/',
        ),
        '/offline',
      );
    }
  });

  test(
    '6. offline session reconnects on first API call with one /auth/refresh before sending Bearer token',
    () async {
      await store.write('stored-r1');
      await store.writeSessionSnapshot(
        sessionJson(staff: true),
        savedAt: DateTime.now().toUtc().subtract(const Duration(hours: 6)),
      );
      var online = false;
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => online
            ? {
                'data': sessionJson(
                  token: 'fresh-access',
                  refreshToken: 'rotated-r2',
                ),
              }
            : staff_helpers.DropConnection(),
        'GET /units/u1': (_) => {
          'data': {'id': 'u1'},
        },
        'GET /reports/today': (_) => {
          'data': {'period': '2026-11'},
        },
      });
      final c = makeContainer(adapter);
      addTearDown(c.dispose);

      final initial = await c.read(sessionProvider.future);
      expect(initial!.offline, isTrue);
      adapter.requests.clear();

      // Network returns: two concurrent requests share a single refresh before either goes out.
      online = true;
      final api = c.read(apiClientProvider);
      await Future.wait([api.get('/units/u1'), api.get('/reports/today')]);

      expect(adapter.sent('POST', '/auth/refresh'), hasLength(1));
      expect(adapter.requests.first.uri.path, endsWith('/auth/refresh'));
      final unitReq = adapter.sent('GET', '/units/u1').single;
      expect(unitReq.headers['Authorization'], 'Bearer fresh-access');
      expect(c.read(sessionProvider).valueOrNull?.offline, isFalse);
      expect(store.token, 'rotated-r2');
    },
  );

  test(
    '7. offline session with no network or 500 on refresh sends no unauthenticated request and clears nothing',
    () async {
      await store.write('stored-r1');
      await store.writeSessionSnapshot(
        sessionJson(staff: true),
        savedAt: DateTime.now().toUtc().subtract(const Duration(hours: 3)),
      );
      await cache.write('u1|o1', 'today|all', [
        {'period': '2026-11'},
      ]);

      var refreshMode = 'drop';
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => refreshMode == 'drop'
            ? staff_helpers.DropConnection()
            : staff_helpers.Reply(500, {
                'error': {'code': 'INTERNAL', 'message': 'Database error'},
              }),
        'GET /units/u1': (_) => {
          'data': {'id': 'u1'},
        },
      });
      final c = makeContainer(adapter);
      addTearDown(c.dispose);

      final s = await c.read(sessionProvider.future);
      expect(s!.offline, isTrue);
      adapter.requests.clear();

      // Still no network -> ApiError.network(), no GET /units/u1 sent, nothing cleared.
      final api = c.read(apiClientProvider);
      await expectLater(
        api.get('/units/u1'),
        throwsA(isA<ApiError>().having((e) => e.isNetworkError, 'net', isTrue)),
      );
      expect(adapter.sent('GET', '/units/u1'), isEmpty);
      expect(c.read(sessionProvider).valueOrNull?.offline, isTrue);
      expect(store.token, 'stored-r1');
      expect(await store.readSessionSnapshot(), isNotNull);
      expect(await cache.read('u1|o1', 'today|all'), isNotNull);

      // Reconnect attempt and API call when /auth/refresh -> 500: stays offline and clears nothing.
      refreshMode = '500';
      expect(await c.read(sessionProvider.notifier).reconnect(), isFalse);
      await expectLater(
        api.get('/units/u1'),
        throwsA(isA<ApiError>().having((e) => e.isNetworkError, 'net', isTrue)),
      );
      expect(adapter.sent('GET', '/units/u1'), isEmpty);
      expect(c.read(sessionProvider).valueOrNull?.offline, isTrue);
      expect(store.token, 'stored-r1');
      expect(await store.readSessionSnapshot(), isNotNull);
      expect(await cache.read('u1|o1', 'today|all'), isNotNull);

      // Sign-in-only actions refuse offline with the friendly message and make no server calls.
      final beforeCount = adapter.requests.length;
      await expectLater(
        c.read(sessionProvider.notifier).switchOrganization('o2'),
        throwsA(
          isA<ApiError>().having(
            (e) => e.message,
            'message',
            "You're offline. Try again when you have signal.",
          ),
        ),
      );
      expect(adapter.requests, hasLength(beforeCount));
    },
  );

  test(
    '8. offline session: 401 from /auth/refresh signs out and clears token, snapshot and cache',
    () async {
      await store.write('revoked-later');
      await store.writeSessionSnapshot(
        sessionJson(staff: true),
        savedAt: DateTime.now().toUtc().subtract(const Duration(hours: 2)),
      );
      await cache.write('u1|o1', 'unit|u1', [
        {'id': 'u1'},
      ]);

      var revoked = false;
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => revoked
            ? staff_helpers.Reply(
                401,
                errorBody('SESSION_REVOKED', 'Signed out'),
              )
            : staff_helpers.DropConnection(),
        'GET /units/u1': (_) => {
          'data': {'id': 'u1'},
        },
      });
      final c = makeContainer(adapter);
      addTearDown(c.dispose);

      expect((await c.read(sessionProvider.future))!.offline, isTrue);
      revoked = true;

      await expectLater(
        c.read(apiClientProvider).get('/units/u1'),
        throwsA(isA<ApiError>().having((e) => e.status, 'status', 401)),
      );
      expect(adapter.sent('GET', '/units/u1'), isEmpty);
      expect(c.read(sessionProvider).valueOrNull, isNull);
      expect(store.token, isNull);
      expect(await store.readSessionSnapshot(), isNull);
      expect(await cache.read('u1|o1', 'unit|u1'), isNull);
    },
  );

  test(
    '9. push device is not registered while offline, and registers after reconnecting (including timer)',
    () async {
      await store.write('stored-r1');
      await store.writeSessionSnapshot(
        sessionJson(staff: true),
        savedAt: DateTime.now().toUtc().subtract(const Duration(hours: 1)),
      );
      var online = false;
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => online
            ? {'data': sessionJson(token: 'live-1', refreshToken: 'live-r1')}
            : staff_helpers.DropConnection(),
        'POST /notifications/devices': (_) => {
          'data': {'registered': true},
        },
      });
      final c = makeContainer(
        adapter,
        pushSource: _FakePushTokenSource((
          token: 'fcm-device-token-12345',
          platform: 'android',
        )),
        reconnectInterval: const Duration(milliseconds: 40),
      );
      addTearDown(c.dispose);

      final offlineSession = await c.read(sessionProvider.future);
      expect(offlineSession!.offline, isTrue);
      expect(adapter.sent('POST', '/notifications/devices'), isEmpty);

      // Foreground periodic reconnect promotes the session and registers the push device.
      online = true;
      await Future<void>.delayed(const Duration(milliseconds: 120));

      expect(c.read(sessionProvider).valueOrNull?.offline, isFalse);
      expect(adapter.sent('POST', '/notifications/devices'), hasLength(1));

      // Timer stops once online (no extra /auth/refresh calls).
      final refreshesAfterOnline = adapter.sent('POST', '/auth/refresh').length;
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(
        adapter.sent('POST', '/auth/refresh').length,
        refreshesAfterOnline,
      );
    },
  );

  test(
    'sign-out from an offline session reconnects first so the device is unregistered and the server session ended',
    () async {
      await store.write('stored-r1');
      await store.writeSessionSnapshot(
        sessionJson(staff: true),
        savedAt: DateTime.now().toUtc().subtract(const Duration(hours: 1)),
      );
      var online = false;
      final adapter = staff_helpers.FakeAdapter({
        'POST /auth/refresh': (_) => online
            ? {'data': sessionJson(token: 'live-1', refreshToken: 'live-r1')}
            : staff_helpers.DropConnection(),
        'POST /notifications/devices': (_) => {
          'data': {'registered': true},
        },
        'DELETE /notifications/devices': (_) => {
          'data': {'removed': 1},
        },
        'POST /auth/logout': (_) => staff_helpers.Reply(204, null),
      });
      final c = makeContainer(
        adapter,
        pushSource: _FakePushTokenSource((
          token: 'fcm-device-token-12345',
          platform: 'android',
        )),
      );
      addTearDown(c.dispose);

      // Still no signal: signs out on the phone only, nothing else is sent.
      expect((await c.read(sessionProvider.future))!.offline, isTrue);
      adapter.requests.clear();
      await c.read(sessionProvider.notifier).signOut();
      expect(c.read(sessionProvider).valueOrNull, isNull);
      expect(store.token, isNull);
      expect(await store.readSessionSnapshot(), isNull);
      expect(adapter.sent('DELETE', '/notifications/devices'), isEmpty);
      expect(adapter.sent('POST', '/auth/logout'), isEmpty);

      // Signal back: the device is unregistered and the rotated session is logged out.
      await store.write('stored-r1');
      await store.writeSessionSnapshot(
        sessionJson(staff: true),
        savedAt: DateTime.now().toUtc().subtract(const Duration(hours: 1)),
      );
      final c2 = makeContainer(
        adapter,
        pushSource: _FakePushTokenSource((
          token: 'fcm-device-token-12345',
          platform: 'android',
        )),
      );
      addTearDown(c2.dispose);
      expect((await c2.read(sessionProvider.future))!.offline, isTrue);
      online = true;
      adapter.requests.clear();
      await c2.read(sessionProvider.notifier).signOut();

      expect(adapter.sent('POST', '/auth/refresh'), hasLength(1));
      final unregister = adapter.sent('DELETE', '/notifications/devices');
      expect(unregister, hasLength(1));
      expect(unregister.single.headers['Authorization'], 'Bearer live-1');
      final logout = adapter.sent('POST', '/auth/logout').single;
      expect((logout.data as Map)['refreshToken'], 'live-r1');
      expect(c2.read(sessionProvider).valueOrNull, isNull);
      expect(store.token, isNull);
      expect(await store.readSessionSnapshot(), isNull);
    },
  );
}
