import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

typedef CachedRows = ({List<Map<String, dynamic>> rows, DateTime savedAt});

/// Keyed local store of raw API row lists (`<app support>/offline/offline_cache.json`)
/// so the caretaker meters screens remain usable when signal drops mid-shift.
class OfflineCache {
  OfflineCache(this.dir);
  final Directory dir;

  static const maxAge = Duration(days: 31);

  File get _file => File('${dir.path}/offline_cache.json');

  /// Returns `(rows, savedAt)` for [owner] and [key], or `null` when missing, owned by
  /// someone else, or unreadable/corrupt. Never throws.
  Future<CachedRows?> read(String owner, String key) async {
    try {
      if (!_file.existsSync()) return null;
      final decoded = jsonDecode(_file.readAsStringSync());
      if (decoded is! Map<String, dynamic>) return null;
      if (decoded['owner'] != owner) return null;
      final entries = decoded['entries'];
      if (entries is! Map<String, dynamic>) return null;
      final entry = entries[key];
      if (entry is! Map<String, dynamic>) return null;
      final savedAtRaw = entry['savedAt'];
      final rowsRaw = entry['rows'];
      if (savedAtRaw is! String || rowsRaw is! List) return null;
      final savedAt = DateTime.tryParse(savedAtRaw);
      if (savedAt == null) return null;
      final rows = <Map<String, dynamic>>[];
      for (final item in rowsRaw) {
        if (item is! Map<String, dynamic>) return null;
        rows.add(item);
      }
      return (rows: rows, savedAt: savedAt);
    } on Object {
      return null;
    }
  }

  /// Stores [rows] under [key] for [owner], replacing all entries when the stored owner
  /// differs and dropping entries older than 31 days. Writes atomically via `.tmp` rename.
  Future<void> write(
    String owner,
    String key,
    List<Map<String, dynamic>> rows, {
    DateTime? now,
  }) async {
    final stamp = (now ?? DateTime.now()).toUtc();
    final cutoff = stamp.subtract(maxAge);
    final entries = <String, Map<String, dynamic>>{};
    try {
      if (_file.existsSync()) {
        final decoded = jsonDecode(_file.readAsStringSync());
        if (decoded is Map<String, dynamic> &&
            decoded['owner'] == owner &&
            decoded['entries'] is Map<String, dynamic>) {
          for (final e
              in (decoded['entries'] as Map<String, dynamic>).entries) {
            final v = e.value;
            if (v is Map<String, dynamic> &&
                v['savedAt'] is String &&
                v['rows'] is List) {
              final savedAt = DateTime.tryParse(v['savedAt'] as String);
              if (savedAt != null && !savedAt.toUtc().isBefore(cutoff)) {
                entries[e.key] = v;
              }
            }
          }
        }
      }
    } on Object {
      entries.clear();
    }
    entries[key] = {'savedAt': stamp.toIso8601String(), 'rows': rows};
    dir.createSync(recursive: true);
    final tmp = File('${_file.path}.tmp');
    tmp.writeAsStringSync(jsonEncode({'owner': owner, 'entries': entries}));
    tmp.renameSync(_file.path);
  }

  /// Deletes the cache file if present.
  Future<void> clear() async {
    if (_file.existsSync()) _file.deleteSync();
  }
}

final offlineCacheProvider = FutureProvider<OfflineCache>((ref) async {
  final support = await getApplicationSupportDirectory();
  return OfflineCache(Directory('${support.path}/offline'));
});
