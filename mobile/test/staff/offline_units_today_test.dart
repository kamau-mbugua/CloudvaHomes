import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/offline/offline_cache.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/staff/home/home_screen.dart';
import 'package:hodi/features/staff/more/meters_screen.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';
import 'package:hodi/features/staff/units/units_screens.dart';

import '../helpers/app_harness.dart' show settle, tapAndWait;
import '../helpers/fake_http.dart' show sessionJson;
import 'helpers.dart';

const _caretakerPerms = {
  'units:view',
  'meters:view',
  'meters:create',
  'meters:update',
  'tenancies:view',
  'maintenance:view',
};

Map<String, Object?> _todayPayload({String serialNo = 'W-A1'}) => {
  'asOf': '2026-11-26',
  'period': '2026-11',
  'propertyId': null,
  'unreadMeters': [
    {
      'id': 'm1',
      'serialNo': serialNo,
      'unit': {'id': 'u1', 'number': 'A1'},
      'property': {'id': 'p1', 'code': 'MAK', 'name': 'Makini Court'},
      'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
    },
  ],
  'moveIns': [
    {
      'tenancyId': 'tn1',
      'startDate': '2026-11-26',
      'unit': {'id': 'u1', 'number': 'A1'},
      'property': {'id': 'p1', 'code': 'MAK', 'name': 'Makini Court'},
      'tenant': {
        ...tenantRefJson('t1'),
        'firstName': 'Grace',
        'lastName': 'Mwangi',
      },
    },
  ],
  'moveOuts': const <Object?>[],
  'openRepairs': const <Object?>[],
};

Map<String, Object?> _unitJson(int index) {
  final numStr = index.toString().padLeft(2, '0');
  return {
    'id': 'u-$numStr',
    'number': 'U-$numStr',
    'floor': 1,
    'rentAmount': 2500000,
    'status': 'ACTIVE',
    'readiness': 'READY',
    'occupancy': 'VACANT',
    'unitType': {'id': 'ut1', 'name': '1BR'},
    'property': {'id': 'p1', 'code': 'MAK', 'name': 'Makini Court'},
    'currentTenancy': null,
  };
}

Map<String, Object?> _propertiesJson() => page([
  {
    'id': 'p1',
    'code': 'MAK',
    'name': 'Makini Court',
    'status': 'ACTIVE',
    'unitCount': 4,
    'occupiedCount': 2,
    'vacantCount': 2,
  },
]);

Map<String, Object?> _metersJson() => {
  'data': [
    {
      'id': 'm1',
      'serialNo': 'WM-101',
      'status': 'ACTIVE',
      'unit': {'id': 'u-01', 'number': 'U-01'},
      'property': {'id': 'p1', 'code': 'MAK', 'name': 'Makini Court'},
      'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
      'lastReading': {'period': '2026-10', 'current': '100.000'},
    },
  ],
};

Map<String, Object?> _sheetJson() => {
  'data': [
    {
      'meter': {'id': 'm1', 'serialNo': 'WM-101'},
      'unit': {'id': 'u-01', 'number': 'U-01'},
      'suggestedPrevious': '100.000',
      'averageUse': '10.000',
      'reading': null,
    },
  ],
};

Future<Directory> _tempDir(WidgetTester tester, String prefix) async {
  final dir = await tester.runAsync(
    () => Directory.systemTemp.createTemp(prefix),
  );
  addTearDown(() => tester.runAsync(() => dir!.delete(recursive: true)));
  return dir!;
}

Future<void> _pumpWithCache(
  WidgetTester tester,
  Widget home, {
  required FakeAdapter adapter,
  required OfflineCache cache,
  Set<String> perms = _caretakerPerms,
}) async {
  phoneSize(tester);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        ...overridesFor(adapter, perms),
        offlineCacheProvider.overrideWith((_) async => cache),
      ],
      child: MaterialApp(theme: hodiTheme(Brightness.light), home: home),
    ),
  );
  await settle(tester);
}

void main() {
  testWidgets(
    '10. offline session shows offline-session-banner on staff home; Retry when online removes banner, reloads Today and flushes queue',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_home_banner_');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      final store = MemoryTokenStore()..token = 'stored-r1';
      await store.writeSessionSnapshot(
        sessionJson(permissions: _caretakerPerms.toList()),
        savedAt: DateTime.now().toUtc().subtract(const Duration(days: 1)),
      );
      await tester.runAsync(() async {
        await cache.write('u1|o1', 'today|all', [
          _todayPayload(serialNo: 'W-CACHED'),
        ]);
        await queue.enqueue(
          PendingReading(
            meterId: 'm1',
            propertyId: 'p1',
            period: '2026-11',
            current: '112.000',
            savedAt: DateTime.utc(2026, 11, 26, 6),
            owner: 'u1|o1',
          ),
        );
      });

      var online = false;
      final adapter = FakeAdapter({
        'POST /auth/refresh': (_) => online
            ? {
                'data': sessionJson(
                  token: 'live-token',
                  refreshToken: 'live-r2',
                  permissions: _caretakerPerms.toList(),
                ),
              }
            : DropConnection(),
        'GET /reports/today': (_) => {
          'data': _todayPayload(serialNo: 'W-LIVE'),
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });

      tester.view.physicalSize = const Size(1236, 2745);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [
            apiClientProvider.overrideWithValue(fakeApi(adapter)),
            tokenStoreProvider.overrideWithValue(store),
            offlineCacheProvider.overrideWith((_) async => cache),
            readingQueueProvider.overrideWith((_) async => queue),
          ],
          child: MaterialApp(
            theme: hodiTheme(Brightness.light),
            home: const StaffHomeScreen(),
          ),
        ),
      );
      await settle(tester);

      expect(find.byKey(const Key('offline-session-banner')), findsOneWidget);
      expect(
        find.text(
          "Offline. Saved readings and inspections upload when you're back online.",
        ),
        findsOneWidget,
      );
      expect(find.textContaining('W-CACHED'), findsOneWidget);

      // Network returns -> tap Retry on the banner.
      online = true;
      await tapAndWait(
        tester,
        find.widgetWithText(TextButton, 'Retry'),
        () => adapter.sent('PUT', '/meter-readings').isNotEmpty,
      );
      await settle(tester);

      expect(find.byKey(const Key('offline-session-banner')), findsNothing);
      expect(find.textContaining('W-LIVE'), findsOneWidget);
      expect(adapter.sent('PUT', '/meter-readings'), hasLength(1));
    },
  );

  testWidgets(
    '11. Today caches online, shows saved list + offline banner on DropConnection, and never uses cache on 500',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_today_');
      final cache = OfflineCache(dir);
      var mode = 'online';
      final adapter = FakeAdapter({
        'GET /reports/today': (_) => switch (mode) {
          'online' => {'data': _todayPayload(serialNo: 'W-SAVED')},
          'offline' => DropConnection(),
          _ => Reply(500, {
            'error': {'code': 'INTERNAL', 'message': 'Server broke'},
          }),
        },
      });

      // 1) Online load populates cache.
      await _pumpWithCache(
        tester,
        const StaffHomeScreen(),
        adapter: adapter,
        cache: cache,
      );
      expect(find.textContaining('W-SAVED'), findsOneWidget);
      expect(find.text('Grace Mwangi'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);

      // 2) DropConnection -> shows saved Today list + "Offline — showing data from …" banner.
      mode = 'offline';
      await _pumpWithCache(
        tester,
        const StaffHomeScreen(),
        adapter: adapter,
        cache: cache,
      );
      expect(find.textContaining('W-SAVED'), findsOneWidget);
      expect(find.text('Grace Mwangi'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(
        find.textContaining('Offline — showing data from '),
        findsOneWidget,
      );

      // 3) HTTP 500 -> must NOT fall back to saved copy.
      mode = '500';
      await _pumpWithCache(
        tester,
        const StaffHomeScreen(),
        adapter: adapter,
        cache: cache,
      );
      expect(find.textContaining('W-SAVED'), findsNothing);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);
      expect(find.text('Server broke'), findsOneWidget);
    },
  );

  testWidgets(
    '12. Unit page caches main unit card on network error only and shows offline banner',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_unit_detail_');
      final cache = OfflineCache(dir);
      var mode = 'online';
      final adapter = FakeAdapter({
        'GET /units/u-01': (_) => switch (mode) {
          'online' => {'data': _unitJson(1)},
          'offline' => DropConnection(),
          _ => Reply(500, {
            'error': {'code': 'INTERNAL', 'message': 'Unit lookup failed'},
          }),
        },
      });

      // 1) Online load caches unit|u-01.
      await _pumpWithCache(
        tester,
        const UnitDetailScreen(unitId: 'u-01'),
        adapter: adapter,
        cache: cache,
      );
      expect(find.text('U-01 · Makini Court'), findsOneWidget);
      expect(find.text('KES 25,000.00'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);

      // 2) DropConnection -> shows cached unit card + offline banner.
      mode = 'offline';
      await _pumpWithCache(
        tester,
        const UnitDetailScreen(unitId: 'u-01'),
        adapter: adapter,
        cache: cache,
      );
      expect(find.text('U-01 · Makini Court'), findsOneWidget);
      expect(find.text('KES 25,000.00'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(
        find.textContaining('Offline — showing data from '),
        findsOneWidget,
      );

      // 3) HTTP 500 -> shows error state, not the cached unit.
      mode = '500';
      await _pumpWithCache(
        tester,
        const UnitDetailScreen(unitId: 'u-01'),
        adapter: adapter,
        cache: cache,
      );
      expect(find.text('U-01 · Makini Court'), findsNothing);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);
      expect(find.text('Unit lookup failed'), findsOneWidget);
    },
  );

  testWidgets(
    '13. Units list serves cached pages 1-2 cleanly offline, blocks search offline, and isolates owners',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_units_list_');
      final cache = OfflineCache(dir);
      var offline = false;
      final page1Rows = [for (var i = 1; i <= 20; i++) _unitJson(i)];
      final page2Rows = [for (var i = 21; i <= 25; i++) _unitJson(i)];

      final adapter = FakeAdapter({
        'GET /units': (req) {
          if (offline) return DropConnection();
          final p = int.tryParse('${req.queryParameters['page'] ?? '1'}') ?? 1;
          if (p == 1) {
            return {
              'data': page1Rows,
              'meta': {'page': 1, 'pageSize': 20, 'total': 30, 'pages': 3},
            };
          }
          if (p == 2) {
            return {
              'data': page2Rows,
              'meta': {'page': 2, 'pageSize': 20, 'total': 30, 'pages': 3},
            };
          }
          return {
            'data': [_unitJson(26)],
            'meta': {'page': 3, 'pageSize': 20, 'total': 30, 'pages': 3},
          };
        },
      });

      // Seed another owner's cached page to verify strict owner isolation.
      await tester.runAsync(
        () => cache.write('u2|o1', 'units|all|all|1', [
          {..._unitJson(99), 'id': 'u-other', 'number': 'OTHER-99'},
        ]),
      );

      // 1) Online: load page 1, scroll to load page 2 (leave page 3 uncached).
      await _pumpWithCache(
        tester,
        const UnitsScreen(),
        adapter: adapter,
        cache: cache,
      );
      expect(find.text('U-01 · Makini Court'), findsOneWidget);
      await tester.dragUntilVisible(
        find.text('U-25 · Makini Court'),
        find.byType(Scrollable).last,
        const Offset(0, -300),
      );
      await settle(tester);
      expect(find.text('U-25 · Makini Court'), findsOneWidget);

      // 2) Offline: re-open UnitsScreen -> page 1 + page 2 both load from cache,
      //    missing page 3 ends the list cleanly with NO error tile, and u2|o1 is hidden.
      offline = true;
      await _pumpWithCache(
        tester,
        const UnitsScreen(),
        adapter: adapter,
        cache: cache,
      );
      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(find.text('U-01 · Makini Court'), findsOneWidget);
      expect(find.text('OTHER-99 · Makini Court'), findsNothing);

      await tester.dragUntilVisible(
        find.text('U-25 · Makini Court'),
        find.byType(Scrollable).last,
        const Offset(0, -300),
      );
      await settle(tester);
      expect(find.text('U-25 · Makini Court'), findsOneWidget);
      expect(find.text('Couldn’t load more. Try again'), findsNothing);

      // 3) Offline with search text -> shows "Search needs a connection." instead of results.
      await tester.enterText(find.byType(TextField), 'U-01');
      await tester.pump(const Duration(milliseconds: 400));
      await settle(tester);
      expect(find.text('Search needs a connection.'), findsOneWidget);
      expect(find.text('U-01 · Makini Court'), findsNothing);

      // 4) Owner with no cached pages of their own does not see u1|o1's or u2|o1's pages:
      //    check an uncached filter (e.g. "Vacant") where only u2|o1 has cached rows.
      await tester.runAsync(
        () => cache.write('u2|o1', 'units|all|VACANT|1', [
          {..._unitJson(88), 'id': 'u-other-vacant', 'number': 'OTHER-VACANT'},
        ]),
      );
      await tester.tap(find.byTooltip('Clear search'));
      await settle(tester);
      final vacantChip = find.widgetWithText(ChoiceChip, 'Vacant');
      await tester.ensureVisible(vacantChip);
      await tester.pump();
      await tester.tap(vacantChip);
      await settle(tester);
      expect(find.text('OTHER-VACANT · Makini Court'), findsNothing);
    },
  );

  testWidgets(
    '14. start offline -> meter list opens from saved cache and saving a reading queues under owner u1|o1',
    (tester) async {
      final dir = await _tempDir(tester, 'start_offline_meters_');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      final store = MemoryTokenStore()..token = 'stored-r1';
      await store.writeSessionSnapshot(
        sessionJson(permissions: _caretakerPerms.toList()),
        savedAt: DateTime.now().toUtc().subtract(const Duration(days: 2)),
      );
      final period = DateTime.now().toUtc().add(const Duration(hours: 3));
      final periodStr =
          '${period.year.toString().padLeft(4, '0')}-${period.month.toString().padLeft(2, '0')}';

      await tester.runAsync(() async {
        await cache.write(
          'u1|o1',
          'properties',
          (_propertiesJson()['data'] as List).cast<Map<String, dynamic>>(),
        );
        await cache.write(
          'u1|o1',
          'meters|p1',
          (_metersJson()['data'] as List).cast<Map<String, dynamic>>(),
        );
        await cache.write(
          'u1|o1',
          'sheet|p1|c1|$periodStr',
          (_sheetJson()['data'] as List).cast<Map<String, dynamic>>(),
        );
      });

      final adapter = FakeAdapter({
        'POST /auth/refresh': (_) => DropConnection(),
      });

      tester.view.physicalSize = const Size(1236, 2745);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [
            apiClientProvider.overrideWithValue(fakeApi(adapter)),
            tokenStoreProvider.overrideWithValue(store),
            offlineCacheProvider.overrideWith((_) async => cache),
            readingQueueProvider.overrideWith((_) async => queue),
          ],
          child: MaterialApp(
            theme: hodiTheme(Brightness.light),
            home: const MetersScreen(),
          ),
        ),
      );
      await settle(tester);

      // Meter list opens with saved data and no unauthenticated requests were sent.
      expect(find.text('U-01 · Water'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(adapter.sent('GET', '/properties'), isEmpty);
      expect(adapter.sent('GET', '/meters'), isEmpty);

      // Open ReadingScreen and save a reading while still offline.
      await tester.tap(find.text('U-01 · Water'));
      await settle(tester);

      await tester.enterText(find.byKey(const Key('reading-current')), '108');
      await tapAndWait(
        tester,
        find.text('Save reading'),
        () => find.byType(ReadingScreen).evaluate().isEmpty,
      );
      await settle(tester);

      final pending = await tester.runAsync(() => queue.pendingFor('u1|o1'));
      expect(pending, hasLength(1));
      expect(pending!.single.owner, 'u1|o1');
      expect(pending.single.meterId, 'm1');
      expect(pending.single.current, '108');
      expect(adapter.sent('PUT', '/meter-readings'), isEmpty);
    },
  );
}
