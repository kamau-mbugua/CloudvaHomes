import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/offline/cached_data.dart';
import '../staff_api.dart';
import '../staff_models.dart';

export '../../../core/offline/cached_data.dart' show Cached, oldestSavedAt;

final meterPropertiesProvider =
    FutureProvider.autoDispose<Cached<List<PropertyOption>>>((ref) async {
      final api = ref.watch(staffApiProvider);
      return fetchRowsOrCached(
        ref,
        cacheKey: 'properties',
        fetch: api.propertyRows,
        parse: (rows, sessionProps) => mergeSessionProperties(sessionProps, [
          for (final r in rows) PropertyOption.fromJson(r),
        ]),
      );
    });

final meterListProvider = FutureProvider.autoDispose
    .family<Cached<List<Meter>>, String>((ref, propertyId) async {
      final api = ref.watch(staffApiProvider);
      return fetchRowsOrCached(
        ref,
        cacheKey: 'meters|$propertyId',
        fetch: () => api.meterRows(propertyId),
        parse: (rows, _) => [for (final r in rows) Meter.fromJson(r)],
      );
    });

final readingSheetProvider = FutureProvider.autoDispose
    .family<
      Cached<List<SheetRow>>,
      ({String propertyId, String chargeTypeId, String period})
    >((ref, k) async {
      final api = ref.watch(staffApiProvider);
      return fetchRowsOrCached(
        ref,
        cacheKey: 'sheet|${k.propertyId}|${k.chargeTypeId}|${k.period}',
        fetch: () => api.sheetRows(
          propertyId: k.propertyId,
          chargeTypeId: k.chargeTypeId,
          period: k.period,
        ),
        parse: (rows, _) => [for (final r in rows) SheetRow.fromJson(r)],
      );
    });
