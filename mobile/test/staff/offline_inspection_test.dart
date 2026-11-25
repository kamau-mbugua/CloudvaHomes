import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_error.dart';
import 'package:hodi/features/staff/more/inspection_queue.dart';
import 'package:hodi/features/staff/tenants/inspection_screen.dart';

import 'helpers.dart';

PendingInspection _sample({
  String tenancyId = 'ty1',
  String kind = 'MOVE_IN',
  String condition = 'GOOD',
}) => PendingInspection(
  tenancyId: tenancyId,
  kind: kind,
  inspectedOn: '2026-11-25',
  items: [
    PendingInspectionItem(area: 'Kitchen', condition: condition, note: 'Clean'),
  ],
  savedAt: DateTime(2026, 11, 25),
);

void main() {
  group('InspectionQueue', () {
    late Directory dir;
    late InspectionQueue queue;

    setUp(() async {
      dir = await Directory.systemTemp.createTemp('inspections');
      queue = InspectionQueue(dir);
    });

    tearDown(() => dir.delete(recursive: true));

    test(
      'saving the same tenancy and kind twice keeps only the latest',
      () async {
        await queue.enqueue(_sample(condition: 'GOOD'));
        await queue.enqueue(_sample(condition: 'FAIR'));
        final pending = await queue.pending();
        expect(pending.map((p) => p.items.single.condition), ['FAIR']);
      },
    );

    test(
      'a flush that works uploads local photos, saves the inspection and clears the queue',
      () async {
        await queue.enqueue(
          _sample(),
          localPhotos: {
            0: [
              Uint8List.fromList([1, 2, 3]),
            ],
          },
        );
        final photoPath =
            (await queue.pending()).single.items.single.photoPaths.single;
        expect(File(photoPath).existsSync(), isTrue);

        final saved = <String>[];
        final result = await queue.flush(
          uploadPhoto: (bytes) async => 'up-photo-1',
          save: (p, items) async => saved.add(
            '${p.tenancyId}:${p.kind}:${items.single.area}:${items.single.photoUploadIds.join(",")}',
          ),
        );
        expect(result.sent, 1);
        expect(result.remaining, 0);
        expect(saved, ['ty1:MOVE_IN:Kitchen:up-photo-1']);
        expect(File(photoPath).existsSync(), isFalse);
        expect(await queue.pending(), isEmpty);
      },
    );

    test(
      'a connection lost between photos keeps both: the sent one by id, the other on the phone',
      () async {
        await queue.enqueue(
          _sample(),
          localPhotos: {
            0: [
              Uint8List.fromList([1]),
              Uint8List.fromList([2]),
            ],
          },
        );
        final paths = [
          ...(await queue.pending()).single.items.single.photoPaths,
        ];
        var calls = 0;
        final first = await queue.flush(
          uploadPhoto: (_) async {
            calls++;
            if (calls == 2) throw ApiError.network();
            return 'up-1';
          },
          save: (_, _) async => fail('must not save with a photo missing'),
        );
        expect([first.sent, first.failed, first.remaining], [0, 0, 1]);
        final kept = (await queue.pending()).single.items.single;
        expect(kept.photoUploadIds, ['up-1']);
        expect(kept.photoPaths, [paths[1]]);
        expect(File(paths[0]).existsSync(), isFalse);
        expect(File(paths[1]).existsSync(), isTrue);

        final saved = <List<String>>[];
        final second = await queue.flush(
          uploadPhoto: (_) async => 'up-2',
          save: (_, items) async => saved.add(items.single.photoUploadIds),
        );
        expect(second.sent, 1);
        expect(saved, [
          ['up-1', 'up-2'],
        ]);
        expect(File(paths[1]).existsSync(), isFalse);
      },
    );

    test(
      'the version an edit started from is kept and survives old files',
      () async {
        final p = _sample();
        await queue.enqueue(
          PendingInspection(
            tenancyId: p.tenancyId,
            kind: p.kind,
            inspectedOn: p.inspectedOn,
            items: p.items,
            savedAt: p.savedAt,
            baseVersion: 'none',
          ),
        );
        expect((await queue.pending()).single.baseVersion, 'none');
        // A queue file written before versions existed still loads.
        final old = PendingInspection.fromJson({
          'tenancyId': 'ty2',
          'kind': 'MOVE_OUT',
          'inspectedOn': '2026-11-25',
          'items': <Object>[],
          'savedAt': '2026-11-25T00:00:00.000',
        });
        expect(old.baseVersion, isNull);
      },
    );

    test('no connection: nothing is lost and no error is recorded', () async {
      await queue.enqueue(_sample());
      final result = await queue.flush(
        uploadPhoto: (_) async => 'unused',
        save: (_, _) async => throw ApiError.network(),
      );
      expect([result.sent, result.failed, result.remaining], [0, 0, 1]);
      expect((await queue.pending()).single.lastError, isNull);
    });

    test(
      'an inspection the server refuses stays with the server message',
      () async {
        await queue.enqueue(_sample());
        final result = await queue.flush(
          uploadPhoto: (_) async => 'unused',
          save: (_, _) async => throw ApiError(
            status: 409,
            code: 'INSPECTION_ACKNOWLEDGED',
            message: 'Tenant already acknowledged this inspection.',
          ),
        );
        expect([result.sent, result.failed, result.remaining], [0, 1, 1]);
        expect(
          (await queue.pending()).single.lastError,
          'Tenant already acknowledged this inspection.',
        );
      },
    );
  });

  testWidgets(
    'with no connection the inspection is kept on the phone, not lost',
    (tester) async {
      final offlineDir = await tester.runAsync(
        () => Directory.systemTemp.createTemp('offline_insp'),
      );
      addTearDown(
        () => tester.runAsync(() => offlineDir!.delete(recursive: true)),
      );
      final offlineQueue = InspectionQueue(offlineDir!);
      final adapter = FakeAdapter({
        'GET /tenancies/ty1/inspections': (_) => {
          'data': [
            {
              'id': 'i1',
              'kind': 'MOVE_IN',
              'inspectedOn': '2026-11-25',
              'items': [
                {
                  'area': 'Kitchen',
                  'condition': 'GOOD',
                  'photoUploadIds': <String>[],
                },
              ],
              'notes': null,
              'inspectorName': null,
              'tenantAcknowledgedAt': null,
              'updatedAt': '2026-11-25T06:00:00.000Z',
            },
          ],
        },
        'PUT /tenancies/ty1/inspections/MOVE_IN': (_) => DropConnection(),
      });
      phoneSize(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...overridesFor(adapter, {'tenancies:view', 'tenancies:update'}),
            inspectionQueueProvider.overrideWith((ref) async => offlineQueue),
          ],
          child: MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const InspectionScreen(
                          tenancyId: 'ty1',
                          kind: 'MOVE_IN',
                          title: 'A1 · Grace Mwangi',
                        ),
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
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(ChoiceChip, 'Fair').first);
      await tester.pumpAndSettle();

      await tester.runAsync(() async {
        await tester.tap(find.text('Save inspection'));
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      await tester.pumpAndSettle();

      expect(
        adapter.sent('PUT', '/tenancies/ty1/inspections/MOVE_IN'),
        hasLength(1),
      );
      final pending = await tester.runAsync(offlineQueue.pending);
      expect(pending, hasLength(1));
      expect(pending!.single.tenancyId, 'ty1');
      expect(pending.single.kind, 'MOVE_IN');
      expect(pending.single.items.first.condition, 'FAIR');
      // Edited from the loaded version, so the server can refuse it if that changed.
      expect(pending.single.baseVersion, '2026-11-25T06:00:00.000Z');
      expect(
        (adapter.sent('PUT', '/tenancies/ty1/inspections/MOVE_IN').single.data
            as Map)['baseVersion'],
        '2026-11-25T06:00:00.000Z',
      );
      expect(find.textContaining('saved on this phone'), findsOneWidget);
    },
  );

  testWidgets(
    'opened offline, it counts as new, says so, and can\'t overwrite a saved one',
    (tester) async {
      final offlineDir = await tester.runAsync(
        () => Directory.systemTemp.createTemp('offline_insp_new'),
      );
      addTearDown(
        () => tester.runAsync(() => offlineDir!.delete(recursive: true)),
      );
      final offlineQueue = InspectionQueue(offlineDir!);
      final adapter = FakeAdapter({
        'GET /tenancies/ty1/inspections': (_) => DropConnection(),
        'PUT /tenancies/ty1/inspections/MOVE_IN': (_) => DropConnection(),
      });
      phoneSize(tester);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...overridesFor(adapter, {'tenancies:view', 'tenancies:update'}),
            inspectionQueueProvider.overrideWith((ref) async => offlineQueue),
          ],
          child: MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const InspectionScreen(
                          tenancyId: 'ty1',
                          kind: 'MOVE_IN',
                          title: 'A1 · Grace Mwangi',
                        ),
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
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('inspection-offline-note')), findsOneWidget);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Fair').first);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Save inspection'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();

      await tester.runAsync(() async {
        await tester.tap(find.text('Save inspection'));
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      await tester.pumpAndSettle();

      expect(
        adapter.sent('PUT', '/tenancies/ty1/inspections/MOVE_IN'),
        hasLength(1),
      );
      final pending = await tester.runAsync(offlineQueue.pending);
      expect(pending, hasLength(1));
      expect(pending!.single.tenancyId, 'ty1');
      expect(pending.single.kind, 'MOVE_IN');
      expect(pending.single.items.first.condition, 'FAIR');
      expect(pending.single.baseVersion, 'none');
      expect(find.byKey(const Key('inspection-offline-note')), findsNothing);
    },
  );
}
