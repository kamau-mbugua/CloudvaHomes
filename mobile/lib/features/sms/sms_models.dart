import '../../core/money.dart';

/// Organisation SMS (docs/specs/2026-11-08-sms-platform-and-org-design.md). Money in cents.

const smsProviderLabel = {
  'AFRICASTALKING': 'Africa’s Talking',
  'TEXTSMS': 'TextSMS Kenya',
  'HOSTPINNACLE': 'HostPinnacle',
};

class SmsAccount {
  const SmsAccount({
    required this.mode,
    required this.provider,
    required this.senderId,
    required this.balance,
    required this.unitsBought,
    required this.unitsUsed,
    required this.lowBalanceLevel,
    required this.fallbackToPlatform,
    required this.unitPrice,
    required this.failing,
    required this.canBuyInApp,
  });

  /// PLATFORM or OWN.
  final String mode;
  final String? provider;
  final String? senderId;
  final int balance;
  final int unitsBought;
  final int unitsUsed;
  final int lowBalanceLevel;
  final bool fallbackToPlatform;
  final int unitPrice;
  final ({String since, String reason})? failing;
  final bool canBuyInApp;

  bool get own => mode == 'OWN';

  factory SmsAccount.fromJson(Map<String, dynamic> j) {
    final f = j['failing'];
    return SmsAccount(
      mode: j['mode'] as String? ?? 'PLATFORM',
      provider: j['provider'] as String?,
      senderId: j['senderId'] as String?,
      balance: (j['balance'] as num?)?.toInt() ?? 0,
      unitsBought: (j['unitsBought'] as num?)?.toInt() ?? 0,
      unitsUsed: (j['unitsUsed'] as num?)?.toInt() ?? 0,
      lowBalanceLevel: (j['lowBalanceLevel'] as num?)?.toInt() ?? 50,
      fallbackToPlatform: j['fallbackToPlatform'] == true,
      unitPrice: centsFrom(j['unitPrice']),
      failing: f is Map
          ? (
              since: f['since'] as String? ?? '',
              reason: f['reason'] as String? ?? '',
            )
          : null,
      canBuyInApp: j['canBuyInApp'] == true,
    );
  }
}

class SmsQuote {
  const SmsQuote({
    required this.unitPrice,
    required this.minUnits,
    required this.bundles,
  });
  final int unitPrice;
  final int minUnits;
  final List<({int units, int amount})> bundles;

  factory SmsQuote.fromJson(Map<String, dynamic> j) => SmsQuote(
    unitPrice: centsFrom(j['unitPrice']),
    minUnits: (j['minUnits'] as num?)?.toInt() ?? 1,
    bundles: [
      for (final b in (j['bundles'] as List? ?? const []))
        if (b is Map)
          (
            units: (b['units'] as num?)?.toInt() ?? 0,
            amount: centsFrom(b['amount']),
          ),
    ],
  );
}

class SmsUsageRow {
  const SmsUsageRow({
    required this.id,
    required this.at,
    required this.type,
    required this.to,
    required this.units,
    required this.status,
    required this.reason,
  });
  final String id;
  final String at;
  final String type;
  final String to;
  final int units;
  final String status;
  final String? reason;

  factory SmsUsageRow.fromJson(Map<String, dynamic> j) => SmsUsageRow(
    id: j['id'] as String,
    at: j['at'] as String? ?? '',
    type: (j['type'] as String? ?? '').replaceAll('_', ' '),
    to: j['to'] as String? ?? '',
    units: (j['units'] as num?)?.toInt() ?? 0,
    status: j['status'] as String? ?? 'SENT',
    reason: j['reason'] as String?,
  );
}

class SmsTopUp {
  const SmsTopUp({
    required this.id,
    required this.at,
    required this.kind,
    required this.units,
    required this.balanceAfter,
    required this.reason,
    required this.amount,
    required this.mpesaReceipt,
  });
  final String id;
  final String at;

  /// PURCHASE or ADJUSTMENT.
  final String kind;
  final int units;
  final int balanceAfter;
  final String? reason;
  final int? amount;
  final String? mpesaReceipt;

  factory SmsTopUp.fromJson(Map<String, dynamic> j) => SmsTopUp(
    id: j['id'] as String,
    at: j['at'] as String? ?? '',
    kind: j['kind'] as String? ?? 'PURCHASE',
    units: (j['units'] as num?)?.toInt() ?? 0,
    balanceAfter: (j['balanceAfter'] as num?)?.toInt() ?? 0,
    reason: j['reason'] as String?,
    amount: j['amount'] == null ? null : centsFrom(j['amount']),
    mpesaReceipt: j['mpesaReceipt'] as String?,
  );
}

class SmsPurchase {
  const SmsPurchase({
    required this.id,
    required this.units,
    required this.amount,
    required this.state,
    required this.mpesaReceipt,
  });
  final String id;
  final int units;
  final int amount;

  /// PENDING, PAID or FAILED.
  final String state;
  final String? mpesaReceipt;

  factory SmsPurchase.fromJson(Map<String, dynamic> j) => SmsPurchase(
    id: j['id'] as String,
    units: (j['units'] as num?)?.toInt() ?? 0,
    amount: centsFrom(j['amount']),
    state: j['state'] as String? ?? 'PENDING',
    mpesaReceipt: j['mpesaReceipt'] as String?,
  );
}

String smsModeLabel(SmsAccount a) {
  if (!a.own) return 'KodiHub sends your SMS';
  final parts = [
    if (a.senderId != null) 'sender ID ${a.senderId}',
    if (a.provider != null) smsProviderLabel[a.provider] ?? a.provider!,
  ];
  return parts.isEmpty
      ? 'Your own SMS account'
      : 'Your own SMS account (${parts.join(', ')})';
}

/// The banner while SMS needs attention (null = nothing to say). `buy` = offer Buy SMS.
({bool danger, String text, bool buy})? smsBanner(SmsAccount a) {
  if (a.own) {
    final f = a.failing;
    return f == null
        ? null
        : (
            danger: true,
            text: 'Your SMS account isn’t sending: ${f.reason}',
            buy: false,
          );
  }
  if (a.balance <= 0) {
    return (
      danger: true,
      text:
          'Out of SMS units — messages to your tenants and guests are not being sent.',
      buy: true,
    );
  }
  if (a.balance < a.lowBalanceLevel) {
    return (danger: false, text: '${a.balance} SMS units left.', buy: true);
  }
  return null;
}

/// Cents for `units` at `unitPrice` cents, rounded up to whole shillings (as the server does).
int smsBundleAmount(int units, int unitPrice) =>
    ((units * unitPrice + 99) ~/ 100) * 100;

String smsStatusLabel(String status) => switch (status) {
  'SENT' => 'Sent',
  'FAILED' => 'Failed',
  'NO_UNITS' => 'Not sent — no SMS units',
  _ => status,
};
