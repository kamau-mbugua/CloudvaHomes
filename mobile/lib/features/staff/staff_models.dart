import '../../core/money.dart';

/// Staff-mode shapes, read from the same `/api/v1` answers the web app uses. Money is
/// integer cents (via [centsFrom]); days are `YYYY-MM-DD`; quantities (meter readings) are
/// decimal strings.

typedef Json = Map<String, dynamic>;

String? _s(Object? v) => v is String ? v : null;
int _i(Object? v) =>
    v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? 0 : 0);
List<Json> _list(Object? v) => [
  if (v is List)
    for (final e in v)
      if (e is Map<String, dynamic>) e,
];

/// One page of a paged list (`{data, meta}`).
class Page<T> {
  Page(this.rows, {required this.page, required this.pages, this.total = 0});
  final List<T> rows;
  final int page;
  final int pages;
  final int total;
  bool get hasMore => page < pages;

  static Page<T> from<T>(Json body, T Function(Json) row) {
    final meta = body['meta'] as Map<String, dynamic>? ?? const {};
    return Page(
      [for (final r in _list(body['data'])) row(r)],
      page: _i(meta['page']),
      pages: _i(meta['pages']),
      total: _i(meta['total']),
    );
  }
}

class CodedRef {
  CodedRef({required this.id, required this.code, required this.name});
  final String id;
  final String code;
  final String name;
  factory CodedRef.fromJson(Json j) => CodedRef(
    id: j['id'] as String,
    code: _s(j['code']) ?? '',
    name: _s(j['name']) ?? '',
  );
}

class TenantRef {
  TenantRef({
    required this.id,
    required this.code,
    required this.firstName,
    required this.lastName,
    required this.phone,
  });
  final String id;
  final String code;
  final String firstName;
  final String lastName;
  final String phone;
  String get name => '$firstName $lastName'.trim();

  factory TenantRef.fromJson(Json j) => TenantRef(
    id: j['id'] as String,
    code: _s(j['code']) ?? '',
    firstName: _s(j['firstName']) ?? '',
    lastName: _s(j['lastName']) ?? '',
    phone: _s(j['phone']) ?? '',
  );
}

// ───────────────────────────────────────────── dashboard

class Dashboard {
  Dashboard({
    required this.period,
    this.asOf,
    required this.invoiced,
    required this.collected,
    required this.collectionRate,
    this.expenses = 0,
    this.net = 0,
    required this.arrears,
    required this.units,
    required this.occupied,
    required this.notice,
    required this.vacant,
    this.unavailable = 0,
    required this.occupancyRate,
    required this.unmatchedMpesa,
    required this.topOverdue,
    this.trend = const [],
  });
  final String period;
  final String? asOf;
  final int invoiced;
  final int collected;
  final double? collectionRate;
  final int expenses;
  final int net;
  final int arrears;
  final int units;
  final int occupied;
  final int notice;
  final int vacant;
  final int unavailable;
  final double? occupancyRate;
  final int? unmatchedMpesa;
  final List<({TenantRef tenant, int overdue, String? oldestDueDate})>
  topOverdue;
  final List<({String period, int invoiced, int collected, int expenses})>
  trend;

  factory Dashboard.fromJson(Json j) {
    final occ = j['occupancy'] as Map<String, dynamic>? ?? const {};
    final invoiced = centsFrom(j['invoiced']);
    final collected = centsFrom(j['collected']);
    final expenses = centsFrom(j['expenses']);
    final net = j['net'] == null ? (collected - expenses) : centsFrom(j['net']);
    return Dashboard(
      period: _s(j['period']) ?? '',
      asOf: _s(j['asOf']),
      invoiced: invoiced,
      collected: collected,
      collectionRate: (j['collectionRate'] as num?)?.toDouble(),
      expenses: expenses,
      net: net,
      arrears: centsFrom(j['arrears']),
      units: _i(occ['units']),
      occupied: _i(occ['occupied']),
      notice: _i(occ['notice']),
      vacant: _i(occ['vacant']),
      unavailable: _i(occ['unavailable']),
      occupancyRate: (occ['rate'] as num?)?.toDouble(),
      unmatchedMpesa: j['unmatchedMpesa'] == null
          ? null
          : _i(j['unmatchedMpesa']),
      topOverdue: [
        for (final r in _list(j['topOverdue']))
          (
            tenant: TenantRef.fromJson(r['tenant'] as Json),
            overdue: centsFrom(r['overdue']),
            oldestDueDate: _s(r['oldestDueDate']),
          ),
      ],
      trend: [
        for (final t in _list(j['trend']))
          (
            period: _s(t['period']) ?? '',
            invoiced: centsFrom(t['invoiced']),
            collected: centsFrom(t['collected']),
            expenses: centsFrom(t['expenses']),
          ),
      ],
    );
  }
}

// ───────────────────────────────────────────── units, tenants

class UnitRow {
  UnitRow({
    required this.id,
    required this.number,
    required this.floor,
    required this.rentAmount,
    required this.status,
    required this.property,
    required this.occupancy,
    required this.unitType,
    required this.tenancy,
  });
  final String id;
  final String number;
  final int? floor;
  final int rentAmount;
  final String status;
  final CodedRef property;

  /// OCCUPIED, NOTICE or VACANT.
  final String occupancy;
  final String? unitType;
  final ({
    String id,
    String status,
    String startDate,
    String? endDate,
    bool hasSignedLease,
    TenantRef tenant,
  })?
  tenancy;

  factory UnitRow.fromJson(Json j) {
    final t = j['currentTenancy'] as Map<String, dynamic>?;
    return UnitRow(
      id: j['id'] as String,
      number: _s(j['number']) ?? '',
      floor: (j['floor'] as num?)?.toInt(),
      rentAmount: centsFrom(j['rentAmount']),
      status: _s(j['status']) ?? 'ACTIVE',
      property: CodedRef.fromJson(j['property'] as Json),
      occupancy: _s(j['occupancy']) ?? 'VACANT',
      unitType: _s((j['unitType'] as Map?)?['name']),
      tenancy: t == null
          ? null
          : (
              id: t['id'] as String,
              status: _s(t['status']) ?? '',
              startDate: _s(t['startDate']) ?? '',
              endDate: _s(t['endDate']),
              hasSignedLease: t['hasSignedLease'] == true,
              tenant: TenantRef.fromJson(t['tenant'] as Json),
            ),
    );
  }
}

class Tenancy {
  Tenancy({
    required this.id,
    required this.status,
    required this.rentAmount,
    required this.billingDay,
    required this.startDate,
    required this.endDate,
    required this.depositHeld,
    this.hasSignedLease = false,
  });
  final String id;
  final String status;
  final int rentAmount;
  final int billingDay;
  final String startDate;
  final String? endDate;
  final int depositHeld;
  final bool hasSignedLease;

  factory Tenancy.fromJson(Json j) => Tenancy(
    id: j['id'] as String,
    status: _s(j['status']) ?? '',
    rentAmount: centsFrom(j['rentAmount']),
    billingDay: _i(j['billingDay']),
    startDate: _s(j['startDate']) ?? '',
    endDate: _s(j['endDate']),
    depositHeld: centsFrom(j['depositHeld']),
    hasSignedLease: j['hasSignedLease'] == true,
  );
}

class Tenant {
  Tenant({
    required this.ref,
    required this.email,
    required this.emergencyName,
    required this.emergencyPhone,
    required this.status,
    required this.units,
    required this.balance,
    required this.creditBalance,
  });
  final TenantRef ref;
  final String? email;
  final String? emergencyName;
  final String? emergencyPhone;

  /// CURRENT, PAST or PROSPECT.
  final String status;
  final List<
    ({String tenancyId, String unitId, String unitNumber, String propertyName})
  >
  units;

  /// Owed now; negative = in credit. Null from an older server.
  final int? balance;
  final int creditBalance;

  String get id => ref.id;
  String get name => ref.name;

  factory Tenant.fromJson(Json j) => Tenant(
    ref: TenantRef.fromJson(j),
    email: _s(j['email']),
    emergencyName: _s(j['emergencyContactName']),
    emergencyPhone: _s(j['emergencyContactPhone']),
    status: _s(j['status']) ?? 'CURRENT',
    units: [
      for (final u in _list(j['currentUnits']))
        (
          tenancyId: _s(u['tenancyId']) ?? '',
          unitId: _s(u['unitId']) ?? '',
          unitNumber: _s(u['unitNumber']) ?? '',
          propertyName: _s(u['propertyName']) ?? '',
        ),
    ],
    balance: j['balance'] == null ? null : centsFrom(j['balance']),
    creditBalance: centsFrom(j['creditBalance']),
  );
}

// ───────────────────────────────────────────── money

class Channel {
  Channel({
    required this.id,
    required this.kind,
    required this.name,
    required this.shortcode,
    required this.status,
    required this.darajaConfigured,
  });
  final String id;

  /// MPESA_PAYBILL, MPESA_TILL, BANK_ACCOUNT, CASH or CHEQUE.
  final String kind;
  final String name;
  final String? shortcode;
  final String status;
  final bool darajaConfigured;

  bool get isMpesa => kind == 'MPESA_PAYBILL' || kind == 'MPESA_TILL';

  factory Channel.fromJson(Json j) => Channel(
    id: j['id'] as String,
    kind: _s(j['kind']) ?? '',
    name: _s(j['name']) ?? '',
    shortcode: _s(j['shortcode']),
    status: _s(j['status']) ?? 'ACTIVE',
    darajaConfigured: (j['daraja'] as Map?)?['configured'] == true,
  );
}

class Allocation {
  Allocation({
    required this.invoiceId,
    required this.number,
    required this.period,
    required this.amount,
  });
  final String invoiceId;
  final String number;
  final String period;
  final int amount;
  factory Allocation.fromJson(Json j) {
    final inv = j['invoice'] as Map<String, dynamic>? ?? const {};
    return Allocation(
      invoiceId: _s(inv['id']) ?? '',
      number: _s(inv['number']) ?? '',
      period: _s(inv['period']) ?? '',
      amount: centsFrom(j['amount']),
    );
  }
}

class Payment {
  Payment({
    required this.id,
    required this.number,
    required this.method,
    required this.amount,
    required this.unallocated,
    required this.reference,
    required this.paidBy,
    required this.note,
    required this.receivedAt,
    required this.tenant,
    required this.channelName,
    required this.reversesId,
    required this.reversedByNumber,
    required this.reversalReason,
    required this.recordedBy,
    required this.allocations,
    required this.receiptSent,
  });
  final String id;
  final String number;
  final String method;
  final int amount;
  final int unallocated;
  final String? reference;
  final String? paidBy;
  final String? note;
  final String receivedAt;
  final TenantRef tenant;
  final String? channelName;
  final String? reversesId;
  final String? reversedByNumber;
  final String? reversalReason;
  final String? recordedBy;
  final List<Allocation> allocations;

  /// Only on `POST /payments`.
  final bool? receiptSent;

  bool get isReversal => reversesId != null || amount < 0;

  factory Payment.fromJson(Json j) => Payment(
    id: j['id'] as String,
    number: _s(j['number']) ?? '',
    method: _s(j['method']) ?? '',
    amount: centsFrom(j['amount']),
    unallocated: centsFrom(j['unallocated']),
    reference: _s(j['reference']),
    paidBy: _s(j['paidBy']),
    note: _s(j['note']),
    receivedAt: _s(j['receivedAt']) ?? '',
    tenant: TenantRef.fromJson(j['tenant'] as Json),
    channelName: _s((j['channel'] as Map?)?['name']),
    reversesId: _s(j['reversesId']),
    reversedByNumber: _s((j['reversedBy'] as Map?)?['number']),
    reversalReason: _s(j['reversalReason']),
    recordedBy: _s((j['recordedBy'] as Map?)?['name']),
    allocations: [
      for (final a in _list(j['allocations'])) Allocation.fromJson(a),
    ],
    receiptSent: j['receiptSent'] is bool ? j['receiptSent'] as bool : null,
  );
}

class OpenInvoice {
  OpenInvoice({
    required this.id,
    required this.number,
    required this.kind,
    required this.period,
    required this.dueDate,
    required this.total,
    required this.balance,
    required this.overdue,
  });
  final String id;
  final String number;
  final String kind;
  final String period;
  final String dueDate;
  final int total;
  final int balance;
  final bool overdue;
  factory OpenInvoice.fromJson(Json j) => OpenInvoice(
    id: j['id'] as String,
    number: _s(j['number']) ?? '',
    kind: _s(j['kind']) ?? '',
    period: _s(j['period']) ?? '',
    dueDate: _s(j['dueDate']) ?? '',
    total: centsFrom(j['total']),
    balance: centsFrom(j['balance']),
    overdue: j['overdue'] == true,
  );
}

class StatementEntry {
  StatementEntry({
    required this.date,
    required this.type,
    required this.reference,
    required this.description,
    required this.debit,
    required this.credit,
    required this.balance,
  });
  final String date;
  final String type;
  final String? reference;
  final String? description;
  final int? debit;
  final int? credit;
  final int balance;
  factory StatementEntry.fromJson(Json j) => StatementEntry(
    date: _s(j['date']) ?? '',
    type: _s(j['type']) ?? '',
    reference: _s(j['reference']),
    description: _s(j['description']),
    debit: j['debit'] == null ? null : centsFrom(j['debit']),
    credit: j['credit'] == null ? null : centsFrom(j['credit']),
    balance: centsFrom(j['balance']),
  );
}

class Statement {
  Statement({
    required this.from,
    required this.to,
    required this.openingBalance,
    required this.closingBalance,
    required this.creditBalance,
    required this.depositHeld,
    required this.entries,
  });
  final String from;
  final String to;
  final int openingBalance;
  final int closingBalance;
  final int creditBalance;
  final int depositHeld;
  final List<StatementEntry> entries;
  factory Statement.fromJson(Json j) => Statement(
    from: _s(j['from']) ?? '',
    to: _s(j['to']) ?? '',
    openingBalance: centsFrom(j['openingBalance']),
    closingBalance: centsFrom(j['closingBalance']),
    creditBalance: centsFrom(j['creditBalance']),
    depositHeld: centsFrom(j['depositHeld']),
    entries: [for (final e in _list(j['entries'])) StatementEntry.fromJson(e)],
  );
}

class Invoice {
  Invoice({
    required this.id,
    required this.number,
    required this.kind,
    required this.period,
    required this.status,
    required this.issueDate,
    required this.dueDate,
    required this.total,
    required this.amountPaid,
    required this.creditedAmount,
    required this.balance,
    required this.overdue,
    required this.tenant,
    required this.unitNumber,
    required this.propertyName,
    required this.voidReason,
  });
  final String id;
  final String number;
  final String kind;
  final String period;

  /// ISSUED, PARTIALLY_PAID, PAID or VOID.
  final String status;
  final String issueDate;
  final String dueDate;
  final int total;
  final int amountPaid;
  final int creditedAmount;
  final int balance;
  final bool overdue;
  final TenantRef tenant;
  final String unitNumber;
  final String propertyName;
  final String? voidReason;

  factory Invoice.fromJson(Json j) => Invoice(
    id: j['id'] as String,
    number: _s(j['number']) ?? '',
    kind: _s(j['kind']) ?? '',
    period: _s(j['period']) ?? '',
    status: _s(j['status']) ?? 'ISSUED',
    issueDate: _s(j['issueDate']) ?? '',
    dueDate: _s(j['dueDate']) ?? '',
    total: centsFrom(j['total']),
    amountPaid: centsFrom(j['amountPaid']),
    creditedAmount: centsFrom(j['creditedAmount']),
    balance: centsFrom(j['balance']),
    overdue: j['overdue'] == true,
    tenant: TenantRef.fromJson(j['tenant'] as Json),
    unitNumber: _s((j['unit'] as Map?)?['number']) ?? '',
    propertyName: _s((j['property'] as Map?)?['name']) ?? '',
    voidReason: _s(j['voidReason']),
  );
}

class InvoiceDetail {
  InvoiceDetail({
    required this.invoice,
    required this.lines,
    required this.creditNotes,
    required this.payments,
  });
  final Invoice invoice;
  final List<
    ({String description, String quantity, int unitAmount, int amount})
  >
  lines;
  final List<({String number, int amount, String reason})> creditNotes;
  final List<({String id, String number, int amount, String receivedAt})>
  payments;

  factory InvoiceDetail.fromJson(Json j) => InvoiceDetail(
    invoice: Invoice.fromJson(j),
    lines: [
      for (final l in _list(j['lines']))
        (
          description: _s(l['description']) ?? '',
          quantity: _s(l['quantity']) ?? '1',
          unitAmount: centsFrom(l['unitAmount']),
          amount: centsFrom(l['amount']),
        ),
    ],
    creditNotes: [
      for (final c in _list(j['creditNotes']))
        (
          number: _s(c['number']) ?? '',
          amount: centsFrom(c['amount']),
          reason: _s(c['reason']) ?? '',
        ),
    ],
    payments: [
      for (final p in _list(j['payments']))
        (
          id: _s(p['id']) ?? '',
          number: _s(p['number']) ?? '',
          amount: centsFrom(p['amount']),
          receivedAt: _s(p['receivedAt']) ?? '',
        ),
    ],
  );
}

class Inbound {
  Inbound({
    required this.id,
    required this.source,
    required this.providerRef,
    required this.amount,
    required this.payerName,
    required this.payerPhone,
    required this.accountRef,
    required this.occurredAt,
    required this.matchStatus,
    required this.channelName,
    required this.tenant,
    required this.paymentId,
    required this.paymentNumber,
    required this.ignoredReason,
    required this.suggestions,
  });
  final String id;
  final String source;
  final String providerRef;
  final int amount;
  final String? payerName;
  final String? payerPhone;
  final String? accountRef;
  final String occurredAt;

  /// UNMATCHED, MATCHED or IGNORED.
  final String matchStatus;
  final String channelName;
  final TenantRef? tenant;
  final String? paymentId;
  final String? paymentNumber;
  final String? ignoredReason;

  /// Only on the detail answer.
  final List<({TenantRef tenant, String reason})> suggestions;

  factory Inbound.fromJson(Json j) {
    final t = j['tenant'];
    final p = j['payment'] as Map?;
    return Inbound(
      id: j['id'] as String,
      source: _s(j['source']) ?? '',
      providerRef: _s(j['providerRef']) ?? '',
      amount: centsFrom(j['amount']),
      payerName: _s(j['payerName']),
      payerPhone: _s(j['payerPhone']),
      accountRef: _s(j['accountRef']),
      occurredAt: _s(j['occurredAt']) ?? '',
      matchStatus: _s(j['matchStatus']) ?? 'UNMATCHED',
      channelName: _s((j['channel'] as Map?)?['name']) ?? '',
      tenant: t is Map<String, dynamic> ? TenantRef.fromJson(t) : null,
      paymentId: _s(p?['id']),
      paymentNumber: _s(p?['number']),
      ignoredReason: _s(j['ignoredReason']),
      suggestions: [
        for (final s in _list(j['suggestions']))
          if (s['tenant'] is Map<String, dynamic>)
            (
              tenant: TenantRef.fromJson(s['tenant'] as Json),
              reason: _s(s['reason']) ?? '',
            ),
      ],
    );
  }
}

// ───────────────────────────────────────────── meters, expenses

class PropertyOption {
  PropertyOption({required this.id, required this.name, required this.code});
  final String id;
  final String name;
  final String code;
  factory PropertyOption.fromJson(Json j) => PropertyOption(
    id: j['id'] as String,
    name: _s(j['name']) ?? '',
    code: _s(j['code']) ?? '',
  );
}

class Meter {
  Meter({
    required this.id,
    required this.serialNo,
    required this.status,
    required this.unitNumber,
    required this.propertyId,
    required this.chargeTypeId,
    required this.chargeName,
    required this.unitLabel,
    required this.lastReading,
  });
  final String id;
  final String serialNo;
  final String status;
  final String unitNumber;
  final String propertyId;
  final String chargeTypeId;
  final String chargeName;
  final String? unitLabel;
  final ({String period, String current})? lastReading;

  factory Meter.fromJson(Json j) {
    final ct = j['chargeType'] as Map<String, dynamic>? ?? const {};
    final last = j['lastReading'] as Map<String, dynamic>?;
    return Meter(
      id: j['id'] as String,
      serialNo: _s(j['serialNo']) ?? '',
      status: _s(j['status']) ?? 'ACTIVE',
      unitNumber: _s((j['unit'] as Map?)?['number']) ?? '',
      propertyId: _s((j['property'] as Map?)?['id']) ?? '',
      chargeTypeId: _s(ct['id']) ?? '',
      chargeName: _s(ct['name']) ?? '',
      unitLabel: _s(ct['unitLabel']),
      lastReading: last == null
          ? null
          : (
              period: _s(last['period']) ?? '',
              current: '${last['current'] ?? ''}',
            ),
    );
  }
}

/// One row of `GET /meter-readings/sheet`: a meter and its reading for the month.
class SheetRow {
  SheetRow({
    required this.meterId,
    required this.serialNo,
    required this.unitNumber,
    required this.suggestedPrevious,
    required this.reading,
  });
  final String meterId;
  final String serialNo;
  final String unitNumber;
  final String suggestedPrevious;
  final ({
    String previous,
    String current,
    String consumption,
    int amount,
    bool billed,
    bool hasPhoto,
    String? readBy,
  })?
  reading;

  factory SheetRow.fromJson(Json j) {
    final r = j['reading'] as Map<String, dynamic>?;
    return SheetRow(
      meterId: _s((j['meter'] as Map?)?['id']) ?? '',
      serialNo: _s((j['meter'] as Map?)?['serialNo']) ?? '',
      unitNumber: _s((j['unit'] as Map?)?['number']) ?? '',
      suggestedPrevious: '${j['suggestedPrevious'] ?? '0'}',
      reading: r == null
          ? null
          : (
              previous: '${r['previous']}',
              current: '${r['current']}',
              consumption: '${r['consumption']}',
              amount: centsFrom(r['amount']),
              billed: r['billed'] == true,
              hasPhoto: r['photo'] != null,
              readBy: _s((r['readBy'] as Map?)?['name']),
            ),
    );
  }
}

class Expense {
  Expense({
    required this.id,
    required this.propertyName,
    required this.category,
    required this.name,
    required this.payee,
    required this.reference,
    required this.amount,
    required this.incurredOn,
    required this.hasReceipt,
    required this.voided,
  });
  final String id;
  final String propertyName;
  final String category;
  final String name;
  final String? payee;
  final String? reference;
  final int amount;
  final String incurredOn;
  final bool hasReceipt;
  final bool voided;
  factory Expense.fromJson(Json j) => Expense(
    id: j['id'] as String,
    propertyName: _s((j['property'] as Map?)?['name']) ?? '',
    category: _s(j['category']) ?? 'OTHER',
    name: _s(j['name']) ?? '',
    payee: _s(j['payee']),
    reference: _s(j['reference']),
    amount: centsFrom(j['amount']),
    incurredOn: _s(j['incurredOn']) ?? '',
    hasReceipt: j['receipt'] != null,
    voided: j['voidedAt'] != null,
  );
}

/// What `POST /tenants/:id/reminder` answers: the message it sent.
class SentMessage {
  SentMessage({required this.to, required this.failed, required this.error});
  final String to;
  final bool failed;
  final String? error;
  factory SentMessage.fromJson(Json j) => SentMessage(
    to: _s(j['to']) ?? '',
    failed: j['status'] == 'FAILED',
    error: _s(j['error']),
  );
}
