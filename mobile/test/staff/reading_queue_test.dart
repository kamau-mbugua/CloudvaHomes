import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_error.dart';
import 'package:hodi/features/staff/more/reading_queue.dart';

PendingReading reading({
  String current = '120.5',
  String meter = 'm1',
  String period = '2026-11',
}) => PendingReading(
  meterId: meter,
  propertyId: 'p1',
  period: period,
  current: current,
  savedAt: DateTime(2026, 11, 4),
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
}
