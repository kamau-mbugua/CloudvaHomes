import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../../core/widgets/stk_sheet.dart';
import 'calendar_rules.dart';
import 'host_models.dart';

/// Picks a photo via `image_picker` with `maxWidth: 1600, imageQuality: 80`.
/// Lets the host pick listing photos: one from the camera, or several from the gallery
/// (at most [limit]). Each is resized to 1600 px. Empty when cancelled.
Future<List<Uint8List>> pickHostPhotos(
  BuildContext context, {
  int limit = 20,
}) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null || limit <= 0) return const [];
  try {
    final picker = ImagePicker();
    final List<XFile> files;
    if (source == ImageSource.camera || limit == 1) {
      final one = await picker.pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
      );
      files = one == null ? const [] : [one];
    } else {
      files = await picker.pickMultiImage(
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
        limit: limit,
      );
    }
    return [for (final f in files.take(limit)) await f.readAsBytes()];
  } catch (_) {
    if (context.mounted) {
      showMessage(
        context,
        'Couldn’t open the ${source == ImageSource.camera ? 'camera' : 'gallery'}. Check the app’s permissions in Settings.',
      );
    }
    return const [];
  }
}

class HostApi {
  HostApi(this._api);
  final ApiClient _api;

  PageResult<T> _page<T>(
    Map<String, dynamic> res,
    T Function(Map<String, dynamic>) parse,
  ) {
    final rows = res['data'] as List? ?? const [];
    final meta = res['meta'] as Map<String, dynamic>? ?? const {};
    final page = (meta['page'] as num?)?.toInt() ?? 1;
    final pages = (meta['pages'] as num?)?.toInt() ?? 1;
    return (
      rows: [
        for (final r in rows)
          if (r is Map<String, dynamic>) parse(r),
      ],
      hasMore: page < pages,
    );
  }

  Future<HostSite> site() async {
    final res = await _api.get('/host/site');
    return HostSite.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostSite> updateSite(Map<String, Object?> body) async {
    final res = await _api.patch('/host/site', body: body);
    return HostSite.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<({bool available, String? problem})> checkSlug(String slug) async {
    final res = await _api.get(
      '/host/site/slug-check',
      query: {'slug': slug.trim()},
    );
    final data = res['data'] as Map<String, dynamic>;
    return (
      available: data['available'] == true,
      problem: data['problem'] as String?,
    );
  }

  Future<HostSite> uploadSiteLogo(Uint8List bytes) async {
    final res = await _api.upload(
      '/host/site/logo',
      () => FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: 'logo.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      }),
    );
    return HostSite.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<List<HostListing>> listings({
    String? propertyId,
    bool? published,
  }) async {
    final res = await _api.get(
      '/host/listings',
      query: {
        'pageSize': 100,
        if (propertyId != null && propertyId.isNotEmpty)
          'propertyId': propertyId,
        if (published != null) 'published': published.toString(),
      },
    );
    final rows = res['data'] as List? ?? const [];
    return [
      for (final r in rows)
        if (r is Map<String, dynamic>) HostListing.fromJson(r),
    ];
  }

  Future<HostListing> listing(String id) async {
    final res = await _api.get('/host/listings/$id');
    return HostListing.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostListing> createListing(Map<String, Object?> body) async {
    final res = await _api.post('/host/listings', body: body);
    return HostListing.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostListing> updateListing(
    String id,
    Map<String, Object?> body,
  ) async {
    final res = await _api.patch('/host/listings/$id', body: body);
    return HostListing.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<void> deleteListing(String id) => _api.delete('/host/listings/$id');

  Future<ListingPhoto> uploadListingPhoto(
    String listingId,
    Uint8List bytes, {
    String? caption,
  }) async {
    final res = await _api.upload(
      '/host/listings/$listingId/photos',
      () => FormData.fromMap({
        if (caption != null && caption.trim().isNotEmpty)
          'caption': caption.trim(),
        'file': MultipartFile.fromBytes(
          bytes,
          filename: 'photo.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      }),
    );
    return ListingPhoto.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<List<ListingPhoto>> reorderListingPhotos(
    String listingId,
    List<String> photoIds,
  ) async {
    final res = await _api.put(
      '/host/listings/$listingId/photos/order',
      body: {'photoIds': photoIds},
    );
    final rows = res['data'] as List? ?? const [];
    return [
      for (final r in rows)
        if (r is Map<String, dynamic>) ListingPhoto.fromJson(r),
    ];
  }

  Future<void> deleteListingPhoto(String listingId, String photoId) =>
      _api.delete('/host/listings/$listingId/photos/$photoId');

  Future<List<SpecialPrice>> replaceSpecialPrices(
    String listingId,
    List<Map<String, Object?>> items,
  ) async {
    final res = await _api.put(
      '/host/listings/$listingId/special-prices',
      body: {'items': items},
    );
    final rows = res['data'] as List? ?? const [];
    return [
      for (final r in rows)
        if (r is Map<String, dynamic>) SpecialPrice.fromJson(r),
    ];
  }

  Future<List<({String id, String code, String name})>> properties() async {
    final res = await _api.get(
      '/properties',
      query: {'status': 'ACTIVE', 'pageSize': 100},
    );
    final rows = res['data'] as List? ?? const [];
    return [
      for (final r in rows)
        if (r is Map<String, dynamic>)
          (
            id: r['id'] as String,
            code: (r['code'] as String?) ?? '',
            name: (r['name'] as String?) ?? '',
          ),
    ];
  }

  Future<PageResult<HostBooking>> bookings({
    int page = 1,
    String? propertyId,
    String? status,
    String? q,
  }) async {
    final res = await _api.get(
      '/host/bookings',
      query: {
        'page': page,
        'pageSize': 25,
        if (propertyId != null && propertyId.isNotEmpty)
          'propertyId': propertyId,
        if (status != null && status.isNotEmpty) 'status': status,
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      },
    );
    return _page(res, HostBooking.fromJson);
  }

  /// Money → Receipts: stay payments and refunds, newest first.
  Future<PageResult<HostStayReceipt>> stayReceipts({
    int page = 1,
    String? q,
  }) async {
    final res = await _api.get(
      '/host/stay-payments',
      query: {
        'page': page,
        'pageSize': 25,
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      },
    );
    return _page(res, HostStayReceipt.fromJson);
  }

  Future<HostBooking> booking(String id) async {
    final res = await _api.get('/host/bookings/$id');
    return HostBooking.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostQuote> quote({
    required String listingId,
    required String checkIn,
    required String checkOut,
    required int guests,
  }) async {
    final res = await _api.post(
      '/host/bookings/quote',
      body: {
        'listingId': listingId,
        'checkIn': checkIn,
        'checkOut': checkOut,
        'guests': guests,
      },
    );
    return HostQuote.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostBooking> createBooking(Map<String, Object?> body) async {
    final res = await _api.post('/host/bookings', body: body);
    return HostBooking.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostBooking> bookingAction(
    String id,
    String action, {
    Map<String, Object?>? body,
  }) async {
    final res = await _api.post('/host/bookings/$id/$action', body: body);
    return HostBooking.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<({int suggestedRefundCents, HostBooking? booking})> cancelBooking(
    String id, {
    required bool dryRun,
    String? refundAmountMinor,
    String? reason,
  }) async {
    final res = await _api.post(
      '/host/bookings/$id/cancel',
      body: {
        'dryRun': dryRun,
        'refundAmount': ?refundAmountMinor,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
    final data = res['data'] as Map<String, dynamic>;
    final suggested = hostMinorToInt(
      data['suggestedRefund'] ?? data['refundAmount'],
    );
    return (
      suggestedRefundCents: suggested,
      booking: dryRun ? null : HostBooking.fromJson(data),
    );
  }

  Future<void> recordStayPayment(
    String bookingId,
    Map<String, Object?> body,
  ) async {
    await _api.post('/host/bookings/$bookingId/payments', body: body);
  }

  Future<StkStatus> sendMpesaPrompt(
    String bookingId, {
    int? amountCents,
    String? phone,
    String? key,
  }) async {
    final res = await _api.post(
      '/host/bookings/$bookingId/mpesa-prompt',
      body: {
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        if (amountCents != null) 'amount': amountCents.toString(),
      },
      headers: key != null ? {'Idempotency-Key': key} : null,
    );
    final data = res['data'] as Map<String, dynamic>? ?? res;
    return StkStatus.fromJson(data);
  }

  Future<StkStatus> stkStatus(String id) async {
    final res = await _api.get('/stk-requests/$id');
    final data = res['data'] as Map<String, dynamic>? ?? res;
    return StkStatus.fromJson(data);
  }

  Future<
    ({
      List<({String id, String number, String? listingId, String title})> units,
      List<CalItem> items,
    })
  >
  calendar({
    required String from,
    required String to,
    String? propertyId,
  }) async {
    final res = await _api.get(
      '/host/bookings/calendar',
      query: {
        'from': from,
        'to': to,
        if (propertyId != null && propertyId.isNotEmpty)
          'propertyId': propertyId,
      },
    );
    final data = res['data'] as Map<String, dynamic>? ?? const {};
    final unitRows = data['units'] as List? ?? const [];
    final itemRows = data['items'] as List? ?? const [];
    return (
      units: [
        for (final u in unitRows)
          if (u is Map<String, dynamic>)
            (
              id: (u['id'] as String?) ?? '',
              number: (u['number'] as String?) ?? '',
              listingId: u['listingId'] as String?,
              title: (u['title'] as String?) ?? (u['number'] as String?) ?? '',
            ),
      ],
      items: [
        for (final it in itemRows)
          if (it is Map<String, dynamic>) CalItem.fromJson(it),
      ],
    );
  }

  Future<void> createBlock({
    required String unitId,
    required String fromDate,
    required String toDate,
    String? reason,
  }) async {
    await _api.post(
      '/host/blocks',
      body: {
        'unitId': unitId,
        'fromDate': fromDate,
        'toDate': toDate,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
  }

  Future<void> deleteBlock(String id) => _api.delete('/host/blocks/$id');

  Future<PageResult<HostCleaningTask>> cleaningTasks({
    int page = 1,
    String status = 'OPEN',
    String? propertyId,
  }) async {
    final res = await _api.get(
      '/host/cleaning',
      query: {
        'page': page,
        'pageSize': 25,
        'status': status,
        if (propertyId != null && propertyId.isNotEmpty)
          'propertyId': propertyId,
      },
    );
    return _page(res, HostCleaningTask.fromJson);
  }

  Future<void> markCleaningDone(String id, {String? note}) async {
    await _api.post(
      '/host/cleaning/$id/done',
      body: {if (note != null && note.trim().isNotEmpty) 'note': note.trim()},
    );
  }

  Future<void> createCleaningTask({
    required String unitId,
    String? note,
  }) async {
    await _api.post(
      '/host/cleaning',
      body: {
        'unitId': unitId,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
  }

  Future<PageResult<HostGuest>> guests({int page = 1, String? q}) async {
    final res = await _api.get(
      '/host/guests',
      query: {
        'page': page,
        'pageSize': 25,
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      },
    );
    return _page(res, HostGuest.fromJson);
  }

  Future<HostGuest> guest(String id) async {
    final res = await _api.get('/host/guests/$id');
    return HostGuest.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostGuest> updateGuest(String id, Map<String, Object?> body) async {
    final res = await _api.patch('/host/guests/$id', body: body);
    return HostGuest.fromJson(res['data'] as Map<String, dynamic>);
  }

  Future<HostReportSummary> reportSummary({
    required String from,
    required String to,
    String? propertyId,
  }) async {
    final res = await _api.get(
      '/host/reports/summary',
      query: {
        'from': from,
        'to': to,
        if (propertyId != null && propertyId.isNotEmpty)
          'propertyId': propertyId,
      },
    );
    return HostReportSummary.fromJson(res['data'] as Map<String, dynamic>);
  }
}

final hostApiProvider = Provider<HostApi>(
  (ref) => HostApi(ref.watch(apiClientProvider)),
);

final hostListingsProvider = FutureProvider.autoDispose<List<HostListing>>(
  (ref) => ref.watch(hostApiProvider).listings(),
);

final hostSiteProvider = FutureProvider.autoDispose<HostSite>(
  (ref) => ref.watch(hostApiProvider).site(),
);
