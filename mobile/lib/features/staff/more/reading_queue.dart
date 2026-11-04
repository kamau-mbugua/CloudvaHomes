import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/api/api_error.dart';

/// A meter reading saved on the phone while offline (phase 13). Readings are upserted by
/// meter and month on the server, so sending one again is harmless.
class PendingReading {
  PendingReading({
    required this.meterId,
    required this.propertyId,
    required this.period,
    required this.current,
    required this.savedAt,
    this.note,
    this.photoPath,
    this.lastError,
  });

  final String meterId;
  final String propertyId;
  final String period;
  final String current;
  final DateTime savedAt;
  final String? note;
  String? photoPath;
  String? lastError;

  String get key => '$meterId|$period';

  Map<String, dynamic> toJson() => {
    'meterId': meterId,
    'propertyId': propertyId,
    'period': period,
    'current': current,
    'savedAt': savedAt.toIso8601String(),
    'note': note,
    'photoPath': photoPath,
    'lastError': lastError,
  };

  factory PendingReading.fromJson(Map<String, dynamic> j) => PendingReading(
    meterId: j['meterId'] as String,
    propertyId: j['propertyId'] as String,
    period: j['period'] as String,
    current: j['current'] as String,
    savedAt: DateTime.parse(j['savedAt'] as String),
    note: j['note'] as String?,
    photoPath: j['photoPath'] as String?,
    lastError: j['lastError'] as String?,
  );
}

class FlushResult {
  const FlushResult({
    required this.sent,
    required this.failed,
    required this.remaining,
  });
  final int sent;
  final int failed;
  final int remaining;
}

/// Readings waiting to upload, kept in a JSON file (photos beside it) so they survive the
/// app being closed. One entry per meter and month: saving again replaces it.
class ReadingQueue {
  ReadingQueue(this.dir);
  final Directory dir;

  File get _file => File('${dir.path}/pending_readings.json');
  Directory get _photos => Directory('${dir.path}/pending_photos');

  Future<List<PendingReading>> pending() async {
    if (!await _file.exists()) return [];
    final raw = jsonDecode(await _file.readAsString()) as List;
    return [
      for (final j in raw) PendingReading.fromJson(j as Map<String, dynamic>),
    ];
  }

  Future<void> _write(List<PendingReading> list) async {
    await dir.create(recursive: true);
    final tmp = File('${_file.path}.tmp');
    await tmp.writeAsString(jsonEncode([for (final r in list) r.toJson()]));
    await tmp.rename(_file.path); // atomic: a crash never leaves half a file
  }

  Future<void> enqueue(PendingReading r, {Uint8List? photo}) async {
    final list = await pending();
    for (final old in list.where((x) => x.key == r.key)) {
      await _deletePhoto(old.photoPath);
    }
    list.removeWhere((x) => x.key == r.key);
    if (photo != null) {
      await _photos.create(recursive: true);
      final f = File(
        '${_photos.path}/${r.meterId}_${r.period}_${r.savedAt.millisecondsSinceEpoch}.jpg',
      );
      await f.writeAsBytes(photo, flush: true);
      r.photoPath = f.path;
    }
    list.add(r);
    await _write(list);
  }

  Future<void> remove(String meterId, String period) async {
    final list = await pending();
    for (final old in list.where((x) => x.key == '$meterId|$period')) {
      await _deletePhoto(old.photoPath);
    }
    list.removeWhere((x) => x.key == '$meterId|$period');
    await _write(list);
  }

  Future<void> _deletePhoto(String? path) async {
    if (path == null) return;
    final f = File(path);
    if (await f.exists()) await f.delete();
  }

  /// Sends what is waiting, oldest first. No connection stops the run and keeps everything;
  /// a refusal (e.g. the month is already billed) keeps that reading with the server's
  /// message so someone can fix or discard it.
  Future<FlushResult> flush({
    required Future<String> Function(Uint8List jpeg) uploadPhoto,
    required Future<void> Function(PendingReading r, String? photoUploadId)
    save,
  }) async {
    final list = await pending()
      ..sort((a, b) => a.savedAt.compareTo(b.savedAt));
    var sent = 0;
    var failed = 0;
    for (final r in [...list]) {
      try {
        String? photoId;
        if (r.photoPath != null && await File(r.photoPath!).exists()) {
          photoId = await uploadPhoto(await File(r.photoPath!).readAsBytes());
        }
        await save(r, photoId);
        await _deletePhoto(r.photoPath);
        list.remove(r);
        sent++;
      } on ApiError catch (e) {
        if (e.isNetworkError) break;
        r.lastError = e.message;
        failed++;
      }
    }
    await _write(list);
    return FlushResult(sent: sent, failed: failed, remaining: list.length);
  }
}

final readingQueueProvider = FutureProvider<ReadingQueue>((ref) async {
  final support = await getApplicationSupportDirectory();
  return ReadingQueue(Directory('${support.path}/offline'));
});
