import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'billing_api.dart';
import 'pay_hodi.dart';

/// The organisation's Hodi plan, bill and invoices (staff: More → Plan & billing).
class PlanBillingScreen extends ConsumerWidget {
  const PlanBillingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final billing = ref.watch(hodiBillingProvider);
    final invoices = ref.watch(hodiInvoicesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Plan & billing')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(hodiBillingProvider);
          ref.invalidate(hodiInvoicesProvider);
        },
        child: AsyncBody(
          value: billing,
          onRetry: () => ref.invalidate(hodiBillingProvider),
          data: (b) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              CurvedHeroCard(
                label: 'Owed to Hodi',
                trailing: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _statusLabel(b.status),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      formatKes(b.balance),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  if (b.overdueAmount != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      '${formatKes(b.overdueAmount!)} overdue since ${formatDay(b.overdueSince)}',
                      style: const TextStyle(
                        color: Color(0xFFFCA5A5),
                        fontSize: 13,
                      ),
                    ),
                  ],
                  if (b.credit > 0) ...[
                    const SizedBox(height: 6),
                    Text(
                      '${formatKes(b.credit)} in credit',
                      style: const TextStyle(
                        color: Color(0xCCFFFFFF),
                        fontSize: 13,
                      ),
                    ),
                  ],
                  if (b.balance > 0 &&
                      b.canPayInApp &&
                      (session?.can('settings:update') ?? false)) ...[
                    const SizedBox(height: 14),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: HodiColors.navy,
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () =>
                          showPayHodi(context, ref, b, session?.user.phone),
                      child: const Text('Pay now'),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Your plan',
                children: [
                  FactRow('Plan', b.planName ?? '—'),
                  FactRow(
                    b.customPrice ? 'Price (custom)' : 'Price',
                    '${formatKes(b.pricePerUnit)} per let unit a month'
                    '${b.minimumMonthly > 0 ? ', at least ${formatKes(b.minimumMonthly)}' : ''}',
                  ),
                  if (b.trialEndsAt != null)
                    FactRow('Free trial until', formatDay(b.trialEndsAt)),
                ],
              ),
              if (b.paybill != null && b.billingRef != null) ...[
                const SizedBox(height: 12),
                SectionCard(
                  title: 'How to pay',
                  children: [
                    CopyRow(label: 'Paybill', value: b.paybill!),
                    CopyRow(label: 'Account number', value: b.billingRef!),
                    const SizedBox(height: 4),
                    const Text('M-Pesa → Lipa na M-Pesa → Pay Bill.'),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              SectionCard(
                title: 'Hodi invoices',
                children: [
                  AsyncBody(
                    value: invoices,
                    onRetry: () => ref.invalidate(hodiInvoicesProvider),
                    data: (list) => list.isEmpty
                        ? const EmptyState(title: 'No invoices yet')
                        : Column(
                            children: [
                              for (final i in list)
                                ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(
                                    '${formatPeriod(i.period)} · ${formatKes(i.total)}',
                                  ),
                                  subtitle: Text(
                                    '${i.number} · ${i.occupiedUnits} let units · due ${formatDay(i.dueDate)}',
                                  ),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      StatusChip(
                                        _invoiceLabel(i),
                                        tone: i.overdue
                                            ? Tone.bad
                                            : (i.status == 'PAID'
                                                  ? Tone.good
                                                  : Tone.neutral),
                                      ),
                                      IconButton(
                                        tooltip: 'PDF',
                                        icon: const Icon(
                                          Icons.picture_as_pdf_outlined,
                                        ),
                                        onPressed: () =>
                                            openApiPdf(
                                              ref.read(apiClientProvider),
                                              '/billing/invoices/${i.id}/pdf',
                                              '${i.number}.pdf',
                                            ).catchError((Object e) {
                                              if (context.mounted) {
                                                showMessage(
                                                  context,
                                                  'Couldn’t open the PDF.',
                                                );
                                              }
                                            }),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _statusLabel(String s) => switch (s) {
  'TRIAL' => 'Trial',
  'ACTIVE' => 'Active',
  'GRACE' => 'Overdue',
  'SUSPENDED' => 'Read-only',
  'CLOSED' => 'Closed',
  _ => s,
};

String _invoiceLabel(HodiInvoice i) => i.overdue
    ? 'Overdue'
    : switch (i.status) {
        'PAID' => 'Paid',
        'PARTIALLY_PAID' => 'Part paid',
        'VOID' => 'Void',
        _ => 'Open',
      };
