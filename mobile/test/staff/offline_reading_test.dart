import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/more/meters_screen.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';
import 'package:hodi/features/staff/staff_models.dart';

import 'helpers.dart';

void main() {
  testWidgets('with no connection the reading is kept on the phone, not lost', (
    tester,
  ) async {
    final dir = await tester.runAsync(
      () => Directory.systemTemp.createTemp('offline'),
    );
    addTearDown(() => tester.runAsync(() => dir!.delete(recursive: true)));
    final queue = ReadingQueue(dir!);
    final adapter = FakeAdapter({
      'GET /meter-readings/sheet': (_) => DropConnection(),
      'PUT /meter-readings': (_) => DropConnection(),
    });
    final meter = Meter.fromJson({
      'id': 'm1',
      'serialNo': 'W-1',
      'status': 'ACTIVE',
      'unit': {'number': 'A1'},
      'propertyId': 'p1',
      'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
      'lastReading': null,
    });
    phoneSize(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overridesFor(adapter, {
            'meters:view',
            'meters:create',
            'meters:update',
          }),
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
                          ReadingScreen(meter: meter, canSave: true),
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

    await tester.enterText(find.byKey(const Key('reading-current')), '123.4');
    await tester.runAsync(() async {
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pumpAndSettle();

    final pending = await tester.runAsync(queue.pending);
    expect(pending!.single.current, '123.4');
    expect(pending.single.meterId, 'm1');
    expect(find.textContaining('saved on this phone'), findsOneWidget);
  });
}
