import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/stk_sheet.dart';
import 'tenant_api.dart';

void showTenantPaySheet(
  BuildContext context,
  WidgetRef ref,
  TenantOverview o, {
  int? amountCents,
  VoidCallback? onSuccess,
}) {
  final targetCents = amountCents ?? o.owed;
  final api = ref.read(tenantApiProvider);
  StkPaySheet.show(
    context,
    StkPaySheet(
      kicker: 'To ${o.orgName}',
      title: 'Pay with M-Pesa',
      intro:
          'An M-Pesa prompt goes to the phone below. Enter your M-Pesa PIN to pay ${o.orgName}.',
      defaultAmount: wholeShillingsUp(targetCents),
      defaultPhone: o.phone,
      amountHint: targetCents > 0
          ? 'You owe ${formatKes(targetCents)}. Whole shillings only.'
          : null,
      submit: (amount, phone, key) => api.pay(o.tenantId, amount, phone, key),
      poll: (id) => api.payStatus(o.tenantId, id),
      pollEvery: ref.read(stkPollIntervalProvider),
      onFinished: (s) {
        if (s.state == 'SUCCESS') {
          ref.invalidate(tenantOverviewProvider);
          onSuccess?.call();
        }
      },
    ),
  );
}

class PayWayView extends StatelessWidget {
  const PayWayView(this.w, {super.key});
  final PayWay w;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(
      color: Theme.of(context).colorScheme.onSurfaceVariant,
      fontSize: 13,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          w.kind == 'BANK_ACCOUNT' && w.bankName != null
              ? '${w.name} · ${w.bankName}'
              : w.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        switch (w.kind) {
          'MPESA_PAYBILL' => Column(
            children: [
              CopyRow(label: 'Paybill', value: w.shortcode ?? ''),
              if (w.accountRef != null)
                CopyRow(label: 'Account number', value: w.accountRef!),
              Text('M-Pesa → Lipa na M-Pesa → Pay Bill', style: muted),
            ],
          ),
          'MPESA_TILL' => Column(
            children: [
              CopyRow(label: 'Till number', value: w.shortcode ?? ''),
              Text(
                'M-Pesa → Lipa na M-Pesa → Buy Goods and Services',
                style: muted,
              ),
            ],
          ),
          _ => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (w.accountNumber != null)
                CopyRow(label: 'Account number', value: w.accountNumber!),
              if (w.accountRef != null)
                CopyRow(label: 'Reference', value: w.accountRef!),
              if (w.accountName != null)
                Text('In the name of ${w.accountName}', style: muted),
            ],
          ),
        },
      ],
    );
  }
}
