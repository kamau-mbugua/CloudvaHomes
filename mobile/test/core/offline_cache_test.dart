import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/offline/offline_cache.dart';
import 'package:hodi/core/providers.dart';

import '../helpers/fake_http.dart';

class _ThrowingOfflineCache extends OfflineCache {
  _ThrowingOfflineCache(super.dir);

  @override
  Future<void> clear() async {
    throw const FileSystemException('disk read-only');
  }
}

void main() {
  late Directory dir;
  late OfflineCache cache;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('offline_cache_test');
    cache = OfflineCache(dir);
  });

  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  group('OfflineCache', () {
    test('write then read returns the same rows and savedAt', () async {
      final stamp = DateTime.utc(2026, 11, 25, 9, 30);
      final rows = [
        {'id': 'p1', 'name': 'Makini Court'},
        {'id': 'p2', 'name': 'Kilimani Heights'},
      ];
      await cache.write('u1|o1', 'properties', rows, now: stamp);

      final hit = await cache.read('u1|o1', 'properties');
      expect(hit, isNotNull);
      expect(hit!.savedAt.toUtc(), stamp);
      expect(hit.rows, rows);
      expect(await cache.read('u1|o1', 'missing'), isNull);
    });

    test(
      'reading with a different owner returns null; writing with a different owner drops previous entries',
      () async {
        await cache.write('u1|o1', 'properties', [
          {'id': 'p1'},
        ]);
        await cache.write('u1|o1', 'meters|p1', [
          {'id': 'm1'},
        ]);

        expect(await cache.read('u2|o1', 'properties'), isNull);
        expect(await cache.read('u1|o2', 'properties'), isNull);

        await cache.write('u2|o1', 'meters|p9', [
          {'id': 'm9'},
        ]);

        expect(await cache.read('u1|o1', 'properties'), isNull);
        expect(await cache.read('u1|o1', 'meters|p1'), isNull);
        expect((await cache.read('u2|o1', 'meters|p9'))!.rows, [
          {'id': 'm9'},
        ]);
      },
    );

    test(
      'a corrupt file reads as null without throwing and a later write succeeds',
      () async {
        final file = File('${dir.path}/offline_cache.json');
        await file.writeAsString('{not json');

        expect(await cache.read('u1|o1', 'properties'), isNull);

        final stamp = DateTime.utc(2026, 11, 25, 12);
        await cache.write('u1|o1', 'properties', [
          {'id': 'p1'},
        ], now: stamp);

        final hit = await cache.read('u1|o1', 'properties');
        expect(hit, isNotNull);
        expect(hit!.rows, [
          {'id': 'p1'},
        ]);
      },
    );

    test('an entry older than 31 days is dropped on the next write', () async {
      final t0 = DateTime.utc(2026, 10, 1, 8);
      await cache.write('u1|o1', 'old', [
        {'id': 'old'},
      ], now: t0);
      await cache.write('u1|o1', 'within', [
        {'id': 'within'},
      ], now: t0.add(const Duration(days: 15)));

      // 31 days + 1 second after t0: `old` is dropped, `within` (16 days old) stays.
      await cache.write('u1|o1', 'fresh', [
        {'id': 'fresh'},
      ], now: t0.add(const Duration(days: 31, seconds: 1)));

      expect(await cache.read('u1|o1', 'old'), isNull);
      expect(await cache.read('u1|o1', 'within'), isNotNull);
      expect(await cache.read('u1|o1', 'fresh'), isNotNull);
    });

    test('clear() removes everything', () async {
      await cache.write('u1|o1', 'properties', [
        {'id': 'p1'},
      ]);
      expect(await cache.read('u1|o1', 'properties'), isNotNull);

      await cache.clear();
      expect(await cache.read('u1|o1', 'properties'), isNull);
      // Calling clear() again when the file is already gone is a no-op.
      await cache.clear();
    });
  });

  group('SessionController cache cleanup', () {
    test(
      'signOut() clears the cache, including when /auth/logout fails with a network error',
      () async {
        var logoutOffline = false;
        final adapter = FakeAdapter(
          (call) => switch (call.path) {
            '/auth/refresh' => (200, {'data': sessionJson()}),
            '/auth/logout' =>
              logoutOffline ? (throw StateError('offline')) : (204, null),
            _ => (404, null),
          },
        );

        // 1) Normal online sign-out clears the cache.
        final store1 = MemoryTokenStore()..token = 'r-1';
        final c1 = ProviderContainer(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(store1),
            offlineCacheProvider.overrideWith((ref) async => cache),
          ],
        );
        addTearDown(c1.dispose);
        await c1.read(sessionProvider.future);
        await cache.write('u1|o1', 'properties', [
          {'id': 'p1'},
        ]);
        expect(await cache.read('u1|o1', 'properties'), isNotNull);

        await c1.read(sessionProvider.notifier).signOut();
        expect(await cache.read('u1|o1', 'properties'), isNull);
        expect(c1.read(sessionProvider).valueOrNull, isNull);

        // 2) Offline logout failure still clears the cache and signs out locally.
        logoutOffline = true;
        final store2 = MemoryTokenStore()..token = 'r-2';
        final c2 = ProviderContainer(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(store2),
            offlineCacheProvider.overrideWith((ref) async => cache),
          ],
        );
        addTearDown(c2.dispose);
        await c2.read(sessionProvider.future);
        await cache.write('u1|o1', 'meters|p1', [
          {'id': 'm1'},
        ]);
        expect(await cache.read('u1|o1', 'meters|p1'), isNotNull);

        await c2.read(sessionProvider.notifier).signOut();
        expect(await cache.read('u1|o1', 'meters|p1'), isNull);
        expect(store2.token, isNull);
        expect(c2.read(sessionProvider).valueOrNull, isNull);
      },
    );

    test(
      'signOut() does not fail if OfflineCache.clear() itself throws, and deleteAccount() clears the cache',
      () async {
        final adapter = FakeAdapter(
          (call) => switch (call.path) {
            '/auth/refresh' => (200, {'data': sessionJson()}),
            '/auth/logout' => (204, null),
            '/me/delete' => (204, null),
            _ => (404, null),
          },
        );

        // Failure in clear() never blocks signOut().
        final store1 = MemoryTokenStore()..token = 'r-1';
        final c1 = ProviderContainer(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(store1),
            offlineCacheProvider.overrideWith(
              (ref) async => _ThrowingOfflineCache(dir),
            ),
          ],
        );
        addTearDown(c1.dispose);
        await c1.read(sessionProvider.future);
        await c1.read(sessionProvider.notifier).signOut();
        expect(c1.read(sessionProvider).valueOrNull, isNull);

        // Account deletion clears the cache.
        final store2 = MemoryTokenStore()..token = 'r-2';
        final c2 = ProviderContainer(
          overrides: [
            apiClientProvider.overrideWithValue(fakeClient(adapter)),
            tokenStoreProvider.overrideWithValue(store2),
            offlineCacheProvider.overrideWith((ref) async => cache),
          ],
        );
        addTearDown(c2.dispose);
        await c2.read(sessionProvider.future);
        await cache.write('u1|o1', 'properties', [
          {'id': 'p1'},
        ]);
        await c2
            .read(sessionProvider.notifier)
            .deleteAccount(stepUpToken: 'su-1');
        expect(await cache.read('u1|o1', 'properties'), isNull);
        expect(c2.read(sessionProvider).valueOrNull, isNull);
      },
    );
  });
}
