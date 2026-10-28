import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/stk_sheet.dart';

/// The organisation's Hodi bill (`GET /billing`, phase 8).
class HodiBilling {
  HodiBilling({
    required this.status,
    required this.balance,
    required this.credit,
    required this.overdueAmount,
    required this.overdueSince,
    required this.planName,
    required this.pricePerUnit,
    required this.minimumMonthly,
    required this.customPrice,
    required this.trialEndsAt,
    required this.billingRef,
    required this.paybill,
    required this.canPayInApp,
  });

  final String status;
  final int balance;
  final int credit;
  final int? overdueAmount;
  final String? overdueSince;
  final String? planName;
  final int pricePerUnit;
  final int minimumMonthly;
  final bool customPrice;
  final String? trialEndsAt;
  final String? billingRef;
  final String? paybill;
  final bool canPayInApp;

  factory HodiBilling.fromJson(Map<String, dynamic> j) {
    final overdue = j['overdue'] as Map<String, dynamic>?;
    final price = j['price'] as Map<String, dynamic>? ?? const {};
    final payTo = j['payTo'] as Map<String, dynamic>?;
    return HodiBilling(
      status: j['status'] as String? ?? 'ACTIVE',
      balance: centsFrom(j['balance']),
      credit: centsFrom(j['credit']),
      overdueAmount: overdue == null ? null : centsFrom(overdue['amount']),
      overdueSince: overdue?['since'] as String?,
      planName: (j['plan'] as Map<String, dynamic>?)?['name'] as String?,
      pricePerUnit: centsFrom(price['pricePerUnit']),
      minimumMonthly: centsFrom(price['minimumMonthly']),
      customPrice: price['custom'] == true,
      trialEndsAt: j['trialEndsAt'] as String?,
      billingRef: j['billingRef'] as String?,
      paybill: payTo?['paybill'] as String?,
      canPayInApp: j['canPayInApp'] == true,
    );
  }
}

class HodiInvoice {
  HodiInvoice({
    required this.id,
    required this.number,
    required this.period,
    required this.occupiedUnits,
    required this.total,
    required this.balance,
    required this.dueDate,
    required this.status,
    required this.overdue,
  });
  final String id;
  final String number;
  final String period;
  final int occupiedUnits;
  final int total;
  final int balance;
  final String dueDate;
  final String status;
  final bool overdue;

  factory HodiInvoice.fromJson(Map<String, dynamic> j) => HodiInvoice(
    id: j['id'] as String,
    number: j['number'] as String,
    period: j['period'] as String,
    occupiedUnits: (j['occupiedUnits'] as num?)?.toInt() ?? 0,
    total: centsFrom(j['total']),
    balance: centsFrom(j['balance']),
    dueDate: j['dueDate'] as String,
    status: j['status'] as String,
    overdue: j['overdue'] == true,
  );
}

class BillingApi {
  BillingApi(this._api);
  final ApiClient _api;

  Future<HodiBilling> overview() async => HodiBilling.fromJson(
    (await _api.get('/billing'))['data'] as Map<String, dynamic>,
  );

  Future<List<HodiInvoice>> invoices() async {
    final res = await _api.get('/billing/invoices', query: {'pageSize': 24});
    return [
      for (final i in res['data'] as List)
        HodiInvoice.fromJson(i as Map<String, dynamic>),
    ];
  }

  Future<StkStatus> pay(int amount, String? phone, String key) async =>
      StkStatus.fromJson(
        (await _api.post(
              '/billing/pay',
              body: {'amount': amount, 'phone': ?phone},
              headers: {'Idempotency-Key': key},
            ))['data']
            as Map<String, dynamic>,
      );

  Future<StkStatus> payStatus(String id) async => StkStatus.fromJson(
    (await _api.get('/billing/pay/$id'))['data'] as Map<String, dynamic>,
  );
}

final billingApiProvider = Provider(
  (ref) => BillingApi(ref.watch(apiClientProvider)),
);
final hodiBillingProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(billingApiProvider).overview(),
);
final hodiInvoicesProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(billingApiProvider).invoices(),
);
