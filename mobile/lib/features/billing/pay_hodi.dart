import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/widgets/stk_sheet.dart';
import '../../core/providers.dart';
import 'billing_api.dart';

/// "Pay now" for the Hodi bill, through Hodi's own paybill.
Future<void> showPayHodi(
  BuildContext context,
  WidgetRef ref,
  HodiBilling billing,
  String? phone,
) {
  final api = ref.read(billingApiProvider);
  return StkPaySheet.show(
    context,
    StkPaySheet(
      title: 'Pay your Hodi bill',
      intro:
          'An M-Pesa prompt goes to the phone below. The payment pays the oldest Hodi invoice '
          'first; anything extra is kept as credit.',
      defaultAmount: wholeShillingsUp(billing.balance),
      defaultPhone: phone,
      amountHint: billing.balance > 0
          ? 'You owe ${formatKes(billing.balance)}. Whole shillings only.'
          : null,
      submit: api.pay,
      poll: api.payStatus,
      pollEvery: ref.read(stkPollIntervalProvider),
      onFinished: (s) {
        if (s.state != 'SUCCESS') return;
        ref.invalidate(hodiBillingProvider);
        ref.invalidate(hodiInvoicesProvider);
        ref.read(sessionProvider.notifier).reload();
      },
    ),
  );
}
