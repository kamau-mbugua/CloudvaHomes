import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_error.dart';
import '../../../core/auth/session.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/offline/offline_cache.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import 'reading_queue.dart';

/// Live (`savedAt == null`) or cached (`savedAt != null`) data for the meters screens.
class Cached<T> {
  const Cached(this.value, [this.savedAt]);
  final T value;
  final DateTime? savedAt;
}

/// Oldest non-null timestamp among [stamps], or `null` when all data in view is live.
DateTime? oldestSavedAt(Iterable<DateTime?> stamps) {
  DateTime? oldest;
  for (final s in stamps) {
    if (s == null) continue;
    if (oldest == null || s.isBefore(oldest)) oldest = s;
  }
  return oldest;
}

Future<Cached<T>> _fetchOrCached<T>(
  Ref ref, {
  required String cacheKey,
  required Future<List<Json>> Function(StaffApi api) fetch,
  required T Function(List<Json> rows, List<SessionProperty> sessionProps)
  parse,
}) async {
  final api = ref.watch(staffApiProvider);
  var owner = ref.watch(queueOwnerProvider);
  final sessionSnap = ref.read(sessionProvider);
  final pendingSession = owner == null && sessionSnap.isLoading
      ? ref.read(sessionProvider.future)
      : null;
  final cacheFuture = ref.read(offlineCacheProvider.future)..ignore();

  var sessionProps =
      sessionSnap.valueOrNull?.properties ?? const <SessionProperty>[];
  if (pendingSession != null) {
    try {
      final loaded = await pendingSession;
      owner = queueOwnerOf(loaded);
      sessionProps = loaded?.properties ?? const <SessionProperty>[];
    } on Object {
      owner = null;
    }
  }

  try {
    final rows = await fetch(api);
    final cacheOwner = owner;
    if (cacheOwner != null) {
      unawaited(() async {
        try {
          final cache = await cacheFuture;
          await cache.write(cacheOwner, cacheKey, rows);
        } on Object {
          // A cache write failure must not fail the load.
        }
      }());
    }
    return Cached(parse(rows, sessionProps));
  } on ApiError catch (e) {
    if (!e.isNetworkError || owner == null) rethrow;
    CachedRows? hit;
    try {
      final cache = await cacheFuture;
      hit = await cache.read(owner, cacheKey);
    } on Object {
      hit = null;
    }
    if (hit == null) rethrow;
    return Cached(parse(hit.rows, sessionProps), hit.savedAt);
  }
}

final meterPropertiesProvider =
    FutureProvider.autoDispose<Cached<List<PropertyOption>>>((ref) async {
      return _fetchOrCached(
        ref,
        cacheKey: 'properties',
        fetch: (api) => api.propertyRows(),
        parse: (rows, sessionProps) => mergeSessionProperties(sessionProps, [
          for (final r in rows) PropertyOption.fromJson(r),
        ]),
      );
    });

final meterListProvider = FutureProvider.autoDispose
    .family<Cached<List<Meter>>, String>((ref, propertyId) async {
      return _fetchOrCached(
        ref,
        cacheKey: 'meters|$propertyId',
        fetch: (api) => api.meterRows(propertyId),
        parse: (rows, _) => [for (final r in rows) Meter.fromJson(r)],
      );
    });

final readingSheetProvider = FutureProvider.autoDispose
    .family<
      Cached<List<SheetRow>>,
      ({String propertyId, String chargeTypeId, String period})
    >((ref, k) async {
      return _fetchOrCached(
        ref,
        cacheKey: 'sheet|${k.propertyId}|${k.chargeTypeId}|${k.period}',
        fetch: (api) => api.sheetRows(
          propertyId: k.propertyId,
          chargeTypeId: k.chargeTypeId,
          period: k.period,
        ),
        parse: (rows, _) => [for (final r in rows) SheetRow.fromJson(r)],
      );
    });
