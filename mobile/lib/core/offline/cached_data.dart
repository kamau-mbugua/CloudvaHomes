import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../auth/session.dart';
import '../auth/session_controller.dart';
import 'offline_cache.dart';

/// Live (`savedAt == null`) or cached (`savedAt != null`) data for offline-capable screens.
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

/// Owner key `"<userId>|<orgId>"` shared by `OfflineCache` and the offline queues.
String? cacheOwnerOf(Session? s) =>
    s == null ? null : '${s.user.id}|${s.activeOrganization?.id ?? ''}';

/// Only emits when the signed-in user or active organisation changes (never on token refresh).
final cacheOwnerProvider = Provider<String?>(
  (ref) =>
      ref.watch(sessionProvider.select((s) => cacheOwnerOf(s.valueOrNull))),
);

/// Resolves the active cache owner inside a provider without watching [sessionProvider]
/// (which would refetch every list on each token rotation).
Future<({String? owner, List<SessionProperty> sessionProps})>
resolveCacheContext(Ref ref) async {
  var owner = ref.watch(cacheOwnerProvider);
  final sessionSnap = ref.read(sessionProvider);
  final pendingSession = owner == null && sessionSnap.isLoading
      ? ref.read(sessionProvider.future)
      : null;
  var sessionProps =
      sessionSnap.valueOrNull?.properties ?? const <SessionProperty>[];
  if (pendingSession != null) {
    try {
      final loaded = await pendingSession;
      owner = cacheOwnerOf(loaded);
      sessionProps = loaded?.properties ?? const <SessionProperty>[];
    } on Object {
      owner = null;
    }
  }
  return (owner: owner, sessionProps: sessionProps);
}

/// Fetches a list of JSON rows, writes them to [OfflineCache] (fire-and-forget), and falls
/// back to the cached copy **only** on a network error (`e.isNetworkError`).
Future<Cached<T>> fetchRowsOrCached<T>(
  Ref ref, {
  required String cacheKey,
  required Future<List<Map<String, dynamic>>> Function() fetch,
  required T Function(
    List<Map<String, dynamic>> rows,
    List<SessionProperty> sessionProps,
  )
  parse,
  bool requireNonEmptyCache = false,
}) async {
  final cacheFuture = ref.read(offlineCacheProvider.future)..ignore();
  final ctx = await resolveCacheContext(ref);
  final owner = ctx.owner;
  final sessionProps = ctx.sessionProps;

  try {
    final rows = await fetch();
    if (owner != null) {
      unawaited(() async {
        try {
          final cache = await cacheFuture;
          await cache.write(owner, cacheKey, rows);
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
    if (hit == null || (requireNonEmptyCache && hit.rows.isEmpty)) rethrow;
    return Cached(parse(hit.rows, sessionProps), hit.savedAt);
  }
}

/// Fetches a single JSON object, stores it as a 1-row entry in [OfflineCache], and falls back
/// to the saved copy **only** on a network error (`e.isNetworkError`).
Future<Cached<T>> fetchObjectOrCached<T>(
  Ref ref, {
  required String cacheKey,
  required Future<Map<String, dynamic>> Function() fetch,
  required T Function(Map<String, dynamic> json) parse,
}) => fetchRowsOrCached(
  ref,
  cacheKey: cacheKey,
  requireNonEmptyCache: true,
  fetch: () async => [await fetch()],
  parse: (rows, _) => parse(rows.first),
);
