import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/providers.dart';
import 'sms_models.dart';

/// Settings → SMS: the organisation's SMS units, usage and bundle purchases.
class SmsApi {
  SmsApi(this._api);
  final ApiClient _api;

  static Map<String, dynamic> _data(Map<String, dynamic> res) =>
      res['data'] as Map<String, dynamic>;
  static List<Map<String, dynamic>> _rows(Map<String, dynamic> res) => [
    for (final r in res['data'] as List? ?? const [])
      if (r is Map<String, dynamic>) r,
  ];

  Future<SmsAccount> account() async =>
      SmsAccount.fromJson(_data(await _api.get('/sms')));

  Future<SmsQuote> quote() async =>
      SmsQuote.fromJson(_data(await _api.get('/sms/quote')));

  Future<List<SmsUsageRow>> usage() async => [
    for (final r in _rows(
      await _api.get('/sms/usage', query: {'pageSize': 25}),
    ))
      SmsUsageRow.fromJson(r),
  ];

  Future<List<SmsTopUp>> topUps() async => [
    for (final r in _rows(
      await _api.get('/sms/top-ups', query: {'pageSize': 25}),
    ))
      SmsTopUp.fromJson(r),
  ];

  Future<SmsAccount> update(Map<String, Object?> body) async =>
      SmsAccount.fromJson(_data(await _api.patch('/sms', body: body)));

  Future<SmsPurchase> buy(int units, String? phone, String key) async =>
      SmsPurchase.fromJson(
        _data(
          await _api.post(
            '/sms/buy',
            body: {'units': units, 'phone': ?phone},
            headers: {'Idempotency-Key': key},
          ),
        ),
      );

  Future<SmsPurchase> purchase(String id) async =>
      SmsPurchase.fromJson(_data(await _api.get('/sms/buy/$id')));
}

final smsApiProvider = Provider((ref) => SmsApi(ref.watch(apiClientProvider)));
final smsAccountProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(smsApiProvider).account(),
);
final smsUsageProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(smsApiProvider).usage(),
);
final smsTopUpsProvider = FutureProvider.autoDispose(
  (ref) => ref.watch(smsApiProvider).topUps(),
);
