import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/more/meter_ocr.dart';
import 'package:hodi/features/staff/more/meters_screen.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';
import 'package:hodi/features/staff/staff_models.dart';

import 'helpers.dart';

/// Valid 1×1 PNG so `PhotoField`'s `Image.memory` decodes cleanly in widget tests.
final Uint8List _fakePhoto1 = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);
final Uint8List _fakePhoto2 = Uint8List.fromList(_fakePhoto1);

class _FakeOcr implements MeterOcr {
  _FakeOcr(this._handler);
  final Future<String?> Function(Uint8List jpeg) _handler;

  @override
  Future<String?> readText(Uint8List jpeg) => _handler(jpeg);
}

Meter _waterMeter() => Meter.fromJson({
  'id': 'm1',
  'serialNo': 'WM-20190815',
  'status': 'ACTIVE',
  'unit': {'number': 'A1'},
  'property': {'id': 'p1'},
  'chargeType': {'id': 'c1', 'name': 'Water', 'unitLabel': 'm³'},
  'lastReading': null,
});

Map<String, Object?> _sheetResponse({
  String suggestedPrevious = '1200.000',
  String? averageUse = '50.000',
}) => {
  'data': [
    {
      'meter': {'id': 'm1', 'serialNo': 'WM-20190815'},
      'unit': {'id': 'u1', 'number': 'A1'},
      'suggestedPrevious': suggestedPrevious,
      'averageUse': averageUse,
      'reading': null,
    },
  ],
};

Future<void> _openReadingScreen(
  WidgetTester tester, {
  required FakeAdapter adapter,
  required MeterOcr ocr,
  required MeterPhotoPicker picker,
  ReadingQueue? queue,
}) async {
  phoneSize(tester);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [
        ...overridesFor(adapter, {
          'meters:view',
          'meters:create',
          'meters:update',
        }),
        meterOcrProvider.overrideWithValue(ocr),
        meterPhotoPickerProvider.overrideWithValue(picker),
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

Map<String, dynamic> _savedRow(FakeAdapter adapter) {
  final puts = adapter.sent('PUT', '/meter-readings');
  expect(puts, hasLength(1));
  final body = jsonDecode(jsonEncode(puts.single.data)) as Map<String, dynamic>;
  return (body['readings'] as List).single as Map<String, dynamic>;
}

void main() {
  testWidgets(
    'readable photo shows suggestion; Use fills the field and Save sends ocrUsed: true without ocrEdited',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) async => 'SN 20190815\n01234.5'),
        picker: (_) async => _fakePhoto1,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('ocr-suggestion')), findsOneWidget);
      expect(find.text('Suggested from photo: 1234.5 m³'), findsOneWidget);

      await tester.tap(find.widgetWithText(TextButton, 'Use'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);
      final field = tester.widget<TextField>(
        find.byKey(const Key('reading-current')),
      );
      expect(field.controller!.text, '1234.5');

      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      final saved = _savedRow(adapter);
      expect(saved['current'], '1234.5');
      expect(saved['photoUploadId'], 'up-1');
      expect(saved['ocrUsed'], isTrue);
      expect(saved.containsKey('ocrEdited'), isFalse);
    },
  );

  testWidgets(
    'Use then changing the number sends ocrUsed: true and ocrEdited: true',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) async => '01234.5'),
        picker: (_) async => _fakePhoto1,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Use'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('reading-current')), '1235');
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      final saved = _savedRow(adapter);
      expect(saved['current'], '1235');
      expect(saved['ocrUsed'], isTrue);
      expect(saved['ocrEdited'], isTrue);
    },
  );

  testWidgets(
    'Use then retyping the same number differently (1234.5 → 1234.50) is not an edit',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) async => '01234.5'),
        picker: (_) async => _fakePhoto1,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Use'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('reading-current')),
        '1234.50',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      final saved = _savedRow(adapter);
      expect(saved['ocrUsed'], isTrue);
      expect(saved.containsKey('ocrEdited'), isFalse);
    },
  );

  testWidgets(
    'Ignore hides the suggestion; typing and saving sends neither OCR flag',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) async => '01234.5'),
        picker: (_) async => _fakePhoto1,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ocr-suggestion')), findsOneWidget);

      await tester.tap(find.widgetWithText(TextButton, 'Ignore'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);

      // Even typing the exact number OCR suggested by hand without Use is not OCR.
      await tester.enterText(
        find.byKey(const Key('reading-current')),
        '1234.5',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();

      final saved = _savedRow(adapter);
      expect(saved['current'], '1234.5');
      expect(saved.containsKey('ocrUsed'), isFalse);
      expect(saved.containsKey('ocrEdited'), isFalse);
    },
  );

  testWidgets(
    'OCR returning null or throwing synchronously/asynchronously shows no row and still saves cleanly',
    (tester) async {
      // 1) Returns null.
      final adapter1 = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter1,
        ocr: _FakeOcr((_) async => null),
        picker: (_) async => _fakePhoto1,
      );
      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);
      expect(find.text('Reading the photo…'), findsNothing);

      await tester.enterText(find.byKey(const Key('reading-current')), '1210');
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();
      expect(_savedRow(adapter1).containsKey('ocrUsed'), isFalse);

      // 2) Throws from readText inside the real screen code.
      final adapter2 = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-2'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      var call = 0;
      await _openReadingScreen(
        tester,
        adapter: adapter2,
        ocr: _FakeOcr((_) {
          call++;
          if (call == 1) throw StateError('sync recogniser crash');
          return Future<String?>.error(Exception('async recogniser crash'));
        }),
        picker: (_) async => call == 0 ? _fakePhoto1 : _fakePhoto2,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);
      expect(find.text('Reading the photo…'), findsNothing);

      await tester.tap(find.byTooltip('Change photo'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);
      expect(find.text('Reading the photo…'), findsNothing);

      await tester.enterText(find.byKey(const Key('reading-current')), '1215');
      await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
      await tester.pumpAndSettle();
      final saved = _savedRow(adapter2);
      expect(saved['current'], '1215');
      expect(saved.containsKey('ocrUsed'), isFalse);
      expect(saved.containsKey('ocrEdited'), isFalse);
    },
  );

  testWidgets('slow OCR longer than 5 seconds gives up and shows no row', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /meter-readings/sheet': (_) => _sheetResponse(),
    });
    await _openReadingScreen(
      tester,
      adapter: adapter,
      ocr: _FakeOcr(
        (_) => Future<String?>.delayed(
          const Duration(seconds: 7),
          () => '01234.5',
        ),
      ),
      picker: (_) async => _fakePhoto1,
    );

    await tester.tap(find.text('Add a photo of the meter'));
    await tester.pump();
    expect(find.text('Reading the photo…'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5, milliseconds: 50));
    expect(find.text('Reading the photo…'), findsNothing);
    expect(find.byKey(const Key('ocr-suggestion')), findsNothing);

    // Let the underlying 7s future finish: still no suggestion row.
    await tester.pump(const Duration(seconds: 3));
    expect(find.byKey(const Key('ocr-suggestion')), findsNothing);
  });

  testWidgets(
    'a slow OCR result arriving after the photo was removed or replaced is dropped',
    (tester) async {
      final first = Completer<String?>();
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) => first.future),
        picker: (_) async => _fakePhoto1,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pump();
      expect(find.text('Reading the photo…'), findsOneWidget);

      await tester.tap(find.byTooltip('Remove photo'));
      await tester.pump();
      expect(find.text('Reading the photo…'), findsNothing);

      first.complete('01234.5');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);

      // Replace photo before first OCR finishes: stale result is dropped, new one wins.
      final stale = Completer<String?>();
      final fresh = Completer<String?>();
      var pickCount = 0;
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr(
          (bytes) =>
              identical(bytes, _fakePhoto1) ? stale.future : fresh.future,
        ),
        picker: (_) async => (++pickCount == 1) ? _fakePhoto1 : _fakePhoto2,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pump();
      expect(find.text('Reading the photo…'), findsOneWidget);

      await tester.tap(find.byTooltip('Change photo'));
      await tester.pump();

      stale.complete('01234.5');
      await tester.pump();
      expect(find.byKey(const Key('ocr-suggestion')), findsNothing);
      expect(find.text('Reading the photo…'), findsOneWidget);

      fresh.complete('01250');
      await tester.pumpAndSettle();
      expect(find.text('Suggested from photo: 1250 m³'), findsOneWidget);
    },
  );

  testWidgets(
    'no connection after Use stores PendingReading with ocrUsed == true',
    (tester) async {
      final dir = await tester.runAsync(
        () => Directory.systemTemp.createTemp('ocr_offline'),
      );
      addTearDown(() => tester.runAsync(() => dir!.delete(recursive: true)));
      final queue = ReadingQueue(dir!);
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) => _sheetResponse(),
        'POST /uploads': (_) => DropConnection(),
        'PUT /meter-readings': (_) => DropConnection(),
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) async => '01234.5'),
        picker: (_) async => _fakePhoto1,
        queue: queue,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Use'));
      await tester.pumpAndSettle();

      await tester.runAsync(() async {
        await tester.tap(find.widgetWithText(FilledButton, 'Save reading'));
        final deadline = DateTime.now().add(const Duration(seconds: 3));
        while ((await queue.pending()).isEmpty &&
            DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await tester.pumpAndSettle();

      final pending = (await tester.runAsync(queue.pending))!.single;
      expect(pending.current, '1234.5');
      expect(pending.ocrUsed, isTrue);
      expect(pending.ocrEdited, isFalse);
    },
  );

  testWidgets(
    'an OCR suggestion that makes use unusual still shows "Check this reading" on Save',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /meter-readings/sheet': (_) =>
            _sheetResponse(suggestedPrevious: '100.000', averageUse: '10.000'),
        'POST /uploads': (_) => {
          'data': {'id': 'up-1'},
        },
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      await _openReadingScreen(
        tester,
        adapter: adapter,
        ocr: _FakeOcr((_) async => '00145'),
        picker: (_) async => _fakePhoto1,
      );

      await tester.tap(find.text('Add a photo of the meter'));
      await tester.pumpAndSettle();
      expect(find.text('Suggested from photo: 145 m³'), findsOneWidget);

      await tester.tap(find.widgetWithText(TextButton, 'Use'));
      await tester.pumpAndSettle();

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

      await tester.tap(find.widgetWithText(FilledButton, 'Save anyway'));
      await tester.pumpAndSettle();

      final saved = _savedRow(adapter);
      expect(saved['current'], '145');
      expect(saved['ocrUsed'], isTrue);
      expect(saved.containsKey('ocrEdited'), isFalse);
    },
  );
}
