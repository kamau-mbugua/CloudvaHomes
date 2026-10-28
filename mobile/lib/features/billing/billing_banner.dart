import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import 'billing_api.dart';
import 'pay_hodi.dart';

/// The Hodi bill banner for staff: GRACE (overdue, nothing blocked) and SUSPENDED
/// (read-only). Same wording as the web app.
class BillingBanner extends ConsumerWidget {
  const BillingBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final status = session?.activeOrganization?.status;
    if (session == null ||
        (status != 'GRACE' && status != 'SUSPENDED' && status != 'CLOSED')) {
      return const SizedBox.shrink();
    }
    final canView = session.can('settings:view');
    final billing = canView ? ref.watch(hodiBillingProvider).valueOrNull : null;
    final suspended = status == 'SUSPENDED';
    final scheme = Theme.of(context).colorScheme;
    final color = suspended || status == 'CLOSED'
        ? scheme.error
        : const Color(0xFF9A5B00);

    final String text;
    if (status == 'CLOSED') {
      text = 'This organisation is closed on Hodi. Contact Hodi to reopen it.';
    } else if (suspended) {
      text =
          'Your account is read-only until the Hodi bill is paid. Tenants can still pay rent.'
          '${billing != null && billing.balance > 0 ? ' ${formatKes(billing.balance)} is owed.' : ''}';
    } else {
      text = billing?.overdueAmount != null
          ? 'Your Hodi bill of ${formatKes(billing!.overdueAmount!)} was due on ${formatDay(billing.overdueSince)}.'
          : 'Your Hodi bill is overdue.';
    }

    return Material(
      color: color.withValues(alpha: 0.1),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
        child: Row(
          children: [
            Icon(
              suspended ? Icons.lock_outline : Icons.warning_amber_rounded,
              color: color,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                canView || status == 'CLOSED'
                    ? text
                    : '$text Ask your organisation’s owner to pay it.',
                style: TextStyle(color: scheme.onSurface, fontSize: 13),
              ),
            ),
            if (status != 'CLOSED' && canView)
              TextButton(
                onPressed: () {
                  if (billing != null &&
                      billing.canPayInApp &&
                      session.can('settings:update')) {
                    showPayHodi(context, ref, billing, session.user.phone);
                  } else {
                    context.push('/staff/billing');
                  }
                },
                child: const Text('Pay now'),
              ),
          ],
        ),
      ),
    );
  }
}
