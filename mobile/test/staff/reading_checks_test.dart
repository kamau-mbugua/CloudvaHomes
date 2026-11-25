import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/more/meters_screen.dart';
import 'package:hodi/features/staff/more/reading_checks.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';
import 'package:hodi/features/staff/staff_models.dart';

import 'helpers.dart';

Meter _waterMeter() => Meter.fromJson({
  'id': 'm1',
  'serialNo': 'W-1',
  'status': 'ACTIVE',
  'unit': {'number': 'A1'},
  'property': {'id': 'p1'},
  'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
  'lastReading': null,
});

Map<String, Object?> _sheetResponse({
  String suggestedPrevious = '100.000',
  String? averageUse = '10.000',
  Map<String, Object?>? reading,
}) => {
  'data': [
    {
      'meter': {'id': 'm1', 'serialNo': 'W-1'},
      'unit': {'id': 'u1', 'number': 'A1'},
      'suggestedPrevious': suggestedPrevious,
      'averageUse': averageUse,
      'reading': reading,
    },
  ],
};

Future<void> _openReadingScreen(
  WidgetTester tester, {
  required FakeAdapter adapter,
  ReadingQueue? queue,
}) async {
  phoneSize(tester);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...overridesFor(adapter, {
          'meters:view',
          'meters:create',
          'meters:update',
        }),
        if (queue != null)
          readingQueueProvider.overrideWith((ref) async => queue),
      ],
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        ReadingScreen(meter: _waterMeter(), canSave: true),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  group('isUnusualUse', () {
    test('above 3x average use is true; 3x or below is false', () {
      expect(
        isUnusualUse(
          previous: '100.000',
          current: '130.001',
          averageUse: '10.000',
        ),
        isTrue,
      );
      expect(
        isUnusualUse(
          previous: '100.000',
          current: '130.000',
          averageUse: '10.000',
        ),
        isFalse,
      );
      expect(
        isUnusualUse(
          previous: '100.000',
          current: '115.000',
          averageUse: '10.000',
        ),
        isFalse,
      );
    });

    test('null or zero averageUse is false', () {
      expect(
        isUnusualUse(previous: '100', current: '500', averageUse: null),
        isFalse,
      );
      expect(
        isUnusualUse(previous: '100', current: '500', averageUse: '0'),
        isFalse,
      );
      expect(
        isUnusualUse(previous: '100', current: '500', averageUse: '0.000'),
        isFalse,
      );
    });
  });

  testWidgets(
    'unusual reading asks first: Cancel sends no PUT and keeps text; Save anyway sends one PUT',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(tester, adapter: adapter);

      await tester.enterText(find.byKey(const Key('reading-current')), '145');
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      expect(find.text('Check this reading'), findsOneWidget);
      expect(
        find.text(
          'This is 45 m³, more than 3 times the usual use (about 10 m³). '
          'Check the meter before saving.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
      await tester.pumpAndSettle();

      expect(adapter.sent('PUT', '/meter-readings'), isEmpty);
      expect(find.text('Check this reading'), findsNothing);
      final field = tester.widget<TextField>(
        find.byKey(const Key('reading-current')),
      );
      expect(field.controller!.text, '145');

      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Save anyway'));
      await tester.pumpAndSettle();

      final puts = adapter.sent('PUT', '/meter-readings');
      expect(puts, hasLength(1));
      final body = jsonDecode(jsonEncode(puts.single.data)) as Map;
      expect((body['readings'] as List).single['current'], '145');
    },
  );

  testWidgets(
    'no connection + Save anyway stores the unusual reading in the offline queue',
    (tester) async {
      final dir = await tester.runAsync(
        () => Directory.systemTemp.createTemp('unusual_offline'),
      );
      addTearDown(() => tester.runAsync(() => dir!.delete(recursive: true)));
      final queue = ReadingQueue(dir!);
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'PUT /meter-readings': (_) => DropConnection(),
      });
      await _openReadingScreen(tester, adapter: adapter, queue: queue);

      await tester.enterText(find.byKey(const Key('reading-current')), '145');
      await tester.runAsync(
        () => tester.tap(find.widgetWithText(FilledButton, 'Save reading')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Check this reading'), findsOneWidget);
      await tester.runAsync(() async {
        await tester.tap(find.widgetWithText(FilledButton, 'Save anyway'));
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      await tester.pumpAndSettle();

      final pending = await tester.runAsync(queue.pending);
      expect(pending!.single.current, '145');
      expect(pending.single.meterId, 'm1');
      expect(find.textContaining('saved on this phone'), findsOneWidget);
    },
  );

  testWidgets(
    'correcting an existing reading checks against reading.previous (not suggestedPrevious)',
    (tester) async {
      // Meter was swapped or had manual previous=100 while suggestedPrevious=0;
      // averageUse=10 excludes this month's erroneous reading of 300.
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(
          suggestedPrevious: '0.000',
          averageUse: '10.000',
          reading: {
            'id': 'r1',
            'previous': '100.000',
            'current': '300.000',
            'consumption': '200.000',
            'amount': 3000000,
            'billed': false,
            'photo': null,
            'readBy': {'id': 'u1', 'name': 'Staff User'},
          },
        ),
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });

      // 1) Correcting to 125: 125 - 100 = 25 (<= 3 * 10 = 30), so NO warning dialog
      //    (would have falsely warned 125 - 0 = 125 if suggestedPrevious were used).
      await _openReadingScreen(tester, adapter: adapter);
      await tester.enterText(find.byKey(const Key('reading-current')), '125');
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      expect(find.text('Check this reading'), findsNothing);
      expect(adapter.sent('PUT', '/meter-readings'), hasLength(1));

      // 2) Reopen and correct to 135: 135 - 100 = 35 (> 3 * 10 = 30), warns with 35 m³.
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('reading-current')), '135');
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      expect(find.text('Check this reading'), findsOneWidget);
      expect(
        find.text(
          'This is 35 m³, more than 3 times the usual use (about 10 m³). '
          'Check the meter before saving.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Save anyway'));
      await tester.pumpAndSettle();
      expect(adapter.sent('PUT', '/meter-readings'), hasLength(2));
    },
  );
}
