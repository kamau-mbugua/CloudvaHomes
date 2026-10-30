import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config.dart';
import '../../core/providers.dart';
import '../../core/widgets/stk_sheet.dart';
import 'staff_models.dart';

/// Every staff-mode call, with the exact paths the web app uses. Unpaged endpoints never
/// get `pageSize` (the server answers 422).
class StaffApi {
  StaffApi(this._api);
  final ApiClient _api;

  static const pageSize = 20;

  Json _data(Json body) => body['data'] as Json;
  List<Json> _rows(Json body) => [
    for (final r in (body['data'] as List? ?? const []))
      if (r is Json) r,
  ];

  // ── dashboard
  Future<Dashboard> dashboard() async =>
      Dashboard.fromJson(_data(await _api.get('/reports/dashboard')));

  // ── properties (for pickers; paged, 100 is the most per page)
  Future<List<PropertyOption>> properties() async {
    final body = await _api.get(
      '/properties',
      query: {'status': 'ACTIVE', 'pageSize': 100},
    );
    return [for (final r in _rows(body)) PropertyOption.fromJson(r)];
  }

  // ── units
  Future<Page<UnitRow>> units({
    required int page,
    String? q,
    String? propertyId,
    String? occupancy,
  }) async => Page.from(
    await _api.get(
      '/units',
      query: {
        'page': page,
        'pageSize': pageSize,
        'q': q,
        'propertyId': propertyId,
        'occupancy': occupancy,
      },
    ),
    UnitRow.fromJson,
  );

  Future<UnitRow> unit(String id) async =>
      UnitRow.fromJson(_data(await _api.get('/units/$id')));

  Future<Tenancy> tenancy(String id) async =>
      Tenancy.fromJson(_data(await _api.get('/tenancies/$id')));

  // ── tenants
  Future<Page<Tenant>> tenants({required int page, String? q}) async =>
      Page.from(
        await _api.get(
          '/tenants',
          query: {'page': page, 'pageSize': pageSize, 'q': q},
        ),
        Tenant.fromJson,
      );

  Future<Tenant> tenant(String id) async =>
      Tenant.fromJson(_data(await _api.get('/tenants/$id')));

  Future<List<OpenInvoice>> openInvoices(String tenantId) async => [
    for (final r in _rows(await _api.get('/tenants/$tenantId/open-invoices')))
      OpenInvoice.fromJson(r),
  ];

  Future<Statement> statement(String tenantId) async =>
      Statement.fromJson(_data(await _api.get('/tenants/$tenantId/statement')));

  Future<SentMessage> remind(String tenantId) async => SentMessage.fromJson(
    _data(await _api.post('/tenants/$tenantId/reminder')),
  );

  // ── payments
  Future<Page<Payment>> payments({
    required int page,
    String? q,
    String? tenantId,
    int size = pageSize,
  }) async => Page.from(
    await _api.get(
      '/payments',
      query: {'page': page, 'pageSize': size, 'q': q, 'tenantId': tenantId},
    ),
    Payment.fromJson,
  );

  Future<Payment> payment(String id) async =>
      Payment.fromJson(_data(await _api.get('/payments/$id')));

  /// Records money received. Never retried automatically; the caller keeps [key] for a
  /// deliberate resubmit of the same payment.
  Future<Payment> recordPayment(Json body, String key) async =>
      Payment.fromJson(
        _data(
          await _api.post(
            '/payments',
            body: body,
            headers: {'Idempotency-Key': key},
          ),
        ),
      );

  Future<List<Channel>> activeChannels() async => [
    for (final r in _rows(
      await _api.get('/payment-channels', query: {'status': 'ACTIVE'}),
    ))
      Channel.fromJson(r),
  ];

  Future<StkStatus> stkPush({
    required String tenantId,
    required String channelId,
    required int amount,
    String? phone,
    required String key,
  }) async => StkStatus.fromJson(
    _data(
      await _api.post(
        '/stk-requests',
        body: {
          'tenantId': tenantId,
          'channelId': channelId,
          'amount': amount,
          'phone': ?phone,
        },
        headers: {'Idempotency-Key': key},
      ),
    ),
  );

  Future<StkStatus> stkStatus(String id) async =>
      StkStatus.fromJson(_data(await _api.get('/stk-requests/$id')));

  // ── invoices
  Future<Page<Invoice>> invoices({
    required int page,
    String? q,
    String? status,
    bool overdue = false,
    String? tenantId,
  }) async => Page.from(
    await _api.get(
      '/invoices',
      query: {
        'page': page,
        'pageSize': pageSize,
        'q': q,
        'status': status,
        'overdue': overdue ? 'true' : null,
        'tenantId': tenantId,
      },
    ),
    Invoice.fromJson,
  );

  Future<InvoiceDetail> invoice(String id) async =>
      InvoiceDetail.fromJson(_data(await _api.get('/invoices/$id')));

  // ── M-Pesa reconciliation
  Future<Page<Inbound>> inbound({
    required int page,
    String status = 'UNMATCHED',
  }) async => Page.from(
    await _api.get(
      '/inbound-transactions',
      query: {'page': page, 'pageSize': pageSize, 'status': status},
    ),
    Inbound.fromJson,
  );

  Future<Inbound> inboundOne(String id) async =>
      Inbound.fromJson(_data(await _api.get('/inbound-transactions/$id')));

  /// Records a payment from the transaction (oldest invoices first).
  Future<Inbound> assignInbound(String id, String tenantId) async =>
      Inbound.fromJson(
        _data(
          await _api.post(
            '/inbound-transactions/$id/assign',
            body: {'tenantId': tenantId},
          ),
        ),
      );

  Future<void> ignoreInbound(String id, String reason) =>
      _api.post('/inbound-transactions/$id/ignore', body: {'reason': reason});

  // ── meters (unpaged)
  Future<List<Meter>> meters(String propertyId) async => [
    for (final r in _rows(
      await _api.get('/meters', query: {'propertyId': propertyId}),
    ))
      Meter.fromJson(r),
  ];

  Future<List<SheetRow>> readingSheet({
    required String propertyId,
    required String chargeTypeId,
    required String period,
  }) async => [
    for (final r in _rows(
      await _api.get(
        '/meter-readings/sheet',
        query: {
          'propertyId': propertyId,
          'chargeTypeId': chargeTypeId,
          'period': period,
        },
      ),
    ))
      SheetRow.fromJson(r),
  ];

  Future<void> saveReading({
    required String period,
    required String meterId,
    required String current,
    String? note,
    String? photoUploadId,
  }) => _api.put(
    '/meter-readings',
    body: {
      'period': period,
      'readings': [
        {
          'meterId': meterId,
          'current': current,
          'note': ?note,
          'photoUploadId': ?photoUploadId,
        },
      ],
    },
  );

  // ── expenses
  Future<Page<Expense>> expenses({required int page, String? q}) async =>
      Page.from(
        await _api.get(
          '/expenses',
          query: {'page': page, 'pageSize': pageSize, 'q': q},
        ),
        Expense.fromJson,
      );

  Future<Expense> createExpense(Json body) async =>
      Expense.fromJson(_data(await _api.post('/expenses', body: body)));

  // ── uploads: `POST /uploads` (multipart `file` + `purpose`) → `{id}`, then the id goes
  // on the expense (`receiptUploadId`) or the reading (`photoUploadId`).
  Future<String> upload(String purpose, Uint8List jpeg) async {
    final body = await _api.upload(
      '/uploads',
      () => FormData.fromMap({
        'purpose': purpose,
        'file': MultipartFile.fromBytes(
          jpeg,
          filename: 'photo.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      }),
    );
    return _data(body)['id'] as String;
  }
}

final staffApiProvider = Provider(
  (ref) => StaffApi(ref.watch(apiClientProvider)),
);

/// The web app's origin: the API base without `/api/v1`.
String webOrigin([String? apiUrl]) {
  final raw = apiUrl ?? AppConfig.apiUrl;
  final trimmed = raw.replaceFirst(RegExp(r'/+$'), '');
  return trimmed.endsWith('/api/v1')
      ? trimmed.substring(0, trimmed.length - '/api/v1'.length)
      : trimmed;
}

/// "2026-10" in Nairobi (UTC+3, no daylight saving), the month the server bills.
String nairobiPeriod([DateTime? now]) {
  final d = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 3));
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';
}

/// Today in Nairobi as a DateTime at midnight.
DateTime nairobiToday([DateTime? now]) {
  final d = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 3));
  return DateTime(d.year, d.month, d.day);
}

// ───────────────────────────────────────────── providers (one per screen read)

final dashboardProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(staffApiProvider).dashboard(),
);

final propertiesProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(staffApiProvider).properties(),
);

final unitProvider = FutureProvider.autoDispose.family<UnitRow, String>(
  (ref, id) => ref.watch(staffApiProvider).unit(id),
);

final tenancyProvider = FutureProvider.autoDispose.family<Tenancy, String>(
  (ref, id) => ref.watch(staffApiProvider).tenancy(id),
);

final tenantProvider = FutureProvider.autoDispose.family<Tenant, String>(
  (ref, id) => ref.watch(staffApiProvider).tenant(id),
);

final openInvoicesProvider = FutureProvider.autoDispose
    .family<List<OpenInvoice>, String>(
      (ref, id) => ref.watch(staffApiProvider).openInvoices(id),
    );

final statementProvider = FutureProvider.autoDispose.family<Statement, String>(
  (ref, id) => ref.watch(staffApiProvider).statement(id),
);

final tenantPaymentsProvider = FutureProvider.autoDispose
    .family<List<Payment>, String>(
      (ref, id) async =>
          (await ref
                  .watch(staffApiProvider)
                  .payments(page: 1, tenantId: id, size: 5))
              .rows,
    );

final paymentProvider = FutureProvider.autoDispose.family<Payment, String>(
  (ref, id) => ref.watch(staffApiProvider).payment(id),
);

final invoiceProvider = FutureProvider.autoDispose
    .family<InvoiceDetail, String>(
      (ref, id) => ref.watch(staffApiProvider).invoice(id),
    );

final inboundProvider = FutureProvider.autoDispose.family<Inbound, String>(
  (ref, id) => ref.watch(staffApiProvider).inboundOne(id),
);

final channelsProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(staffApiProvider).activeChannels(),
);

final metersProvider = FutureProvider.autoDispose.family<List<Meter>, String>(
  (ref, propertyId) => ref.watch(staffApiProvider).meters(propertyId),
);

final sheetProvider = FutureProvider.autoDispose
    .family<
      List<SheetRow>,
      ({String propertyId, String chargeTypeId, String period})
    >(
      (ref, k) => ref
          .watch(staffApiProvider)
          .readingSheet(
            propertyId: k.propertyId,
            chargeTypeId: k.chargeTypeId,
            period: k.period,
          ),
    );

/// Bumped after every write that changes a paged list, so `PagedList`s keyed on it reload.
final listsVersionProvider = StateProvider<int>((ref) => 0);

/// After money moves (a payment recorded, an M-Pesa transaction assigned): every read that
/// shows a balance, an invoice status or a payment.
void invalidateAfterPayment(WidgetRef ref, {String? tenantId}) {
  if (tenantId != null) {
    ref.invalidate(tenantProvider(tenantId));
    ref.invalidate(openInvoicesProvider(tenantId));
    ref.invalidate(statementProvider(tenantId));
    ref.invalidate(tenantPaymentsProvider(tenantId));
  } else {
    ref.invalidate(tenantProvider);
    ref.invalidate(openInvoicesProvider);
    ref.invalidate(statementProvider);
    ref.invalidate(tenantPaymentsProvider);
  }
  ref.invalidate(invoiceProvider);
  ref.invalidate(dashboardProvider);
  ref.read(listsVersionProvider.notifier).state++;
}
