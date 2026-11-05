import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/stk_sheet.dart';
import 'home_scope.dart';

export '../../core/auth/session_controller.dart' show sessionProvider;

/// Tenant portal (`/tenant/accounts/:id/*`, phase 7). Only the signed-in tenant's records.

class TenantOverview {
  TenantOverview({
    required this.tenantId,
    required this.code,
    required this.firstName,
    required this.phone,
    required this.orgName,
    required this.orgPhone,
    required this.orgEmail,
    required this.owed,
    required this.credit,
    required this.depositHeld,
    required this.homes,
    required this.openInvoices,
    required this.howToPay,
    required this.canPayInApp,
  });

  final String tenantId;
  final String code;
  final String firstName;
  final String? phone;
  final String orgName;
  final String? orgPhone;
  final String? orgEmail;

  /// What they owe now; 0 when they're in credit (the API's balance goes negative then).
  final int owed;
  final int credit;
  final int depositHeld;
  final List<Home> homes;
  final List<InvoiceRow> openInvoices;
  final List<PayWay> howToPay;
  final bool canPayInApp;

  factory TenantOverview.fromJson(Map<String, dynamic> j) {
    final t = j['tenant'] as Map<String, dynamic>;
    final org = j['organization'] as Map<String, dynamic>;
    final balance = centsFrom(j['balance']);
    final tenantId = t['id'] as String;
    final orgName = org['name'] as String;
    return TenantOverview(
      tenantId: tenantId,
      code: t['code'] as String,
      firstName: t['firstName'] as String? ?? '',
      phone: t['phone'] as String?,
      orgName: orgName,
      orgPhone: org['phone'] as String?,
      orgEmail: org['email'] as String?,
      owed: balance > 0 ? balance : 0,
      credit: centsFrom(j['credit']),
      depositHeld: centsFrom(j['depositHeld']),
      homes: [
        for (final h in j['tenancies'] as List? ?? const [])
          Home.fromJson(
            h as Map<String, dynamic>,
            tenantId: tenantId,
            orgName: orgName,
          ),
      ],
      openInvoices: [
        for (final i in j['openInvoices'] as List? ?? const [])
          InvoiceRow.fromJson(i as Map<String, dynamic>),
      ],
      howToPay: [
        for (final w in j['howToPay'] as List? ?? const [])
          PayWay.fromJson(w as Map<String, dynamic>),
      ],
      canPayInApp: j['canPayInApp'] == true,
    );
  }
}

/// `GET /tenant/accounts/overview`: every home across every landlord account.
class ConsolidatedOverview {
  ConsolidatedOverview({
    required this.owed,
    required this.credit,
    required this.depositHeld,
    required this.homes,
    required this.accounts,
  });
  final int owed;
  final int credit;
  final int depositHeld;
  final List<Home> homes;
  final List<TenantOverview> accounts;

  factory ConsolidatedOverview.fromJson(Map<String, dynamic> j) {
    final balance = centsFrom(j['balance']);
    return ConsolidatedOverview(
      owed: balance > 0 ? balance : 0,
      credit: centsFrom(j['credit']),
      depositHeld: centsFrom(j['depositHeld']),
      homes: [
        for (final h in j['tenancies'] as List? ?? const [])
          Home.fromJson(h as Map<String, dynamic>),
      ],
      accounts: [
        for (final a in j['accounts'] as List? ?? const [])
          TenantOverview.fromJson(a as Map<String, dynamic>),
      ],
    );
  }
}

class Home {
  Home({
    this.id = '',
    this.tenantId = '',
    this.orgName = '',
    required this.unit,
    required this.property,
    required this.rent,
    this.depositHeld = 0,
    required this.billingDay,
    required this.status,
    required this.startDate,
    this.endDate,
    this.hasSignedLease = false,
    this.due = 0,
    this.overdue = 0,
    this.daysLate = 0,
    this.nextDueDate,
    this.leaseEndDate,
  });
  final String id;
  final String tenantId;
  final String orgName;
  final String unit;
  final String property;
  final int rent;
  final int depositHeld;
  final int billingDay;
  final String status;
  final String startDate;
  final String? endDate;
  final bool hasSignedLease;

  /// Tenant portal redesign: what this home owes, the overdue part, days late, next due.
  final int due;
  final int overdue;
  final int daysLate;
  final String? nextDueDate;
  final String? leaseEndDate;

  String get key => id.isNotEmpty ? id : '$tenantId:$unit:$property';

  factory Home.fromJson(
    Map<String, dynamic> j, {
    String tenantId = '',
    String orgName = '',
  }) => Home(
    id: j['id'] as String? ?? '',
    tenantId: j['tenantId'] as String? ?? tenantId,
    orgName: j['orgName'] as String? ?? orgName,
    unit: _name(j['unit'], 'number'),
    property: _name(j['property'], 'name'),
    rent: centsFrom(j['rentAmount']),
    depositHeld: centsFrom(j['depositHeld']),
    billingDay: (j['billingDay'] as num?)?.toInt() ?? 1,
    status: j['status'] as String? ?? 'ACTIVE',
    startDate: j['startDate'] as String,
    endDate: j['endDate'] as String?,
    hasSignedLease: j['hasSignedLease'] == true,
    due: centsFrom(j['due']),
    overdue: centsFrom(j['overdue']),
    daysLate: (j['daysLate'] as num?)?.toInt() ?? 0,
    nextDueDate: j['nextDueDate'] as String?,
    leaseEndDate: j['leaseEndDate'] as String?,
  );
}

String _name(Object? v, String field) =>
    v is Map ? (v[field] as String? ?? '') : (v as String? ?? '');

/// A paybill (account = tenant code), a till, or a bank account (reference = tenant code).
class PayWay {
  PayWay({
    required this.kind,
    required this.name,
    this.shortcode,
    this.bankName,
    this.accountNumber,
    this.accountName,
    this.accountRef,
  });
  final String kind;
  final String name;
  final String? shortcode;
  final String? bankName;
  final String? accountNumber;
  final String? accountName;
  final String? accountRef;

  factory PayWay.fromJson(Map<String, dynamic> j) => PayWay(
    kind: j['kind'] as String,
    name: j['name'] as String,
    shortcode: j['shortcode'] as String?,
    bankName: j['bankName'] as String?,
    accountNumber: j['accountNumber'] as String?,
    accountName: j['accountName'] as String?,
    accountRef: j['accountRef'] as String?,
  );
}

class InvoiceRow {
  InvoiceRow({
    required this.id,
    required this.number,
    required this.period,
    required this.status,
    required this.dueDate,
    required this.total,
    required this.balance,
    required this.overdue,
    this.unit,
  });
  final String id;
  final String number;
  final String period;
  final String status;
  final String dueDate;
  final int total;
  final int balance;
  final bool overdue;
  final String? unit;

  factory InvoiceRow.fromJson(Map<String, dynamic> j) => InvoiceRow(
    id: j['id'] as String,
    number: j['number'] as String,
    period: j['period'] as String? ?? '',
    status: j['status'] as String? ?? 'ISSUED',
    dueDate: j['dueDate'] as String,
    total: centsFrom(j['total']),
    balance: centsFrom(j['balance']),
    overdue: j['overdue'] == true,
    unit: j['unit'] == null ? null : _name(j['unit'], 'number'),
  );
}

class InvoiceDetail {
  InvoiceDetail({
    required this.row,
    required this.issueDate,
    required this.amountPaid,
    required this.credited,
    required this.lines,
    required this.payments,
  });
  final InvoiceRow row;
  final String issueDate;
  final int amountPaid;
  final int credited;
  final List<({String description, int amount})> lines;
  final List<({String? id, String number, String receivedAt, int amount})>
  payments;

  factory InvoiceDetail.fromJson(Map<String, dynamic> j) => InvoiceDetail(
    row: InvoiceRow.fromJson(j),
    issueDate: j['issueDate'] as String? ?? '',
    amountPaid: centsFrom(j['amountPaid']),
    credited: centsFrom(j['creditedAmount']),
    lines: [
      for (final l in j['lines'] as List? ?? const [])
        (
          description: (l as Map)['description'] as String,
          amount: centsFrom(l['amount']),
        ),
    ],
    payments: [
      for (final p in j['payments'] as List? ?? const [])
        (
          id: (p as Map)['id'] as String?,
          number: p['number'] as String,
          receivedAt: p['receivedAt'] as String,
          amount: centsFrom(p['amount']),
        ),
    ],
  );
}

class PaymentRow {
  PaymentRow({
    required this.id,
    required this.number,
    required this.amount,
    required this.method,
    required this.receivedAt,
    this.reference,
    this.channel,
    this.reversal = false,
  });
  final String id;
  final String number;
  final int amount;
  final String method;
  final String receivedAt;
  final String? reference;
  final String? channel;
  final bool reversal;

  factory PaymentRow.fromJson(Map<String, dynamic> j) => PaymentRow(
    id: j['id'] as String,
    number: j['number'] as String,
    amount: centsFrom(j['amount']),
    method: j['method'] as String,
    receivedAt: j['receivedAt'] as String,
    reference: j['reference'] as String?,
    channel: (j['channel'] as Map?)?['name'] as String?,
    reversal: j['reversesId'] != null,
  );
}

class Statement {
  Statement({
    required this.from,
    required this.to,
    required this.opening,
    required this.closing,
    required this.entries,
  });
  final String from;
  final String to;
  final int opening;
  final int closing;
  final List<StatementEntry> entries;

  factory Statement.fromJson(Map<String, dynamic> j) => Statement(
    from: j['from'] as String,
    to: j['to'] as String,
    opening: centsFrom(j['openingBalance']),
    closing: centsFrom(j['closingBalance']),
    entries: [
      for (final e in j['entries'] as List? ?? const [])
        StatementEntry.fromJson(e as Map<String, dynamic>),
    ],
  );
}

class StatementEntry {
  StatementEntry({
    required this.date,
    required this.reference,
    required this.description,
    required this.debit,
    required this.credit,
    required this.balance,
  });
  final String date;
  final String reference;
  final String description;
  final int debit;
  final int credit;
  final int balance;

  factory StatementEntry.fromJson(Map<String, dynamic> j) => StatementEntry(
    date: j['date'] as String,
    reference: j['reference'] as String? ?? '',
    description: j['description'] as String? ?? '',
    debit: centsFrom(j['debit']),
    credit: centsFrom(j['credit']),
    balance: centsFrom(j['balance']),
  );
}

class TenantMaintenanceRequest {
  TenantMaintenanceRequest({
    required this.id,
    required this.number,
    required this.title,
    required this.description,
    required this.category,
    required this.priority,
    required this.status,
    required this.createdAt,
    this.unitNumber,
    this.propertyName,
    this.resolutionNote,
    this.resolvedAt,
  });

  final String id;
  final String number;
  final String title;
  final String description;
  final String category;
  final String priority;
  final String status;
  final String createdAt;
  final String? unitNumber;
  final String? propertyName;
  final String? resolutionNote;
  final String? resolvedAt;

  factory TenantMaintenanceRequest.fromJson(Map<String, dynamic> j) =>
      TenantMaintenanceRequest(
        id: j['id'] as String,
        number: j['number'] as String? ?? '',
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        category: j['category'] as String? ?? 'OTHER',
        priority: j['priority'] as String? ?? 'MEDIUM',
        status: j['status'] as String? ?? 'OPEN',
        createdAt: j['createdAt'] as String? ?? '',
        unitNumber: (j['unit'] as Map?)?['number'] as String?,
        propertyName: (j['property'] as Map?)?['name'] as String?,
        resolutionNote: j['resolutionNote'] as String?,
        resolvedAt: j['resolvedAt'] as String?,
      );
}

/// A page of a list plus whether there's more.

/// Billed vs paid for one month (`/tenant/accounts/overview/monthly`).
class MonthlyPoint {
  const MonthlyPoint(this.period, this.invoiced, this.paid);
  final String period;
  final int invoiced;
  final int paid;
  factory MonthlyPoint.fromJson(Map<String, dynamic> j) => MonthlyPoint(
    j['period'] as String,
    centsFrom(j['invoiced']),
    centsFrom(j['paid']),
  );
}

/// One event in the activity feed (`/tenant/accounts/overview/activity`).
class ActivityItem {
  const ActivityItem({
    required this.kind,
    required this.at,
    required this.title,
    required this.amount,
    required this.orgName,
    required this.link,
  });
  final String kind;
  final String at;
  final String title;
  final int? amount;
  final String orgName;
  final String link;
  factory ActivityItem.fromJson(Map<String, dynamic> j) => ActivityItem(
    kind: j['kind'] as String,
    at: j['at'] as String,
    title: j['title'] as String,
    amount: j['amount'] == null ? null : centsFrom(j['amount']),
    orgName: j['orgName'] as String? ?? '',
    link: j['link'] as String? ?? '/tenant',
  );
}

/// A tenant notice (`/tenant/notices`).
class TenantNotice {
  const TenantNotice({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    this.orgName,
    this.actionUrl,
    this.read = false,
    required this.tenantId,
  });
  final String id;
  final String title;
  final String body;
  final String createdAt;
  final String? orgName;
  final String? actionUrl;
  final bool read;
  final String tenantId;
  factory TenantNotice.fromJson(Map<String, dynamic> j) => TenantNotice(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    body: j['body'] as String? ?? '',
    createdAt: j['createdAt'] as String? ?? '',
    orgName: j['orgName'] as String?,
    actionUrl: j['actionUrl'] as String?,
    read: j['readAt'] != null,
    tenantId: j['tenantId'] as String? ?? '',
  );
}

/// A move-in / move-out inspection as the tenant sees it.
class TenantInspection {
  const TenantInspection({
    required this.kind,
    required this.inspectedOn,
    required this.acknowledged,
  });
  final String kind;
  final String inspectedOn;
  final bool acknowledged;
  factory TenantInspection.fromJson(Map<String, dynamic> j) => TenantInspection(
    kind: j['kind'] as String,
    inspectedOn: j['inspectedOn'] as String? ?? '',
    acknowledged: j['tenantAcknowledgedAt'] != null,
  );
}

class Page<T> {
  Page(this.rows, {required this.page, required this.pages});
  final List<T> rows;
  final int page;
  final int pages;
  bool get hasMore => page < pages;
}

class TenantApi {
  TenantApi(this._api);
  final ApiClient _api;

  String _base(String id) => '/tenant/accounts/${Uri.encodeComponent(id)}';
  String base(String id) => _base(id);

  Future<TenantOverview> overview(String id) async => TenantOverview.fromJson(
    (await _api.get(_base(id)))['data'] as Map<String, dynamic>,
  );

  Future<ConsolidatedOverview> allHomes() async =>
      ConsolidatedOverview.fromJson(
        (await _api.get('/tenant/accounts/overview'))['data']
            as Map<String, dynamic>,
      );

  Future<TenantOverview> consolidatedOverview(List<String> ids) async {
    if (ids.length == 1) return overview(ids.first);
    final list = await Future.wait([for (final id in ids) overview(id)]);
    final first = list.first;
    return TenantOverview(
      tenantId: first.tenantId,
      code: first.code,
      firstName: first.firstName,
      phone: first.phone,
      orgName: list.map((e) => e.orgName).toSet().length == 1
          ? first.orgName
          : '${list.length} accounts',
      orgPhone: first.orgPhone,
      orgEmail: first.orgEmail,
      owed: list.fold<int>(0, (s, e) => s + e.owed),
      credit: list.fold<int>(0, (s, e) => s + e.credit),
      depositHeld: list.fold<int>(0, (s, e) => s + e.depositHeld),
      homes: [for (final e in list) ...e.homes],
      openInvoices: [for (final e in list) ...e.openInvoices],
      howToPay: first.howToPay,
      canPayInApp: list.any((e) => e.canPayInApp),
    );
  }

  Future<List<MonthlyPoint>> monthly({
    int months = 6,
    String? tenancyId,
  }) async {
    final res = await _api.get(
      '/tenant/accounts/overview/monthly',
      query: {'months': months, 'tenancyId': ?tenancyId},
    );
    return [
      for (final r in res['data'] as List)
        MonthlyPoint.fromJson(r as Map<String, dynamic>),
    ];
  }

  Future<List<ActivityItem>> activity({
    int limit = 8,
    String? tenancyId,
  }) async {
    final res = await _api.get(
      '/tenant/accounts/overview/activity',
      query: {'limit': limit, 'tenancyId': ?tenancyId},
    );
    return [
      for (final r in res['data'] as List)
        ActivityItem.fromJson(r as Map<String, dynamic>),
    ];
  }

  Future<Page<TenantNotice>> notices({int page = 1, String? tenantId}) => _page(
    '/tenant/notices',
    {'page': page, 'tenantId': ?tenantId},
    TenantNotice.fromJson,
  );

  String inspectionsPath(String id, String tenancyId) =>
      '${_base(id)}/tenancies/${Uri.encodeComponent(tenancyId)}/inspections';

  Future<List<TenantInspection>> inspections(
    String id,
    String tenancyId,
  ) async {
    final res = await _api.get(inspectionsPath(id, tenancyId));
    return [
      for (final r in res['data'] as List)
        TenantInspection.fromJson(r as Map<String, dynamic>),
    ];
  }

  Future<void> acknowledgeInspection(
    String id,
    String tenancyId,
    String kind,
  ) => _api.post('${inspectionsPath(id, tenancyId)}/$kind/acknowledge');

  Future<Page<T>> _page<T>(
    String path,
    Map<String, Object?> query,
    T Function(Map<String, dynamic>) parse,
  ) async {
    final res = await _api.get(path, query: query);
    final meta = res['meta'] as Map<String, dynamic>? ?? const {};
    return Page(
      [for (final r in res['data'] as List) parse(r as Map<String, dynamic>)],
      page: (meta['page'] as num?)?.toInt() ?? 1,
      pages: (meta['pages'] as num?)?.toInt() ?? 1,
    );
  }

  Future<Page<InvoiceRow>> invoices(
    String id, {
    int page = 1,
    String? tenancyId,
  }) => _page('${_base(id)}/invoices', {
    'page': page,
    'pageSize': 25,
    'tenancyId': ?tenancyId,
  }, InvoiceRow.fromJson);

  Future<InvoiceDetail> invoice(String id, String invoiceId) async =>
      InvoiceDetail.fromJson(
        (await _api.get(
              '${_base(id)}/invoices/${Uri.encodeComponent(invoiceId)}',
            ))['data']
            as Map<String, dynamic>,
      );

  Future<Page<PaymentRow>> payments(String id, {int page = 1}) => _page(
    '${_base(id)}/payments',
    {'page': page, 'pageSize': 25},
    PaymentRow.fromJson,
  );

  Future<Statement> statement(String id, {String? from, String? to}) async =>
      Statement.fromJson(
        (await _api.get(
              '${_base(id)}/statement',
              query: {'from': from, 'to': to},
            ))['data']
            as Map<String, dynamic>,
      );

  Future<StkStatus> pay(
    String id,
    int amount,
    String? phone,
    String key,
  ) async => StkStatus.fromJson(
    (await _api.post(
          '${_base(id)}/pay',
          body: {'amount': amount, 'phone': ?phone},
          headers: {'Idempotency-Key': key},
        ))['data']
        as Map<String, dynamic>,
  );

  Future<StkStatus> payStatus(String id, String stkId) async =>
      StkStatus.fromJson(
        (await _api.get(
              '${_base(id)}/pay/${Uri.encodeComponent(stkId)}',
            ))['data']
            as Map<String, dynamic>,
      );

  Future<Page<TenantMaintenanceRequest>> requests(String id, {int page = 1}) =>
      _page('${_base(id)}/requests', {
        'page': page,
        'pageSize': 25,
      }, TenantMaintenanceRequest.fromJson);

  Future<TenantMaintenanceRequest> createRequest(
    String id,
    Map<String, dynamic> body,
  ) async => TenantMaintenanceRequest.fromJson(
    (await _api.post('${_base(id)}/requests', body: body))['data']
        as Map<String, dynamic>,
  );

  Future<String> uploadPhoto(String id, Uint8List jpeg) async {
    final res = await _api.upload(
      '${_base(id)}/uploads',
      () => FormData.fromMap({
        'file': MultipartFile.fromBytes(
          jpeg,
          filename: 'maintenance.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      }),
    );
    return (res['data'] as Map<String, dynamic>)['id'] as String;
  }
}

final tenantApiProvider = Provider(
  (ref) => TenantApi(ref.watch(apiClientProvider)),
);

/// The tenant account being shown; null = follow session.activeTenantId (or consolidated on Home).
final chosenTenantProvider = StateProvider<String?>((ref) => null);

/// Selected unit/tenancy key on Tenant Home; null = Consolidated across all units.
final selectedTenantHomeKeyProvider = StateProvider<String?>((ref) => null);

/// Every home across every landlord account (tenant portal redesign).
final allHomesProvider = FutureProvider.autoDispose<ConsolidatedOverview>(
  (ref) => ref.watch(tenantApiProvider).allHomes(),
);

/// The home switcher's choice, checked against the homes there are now.
final homeScopeProvider = Provider<HomeScope>((ref) {
  final all = ref.watch(allHomesProvider).valueOrNull;
  if (all == null) return const AllHomes();
  return resolveScope(ref.watch(homeScopeRawProvider), homeOptions(all.homes));
});

final currentTenantIdProvider = Provider<String?>((ref) {
  final session = ref.watch(sessionProvider).valueOrNull;
  final accounts = session?.tenantOf ?? const [];
  final scope = ref.watch(homeScopeProvider);
  if (scope is OneHome && accounts.any((a) => a.tenantId == scope.tenantId)) {
    return scope.tenantId;
  }
  final chosen = ref.watch(chosenTenantProvider) ?? session?.activeTenantId;
  if (accounts.isEmpty) return null;
  return accounts.any((a) => a.tenantId == chosen)
      ? chosen
      : accounts.first.tenantId;
});

final tenantOverviewProvider = FutureProvider.autoDispose<TenantOverview>((
  ref,
) {
  final session = ref.watch(sessionProvider).valueOrNull;
  final accounts = session?.tenantOf ?? const [];
  if (accounts.isEmpty) throw StateError('No tenant account');
  final api = ref.watch(tenantApiProvider);
  if (accounts.length > 1) {
    return api.consolidatedOverview([for (final a in accounts) a.tenantId]);
  }
  return api.overview(accounts.first.tenantId);
});

final tenantInvoiceProvider = FutureProvider.autoDispose
    .family<InvoiceDetail, String>((ref, invoiceId) {
      final id = ref.watch(currentTenantIdProvider)!;
      return ref.watch(tenantApiProvider).invoice(id, invoiceId);
    });

final tenantStatementProvider = FutureProvider.autoDispose
    .family<Statement, ({String? from, String? to})>((ref, range) {
      final id = ref.watch(currentTenantIdProvider)!;
      return ref
          .watch(tenantApiProvider)
          .statement(id, from: range.from, to: range.to);
    });
