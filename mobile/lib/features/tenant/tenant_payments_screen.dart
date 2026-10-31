import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'tenant_api.dart';

const _methods = {
  'MPESA_PAYBILL': 'M-Pesa',
  'MPESA_TILL': 'M-Pesa',
  'BANK_ACCOUNT': 'Bank',
  'CASH': 'Cash',
  'CHEQUE': 'Cheque',
  'DEPOSIT': 'Deposit applied',
};

class TenantPaymentsScreen extends ConsumerWidget {
  const TenantPaymentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(currentTenantIdProvider);
    if (id == null) return const SizedBox.shrink();
    final api = ref.watch(tenantApiProvider);
    return PagedList<PaymentRow>(
      resetKey: id,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      load: (page) async {
        final p = await api.payments(id, page: page);
        return (rows: p.rows, hasMore: p.hasMore);
      },
      empty: const EmptyState(
        title: 'No payments yet',
        icon: Icons.payments_outlined,
      ),
      itemBuilder: (context, p) {
        void openReceipt() {
          openApiPdf(
            ref.read(apiClientProvider),
            '${api.base(id)}/payments/${p.id}/receipt',
            '${p.number}.pdf',
          ).catchError((Object _) {
            if (context.mounted) {
              showMessage(context, 'Couldn’t open the receipt.');
            }
          });
        }

        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: openReceipt,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: p.reversal
                            ? HodiColors.warningSoft
                            : HodiColors.successSoft,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        p.reversal ? Icons.undo_rounded : Icons.check_rounded,
                        size: 20,
                        color: p.reversal
                            ? HodiColors.warning
                            : HodiColors.success,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                formatKes(p.amount),
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (p.reversal) ...[
                                const SizedBox(width: 8),
                                const StatusChip('Reversal', tone: Tone.warn),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              p.number,
                              formatDay(p.receivedAt),
                              _methods[p.method] ?? p.method,
                              ?p.reference,
                            ].join(' · '),
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Receipt ${p.number}',
                      icon: const Icon(Icons.receipt_outlined, size: 20),
                      onPressed: openReceipt,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
