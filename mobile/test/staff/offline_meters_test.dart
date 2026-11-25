import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/offline/offline_cache.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/staff/more/meters_screen.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';
import 'package:hodi/features/staff/staff_api.dart';
import 'package:hodi/features/staff/staff_models.dart';

import '../helpers/app_harness.dart' show settle;
import 'helpers.dart';

const _perms = {'meters:view', 'meters:create', 'meters:update'};

Map<String, Object?> _propertiesJson() => page([
  {
    'id': 'p1',
    'code': 'MAK',
    'name': 'Makini Court',
    'status': 'ACTIVE',
    'unitCount': 4,
    'occupiedCount': 4,
    'vacantCount': 0,
  },
]);

Map<String, Object?> _metersJson() => {
  'data': [
    {
      'id': 'm1',
      'serialNo': 'WM-101',
      'status': 'ACTIVE',
      'unit': {'id': 'u1', 'number': 'A1'},
      'property': {'id': 'p1', 'code': 'MAK', 'name': 'Makini Court'},
      'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
      'lastReading': {'period': '2026-10', 'current': '100.000'},
    },
    {
      'id': 'm2',
      'serialNo': 'WM-102',
      'status': 'ACTIVE',
      'unit': {'id': 'u2', 'number': 'A2'},
      'property': {'id': 'p1', 'code': 'MAK', 'name': 'Makini Court'},
      'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
      'lastReading': null,
    },
  ],
};

Map<String, Object?> _sheetJson({
  String suggestedPrevious = '100.000',
  String? averageUse = '10.000',
}) => {
  'data': [
    {
      'meter': {'id': 'm1', 'serialNo': 'WM-101'},
      'unit': {'id': 'u1', 'number': 'A1'},
      'suggestedPrevious': suggestedPrevious,
      'averageUse': averageUse,
      'reading': null,
    },
  ],
};

Meter _meterModel() => Meter.fromJson(
  (_metersJson()['data']! as List).first as Map<String, dynamic>,
);

Future<Directory> _tempDir(WidgetTester tester, String prefix) async {
  final dir = await tester.runAsync(
    () => Directory.systemTemp.createTemp(prefix),
  );
  addTearDown(() => tester.runAsync(() => dir!.delete(recursive: true)));
  return dir!;
}

Future<void> _pumpApp(
  WidgetTester tester,
  Widget home, {
  required FakeAdapter adapter,
  required OfflineCache cache,
  ReadingQueue? queue,
}) async {
  tester.view.physicalSize = const Size(1236, 2745);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        ...overridesFor(adapter, _perms),
        offlineCacheProvider.overrideWith((ref) async => cache),
        if (queue != null)
          readingQueueProvider.overrideWith((ref) async => queue),
      ],
      child: MaterialApp(theme: hodiTheme(Brightness.light), home: home),
    ),
  );
  await settle(tester);
}

void main() {
  testWidgets(
    'cached list while offline shows the meters with the offline banner, and online refresh clears it',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_meters_list');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      var offline = false;
      final adapter = FakeAdapter({
        'GET /properties': (_) =>
            offline ? DropConnection() : _propertiesJson(),
        'GET /meters': (_) => offline ? DropConnection() : _metersJson(),
      });

      // 1) Online: loads live, caches rows, shows no offline banner.
      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('A1 · Water'), findsOneWidget);
      expect(find.text('A2 · Water'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);

      // 2) Signal drops: opening the screen again shows the cached meters + banner.
      offline = true;
      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('A1 · Water'), findsOneWidget);
      expect(find.text('A2 · Water'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(
        find.textContaining('Offline — showing data from '),
        findsOneWidget,
      );

      // 3) Signal returns: pull-to-refresh reloads live and hides the banner.
      offline = false;
      await tester.drag(find.byType(ListView).first, const Offset(0, 300));
      await settle(tester);
      expect(find.text('A1 · Water'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);
    },
  );

  testWidgets(
    'nothing cached + offline shows the existing error state with Retry and no banner',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_meters_empty');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      final adapter = FakeAdapter({
        'GET /properties': (_) => DropConnection(),
        'GET /meters': (_) => DropConnection(),
      });

      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('Try again'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);
      expect(find.text('A1 · Water'), findsNothing);
    },
  );

  testWidgets(
    'a 500 or 403 error with cache present shows the error, never the cached data',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_meters_http_err');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      await tester.runAsync(() async {
        await cache.write(
          'u1|o1',
          'properties',
          (_propertiesJson()['data']! as List).cast<Map<String, dynamic>>(),
        );
        await cache.write(
          'u1|o1',
          'meters|p1',
          (_metersJson()['data']! as List).cast<Map<String, dynamic>>(),
        );
      });

      // 500 on /meters: surfaces error, never shows cached meters or banner.
      var metersStatus = 500;
      final adapter = FakeAdapter({
        'GET /properties': (_) => _propertiesJson(),
        'GET /meters': (_) => Reply(metersStatus, {
          'error': {
            'code': metersStatus == 500 ? 'INTERNAL_ERROR' : 'FORBIDDEN',
            'message': metersStatus == 500
                ? 'Database unavailable.'
                : 'You cannot access this property.',
          },
        }),
      });

      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('Database unavailable.'), findsOneWidget);
      expect(find.text('A1 · Water'), findsNothing);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);

      // 403 on /meters: same — error shown, cached meters never used.
      metersStatus = 403;
      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('You cannot access this property.'), findsOneWidget);
      expect(find.text('A1 · Water'), findsNothing);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);
    },
  );

  testWidgets(
    'ReadingScreen pushed on its own offline shows the cached sheet, warns on unusual use, and queues on Save anyway',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_reading_sheet');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      final period = nairobiPeriod();
      await tester.runAsync(() async {
        await cache.write(
          'u1|o1',
          'sheet|p1|c1|$period',
          (_sheetJson()['data']! as List).cast<Map<String, dynamic>>(),
        );
      });

      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => DropConnection(),
        'PUT /meter-readings': (_) => DropConnection(),
      });

      // Push ReadingScreen directly on its own (no MetersScreen above it).
      await _pumpApp(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        ReadingScreen(meter: _meterModel(), canSave: true),
                  ),
                ),
                child: const Text('open-reading'),
              ),
            ),
          ),
        ),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      await tester.tap(find.text('open-reading'));
      await settle(tester);

      // Cached sheet is shown with the offline banner and cached previous reading.
      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(find.text('100.000 m³'), findsOneWidget);

      // Unusual reading (145 - 100 = 45 > 3 * 10) triggers confirmation from cached averageUse.
      await tester.enterText(find.byKey(const Key('reading-current')), '145');
      await tester.runAsync(
        () => tester.tap(find.widgetWithText(FilledButton, 'Save reading')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Check this reading'), findsOneWidget);
      expect(
        find.text(
          'This is 45 m³, more than 3 times the usual use (about 10 m³). '
          'Check the meter before saving.',
        ),
        findsOneWidget,
      );

      await tester.runAsync(() async {
        await tester.tap(find.widgetWithText(FilledButton, 'Save anyway'));
        final deadline = DateTime.now().add(const Duration(seconds: 3));
        while ((await queue.pendingFor('u1|o1')).isEmpty &&
            DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await settle(tester);

      final pending = await tester.runAsync(() => queue.pendingFor('u1|o1'));
      expect(pending, hasLength(1));
      expect(pending!.single.meterId, 'm1');
      expect(pending.single.current, '145');
    },
  );

  testWidgets(
    'a cache saved by another user or org is not shown when offline',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_meters_other_owner');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      await tester.runAsync(() async {
        await cache.write(
          'other-user|o1',
          'properties',
          (_propertiesJson()['data']! as List).cast<Map<String, dynamic>>(),
        );
        await cache.write(
          'other-user|o1',
          'meters|p1',
          (_metersJson()['data']! as List).cast<Map<String, dynamic>>(),
        );
      });

      final adapter = FakeAdapter({
        'GET /properties': (_) => DropConnection(),
        'GET /meters': (_) => DropConnection(),
      });

      // Signed in as u1|o1: another user's cache is ignored → error state.
      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text('A1 · Water'), findsNothing);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);

      // Same user in a different org (u1|other-org) is also ignored.
      await tester.runAsync(() async {
        await cache.write(
          'u1|other-org',
          'properties',
          (_propertiesJson()['data']! as List).cast<Map<String, dynamic>>(),
        );
      });
      await _pumpApp(
        tester,
        const MetersScreen(),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );
      expect(find.text('Try again'), findsOneWidget);
      expect(find.byKey(const Key('meter-offline-banner')), findsNothing);
    },
  );

  testWidgets(
    'ReadingScreen mounted directly as root while session is loading still resolves owner and shows cached sheet',
    (tester) async {
      final dir = await _tempDir(tester, 'offline_reading_direct');
      final cache = OfflineCache(dir);
      final queue = ReadingQueue(dir);
      final period = nairobiPeriod();
      await tester.runAsync(() async {
        await cache.write(
          'u1|o1',
          'sheet|p1|c1|$period',
          (_sheetJson(suggestedPrevious: '250.500')['data']! as List)
              .cast<Map<String, dynamic>>(),
        );
      });

      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => DropConnection(),
      });

      // Mounted directly with no route or MetersScreen above it: session is AsyncLoading on frame 1.
      await _pumpApp(
        tester,
        ReadingScreen(meter: _meterModel(), canSave: true),
        adapter: adapter,
        cache: cache,
        queue: queue,
      );

      expect(find.byKey(const Key('meter-offline-banner')), findsOneWidget);
      expect(find.text('250.500 m³'), findsOneWidget);
    },
  );
}
