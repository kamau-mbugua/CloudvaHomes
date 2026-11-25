import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_error.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/features/staff/more/meters_screen.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';
import 'package:hodi/features/staff/staff_api.dart';

import 'helpers.dart';

PendingReading reading({
  String current = '120.5',
  String meter = 'm1',
  String period = '2026-11',
  String? owner,
}) => PendingReading(
  meterId: meter,
  propertyId: 'p1',
  period: period,
  current: current,
  savedAt: DateTime(2026, 11, 4),
  owner: owner,
);

void main() {
  late Directory dir;
  late ReadingQueue queue;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('readings');
    queue = ReadingQueue(dir);
  });
  tearDown(() => dir.delete(recursive: true));

  test('saving the same meter and month twice keeps only the latest', () async {
    await queue.enqueue(reading(current: '100'));
    await queue.enqueue(reading(current: '101'));
    final pending = await queue.pending();
    expect(pending.map((r) => r.current), ['101']);
  });

  test(
    'a flush that works uploads the photo, saves the reading and clears the queue',
    () async {
      await queue.enqueue(reading(), photo: Uint8List.fromList([1, 2, 3]));
      final photoPath = (await queue.pending()).single.photoPath!;
      expect(File(photoPath).existsSync(), isTrue);
      final saved = <String>[];
      final result = await queue.flush(
        owner: 'u1|o1',
        uploadPhoto: (bytes) async => 'up-1',
        save: (r, photoUploadId) async =>
            saved.add('${r.meterId}:${r.current}:$photoUploadId'),
      );
      expect(result.sent, 1);
      expect(result.remaining, 0);
      expect(saved, ['m1:120.5:up-1']);
      expect(File(photoPath).existsSync(), isFalse);
      expect(await queue.pending(), isEmpty);
    },
  );

  test('no connection: nothing is lost and no error is recorded', () async {
    await queue.enqueue(reading());
    final result = await queue.flush(
      owner: 'u1|o1',
      uploadPhoto: (bytes) async => 'unused',
      save: (r, id) async => throw ApiError.network(),
    );
    expect([result.sent, result.failed, result.remaining], [0, 0, 1]);
    expect((await queue.pending()).single.lastError, isNull);
  });

  test(
    'a reading the server refuses stays, with the server’s message',
    () async {
      await queue.enqueue(reading());
      final result = await queue.flush(
        owner: 'u1|o1',
        uploadPhoto: (bytes) async => 'unused',
        save: (r, id) async => throw ApiError(
          status: 409,
          code: 'ALREADY_BILLED',
          message: 'This month is already invoiced.',
        ),
      );
      expect([result.sent, result.failed, result.remaining], [0, 1, 1]);
      expect(
        (await queue.pending()).single.lastError,
        'This month is already invoiced.',
      );
    },
  );

  test('the queue survives a restart', () async {
    await queue.enqueue(reading(meter: 'm2'));
    final reopened = ReadingQueue(dir);
    expect((await reopened.pending()).single.meterId, 'm2');
  });

  test(
    'legacy JSON without ocrUsed/ocrEdited loads as false, and flush sends them when true',
    () async {
      final file = File('${dir.path}/pending_readings.json');
      await file.writeAsString(
        jsonEncode([
          {
            'meterId': 'm-legacy',
            'propertyId': 'p1',
            'period': '2026-11',
            'current': '99.5',
            'savedAt': '2026-11-04T00:00:00.000',
          },
        ]),
      );
      final legacy = (await queue.pending()).single;
      expect(legacy.ocrUsed, isFalse);
      expect(legacy.ocrEdited, isFalse);

      final adapter = FakeAdapter({
        'PUT /meter-readings': (_) => {
          'data': {'saved': 1},
        },
      });
      final api = StaffApi(fakeApi(adapter));
      await queue.enqueue(
        PendingReading(
          meterId: 'm-ocr',
          propertyId: 'p1',
          period: '2026-11',
          current: '150.25',
          savedAt: DateTime(2026, 11, 5),
          ocrUsed: true,
          ocrEdited: true,
        ),
      );
      final reopened = ReadingQueue(dir);
      final result = await reopened.flush(
        owner: 'u1|o1',
        uploadPhoto: (_) async => 'unused',
        save: (r, photoId) => api.saveReading(
          period: r.period,
          meterId: r.meterId,
          current: r.current,
          note: r.note,
          photoUploadId: photoId,
          ocrUsed: r.ocrUsed,
          ocrEdited: r.ocrEdited,
        ),
      );
      expect(result.sent, 2);
      final puts = adapter.sent('PUT', '/meter-readings');
      expect(puts, hasLength(2));
      final firstRow =
          ((jsonDecode(jsonEncode(puts[0].data)) as Map)['readings'] as List)
                  .single
              as Map;
      expect(firstRow.containsKey('ocrUsed'), isFalse);
      expect(firstRow.containsKey('ocrEdited'), isFalse);
      final secondRow =
          ((jsonDecode(jsonEncode(puts[1].data)) as Map)['readings'] as List)
                  .single
              as Map;
      expect(secondRow['ocrUsed'], isTrue);
      expect(secondRow['ocrEdited'], isTrue);
    },
  );

  test(
    'only the signed-in person\'s readings (and old unowned ones) are sent',
    () async {
      await queue.enqueue(reading(meter: 'm-mine', owner: 'u1|o1'));
      await queue.enqueue(reading(meter: 'm-old')); // saved before owners
      await queue.enqueue(reading(meter: 'm-other-user', owner: 'u2|o1'));
      await queue.enqueue(reading(meter: 'm-other-org', owner: 'u1|o2'));
      expect((await queue.pendingFor('u1|o1')).map((r) => r.meterId).toSet(), {
        'm-mine',
        'm-old',
      });
      final sent = <String>[];
      final result = await queue.flush(
        owner: 'u1|o1',
        uploadPhoto: (_) async => 'unused',
        save: (r, _) async => sent.add(r.meterId),
      );
      expect(sent.toSet(), {'m-mine', 'm-old'});
      expect([result.sent, result.failed, result.remaining], [2, 0, 0]);
      final left = await ReadingQueue(dir).pending();
      expect(left.map((r) => r.meterId).toSet(), {
        'm-other-user',
        'm-other-org',
      });
    },
  );

  test(
    'the pending list shows nothing signed out, and only your own signed in',
    () async {
      await queue.enqueue(reading(meter: 'm-mine', owner: 'u1|o1'));
      await queue.enqueue(reading(meter: 'm-other', owner: 'u2|o1'));

      final signedIn = ProviderContainer(
        overrides: [
          sessionProvider.overrideWith(
            () => FakeSession(staffSession({'meters:create'})),
          ),
          readingQueueProvider.overrideWith((ref) async => queue),
        ],
      );
      addTearDown(signedIn.dispose);
      await signedIn.read(sessionProvider.future);
      expect(
        (await signedIn.read(
          pendingReadingsProvider.future,
        )).map((r) => r.meterId),
        ['m-mine'],
      );

      final signedOut = ProviderContainer(
        overrides: [
          sessionProvider.overrideWith(() => _SignedOut()),
          readingQueueProvider.overrideWith((ref) async => queue),
        ],
      );
      addTearDown(signedOut.dispose);
      await signedOut.read(sessionProvider.future);
      expect(await signedOut.read(pendingReadingsProvider.future), isEmpty);
    },
  );
}

class _SignedOut extends SessionController {
  @override
  Future<Session?> build() async => null;
}
