import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
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
      load: (page) async {
        final p = await api.payments(id, page: page);
        return (rows: p.rows, hasMore: p.hasMore);
      },
      empty: const EmptyState(
        title: 'No payments yet',
        icon: Icons.payments_outlined,
      ),
      itemBuilder: (context, p) => ListTile(
        title: Text(formatKes(p.amount)),
        subtitle: Text(
          [
            formatDay(p.receivedAt),
            _methods[p.method] ?? p.method,
            ?p.reference,
          ].join(' · '),
        ),
        trailing: IconButton(
          tooltip: 'Receipt ${p.number}',
          icon: const Icon(Icons.receipt_outlined),
          onPressed: () =>
              openApiPdf(
                ref.read(apiClientProvider),
                '${api.base(id)}/payments/${p.id}/receipt',
                '${p.number}.pdf',
              ).catchError((Object _) {
                if (context.mounted) {
                  showMessage(context, 'Couldn’t open the receipt.');
                }
              }),
        ),
      ),
    );
  }
}
