import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/api/api_error.dart';
import '../../../core/widgets/common.dart';
import '../inspections.dart';
import '../staff_api.dart';
import 'reading_queue.dart';

class PendingInspectionItem {
  PendingInspectionItem({
    required this.area,
    required this.condition,
    this.note,
    List<String>? photoUploadIds,
    List<String>? photoPaths,
  }) : photoUploadIds = photoUploadIds ?? [],
       photoPaths = photoPaths ?? [];

  final String area;
  final String condition;
  final String? note;
  final List<String> photoUploadIds;
  final List<String> photoPaths;

  Map<String, dynamic> toJson() => {
    'area': area,
    'condition': condition,
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
    'photoUploadIds': photoUploadIds,
    'photoPaths': photoPaths,
  };

  factory PendingInspectionItem.fromJson(Map<String, dynamic> j) =>
      PendingInspectionItem(
        area: j['area'] as String,
        condition: j['condition'] as String,
        note: j['note'] as String?,
        photoUploadIds: [
          for (final p in (j['photoUploadIds'] as List? ?? const []))
            p as String,
        ],
        photoPaths: [
          for (final p in (j['photoPaths'] as List? ?? const [])) p as String,
        ],
      );
}

/// A move-in or move-out inspection saved on the phone while offline (phase 19).
/// Saved by tenancyId and kind on the server, so re-sending is idempotent. [baseVersion] is
/// the version it was edited from ("none" for a new one): the server refuses it if the
/// inspection changed since, so offline work never overwrites newer work.
class PendingInspection {
  PendingInspection({
    required this.tenancyId,
    required this.kind,
    required this.inspectedOn,
    required this.items,
    required this.savedAt,
    this.notes,
    this.reopen = false,
    this.baseVersion,
    this.lastError,
  });

  final String tenancyId;
  final String kind;
  final String inspectedOn;
  final List<PendingInspectionItem> items;
  final DateTime savedAt;
  final String? notes;
  final bool reopen;
  final String? baseVersion;
  String? lastError;

  String get key => '$tenancyId|$kind';

  Map<String, dynamic> toJson() => {
    'tenancyId': tenancyId,
    'kind': kind,
    'inspectedOn': inspectedOn,
    'items': [for (final i in items) i.toJson()],
    'savedAt': savedAt.toIso8601String(),
    'notes': notes,
    'reopen': reopen,
    'baseVersion': baseVersion,
    'lastError': lastError,
  };

  factory PendingInspection.fromJson(Map<String, dynamic> j) =>
      PendingInspection(
        tenancyId: j['tenancyId'] as String,
        kind: j['kind'] as String,
        inspectedOn: j['inspectedOn'] as String,
        items: [
          for (final i in (j['items'] as List? ?? const []))
            PendingInspectionItem.fromJson(i as Map<String, dynamic>),
        ],
        savedAt: DateTime.parse(j['savedAt'] as String),
        notes: j['notes'] as String?,
        reopen: j['reopen'] == true,
        baseVersion: j['baseVersion'] as String?,
        lastError: j['lastError'] as String?,
      );
}

/// Inspections waiting to upload, kept in a JSON file (local photos beside it) so they
/// survive app restarts. One entry per `(tenancyId, kind)`: saving again replaces it.
class InspectionQueue {
  InspectionQueue(this.dir);
  final Directory dir;

  File get _file => File('${dir.path}/pending_inspections.json');
  Directory get _photos => Directory('${dir.path}/pending_inspection_photos');

  Future<List<PendingInspection>> pending() async {
    if (!await _file.exists()) return [];
    final raw = jsonDecode(await _file.readAsString()) as List;
    return [
      for (final j in raw)
        PendingInspection.fromJson(j as Map<String, dynamic>),
    ];
  }

  Future<void> _write(List<PendingInspection> list) async {
    await dir.create(recursive: true);
    final tmp = File('${_file.path}.tmp');
    await tmp.writeAsString(jsonEncode([for (final r in list) r.toJson()]));
    await tmp.rename(_file.path);
  }

  Future<void> _deletePhotos(PendingInspection p) async {
    for (final item in p.items) {
      for (final path in item.photoPaths) {
        final f = File(path);
        if (await f.exists()) await f.delete();
      }
    }
  }

  Future<void> enqueue(
    PendingInspection p, {
    Map<int, List<Uint8List>> localPhotos = const {},
  }) async {
    final list = await pending();
    for (final old in list.where((x) => x.key == p.key)) {
      await _deletePhotos(old);
    }
    list.removeWhere((x) => x.key == p.key);
    if (localPhotos.isNotEmpty) {
      await _photos.create(recursive: true);
      for (final entry in localPhotos.entries) {
        final areaIdx = entry.key;
        if (areaIdx < 0 || areaIdx >= p.items.length) continue;
        for (var j = 0; j < entry.value.length; j++) {
          final f = File(
            '${_photos.path}/${p.tenancyId}_${p.kind}_${areaIdx}_${j}_${p.savedAt.millisecondsSinceEpoch}.jpg',
          );
          await f.writeAsBytes(entry.value[j], flush: true);
          p.items[areaIdx].photoPaths.add(f.path);
        }
      }
    }
    list.add(p);
    await _write(list);
  }

  Future<void> remove(String tenancyId, String kind) async {
    final list = await pending();
    for (final old in list.where((x) => x.key == '$tenancyId|$kind')) {
      await _deletePhotos(old);
    }
    list.removeWhere((x) => x.key == '$tenancyId|$kind');
    await _write(list);
  }

  /// Sends what is waiting, oldest first. No connection stops the run and keeps everything;
  /// a server refusal (4xx/5xx) keeps that inspection with the server's message.
  Future<FlushResult> flush({
    required Future<String> Function(Uint8List jpeg) uploadPhoto,
    required Future<void> Function(
      PendingInspection p,
      List<InspectionItem> items,
    )
    save,
  }) async {
    final list = await pending()
      ..sort((a, b) => a.savedAt.compareTo(b.savedAt));
    var sent = 0;
    var failed = 0;
    // Photo files are deleted only after the queue file records their upload ids, so the app
    // being closed mid-run never loses a photo (at worst one is uploaded twice).
    final uploadedFiles = <String>[];
    try {
      for (final p in [...list]) {
        try {
          final resolvedItems = <InspectionItem>[];
          for (final item in p.items) {
            // One photo at a time, recording each upload as it lands: if the connection
            // drops part way, what went up is kept (by id) and the rest stays on the phone.
            for (final path in [...item.photoPaths]) {
              final f = File(path);
              if (await f.exists()) {
                item.photoUploadIds.add(
                  await uploadPhoto(await f.readAsBytes()),
                );
              }
              item.photoPaths.remove(path);
              uploadedFiles.add(path);
            }
            resolvedItems.add(
              InspectionItem(
                area: item.area,
                condition: item.condition,
                note: item.note,
                photoUploadIds: [...item.photoUploadIds],
              ),
            );
          }
          await save(p, resolvedItems);
          list.remove(p);
          sent++;
        } on ApiError catch (e) {
          if (e.isNetworkError) break;
          p.lastError = e.message;
          failed++;
        }
      }
    } finally {
      await _write(list);
      for (final path in uploadedFiles) {
        final f = File(path);
        if (await f.exists()) await f.delete();
      }
    }
    return FlushResult(sent: sent, failed: failed, remaining: list.length);
  }
}

final inspectionQueueProvider = FutureProvider<InspectionQueue>((ref) async {
  final support = await getApplicationSupportDirectory();
  return InspectionQueue(Directory('${support.path}/offline'));
});

final pendingInspectionsProvider = FutureProvider<List<PendingInspection>>((
  ref,
) async {
  final queue = await ref.watch(inspectionQueueProvider.future);
  return queue.pending();
});

/// Sends inspections saved offline; quietly does nothing without a connection.
Future<FlushResult?> flushPendingInspections(WidgetRef ref) async {
  try {
    final queue = await ref.read(inspectionQueueProvider.future);
    if ((await queue.pending()).isEmpty) return null;
    final api = ref.read(staffApiProvider);
    final result = await queue.flush(
      uploadPhoto: (jpeg) => api.upload('INSPECTION_PHOTO', jpeg),
      save: (p, items) async {
        await api.saveInspection(p.tenancyId, p.kind, {
          'inspectedOn': p.inspectedOn,
          'items': [for (final i in items) i.toJson()],
          if (p.notes != null && p.notes!.trim().isNotEmpty)
            'notes': p.notes!.trim(),
          if (p.reopen) 'reopen': true,
          if (p.baseVersion != null) 'baseVersion': p.baseVersion,
        });
      },
    );
    ref.invalidate(pendingInspectionsProvider);
    if (result.sent > 0) {
      ref.invalidate(todayProvider);
      ref.invalidate(dashboardProvider);
    }
    return result;
  } catch (_) {
    return null;
  }
}

class PendingInspectionsBanner extends ConsumerStatefulWidget {
  const PendingInspectionsBanner({super.key});
  @override
  ConsumerState<PendingInspectionsBanner> createState() =>
      _PendingInspectionsBannerState();
}

class _PendingInspectionsBannerState
    extends ConsumerState<PendingInspectionsBanner> {
  bool _busy = false;

  Future<void> _upload() async {
    setState(() => _busy = true);
    final r = await flushPendingInspections(ref);
    if (!mounted) return;
    setState(() => _busy = false);
    if (r == null) return;
    showMessage(
      context,
      r.remaining == 0
          ? 'All inspections uploaded.'
          : r.sent == 0 && r.failed == 0
          ? 'Still no connection. They’ll upload later.'
          : '${r.sent} uploaded, ${r.remaining} still waiting.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending =
        ref.watch(pendingInspectionsProvider).value ??
        const <PendingInspection>[];
    if (pending.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final refused = pending.where((r) => r.lastError != null).toList();
    return Card(
      key: const Key('pending-inspections'),
      margin: const EdgeInsets.only(bottom: 12),
      color: scheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.cloud_upload_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${pending.length} ${pending.length == 1 ? 'inspection' : 'inspections'} waiting to upload',
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _upload,
                  child: Text(_busy ? 'Uploading…' : 'Upload now'),
                ),
              ],
            ),
            for (final p in refused)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${p.kind == 'MOVE_IN' ? 'Move-in' : 'Move-out'} (${p.inspectedOn})',
                ),
                subtitle: Text(
                  p.lastError!,
                  style: TextStyle(color: scheme.error),
                ),
                trailing: TextButton(
                  onPressed: () async {
                    final queue = await ref.read(
                      inspectionQueueProvider.future,
                    );
                    await queue.remove(p.tenancyId, p.kind);
                    ref.invalidate(pendingInspectionsProvider);
                  },
                  child: const Text('Discard'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
