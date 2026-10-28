import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'tenant_api.dart';

class TenantInvoicesScreen extends ConsumerWidget {
  const TenantInvoicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(currentTenantIdProvider);
    if (id == null) return const SizedBox.shrink();
    final api = ref.watch(tenantApiProvider);
    return PagedList<InvoiceRow>(
      resetKey: id,
      load: (page) async {
        final p = await api.invoices(id, page: page);
        return (rows: p.rows, hasMore: p.hasMore);
      },
      empty: const EmptyState(
        title: 'No invoices yet',
        icon: Icons.receipt_long_outlined,
      ),
      itemBuilder: (context, i) => ListTile(
        title: Text('${formatPeriod(i.period)} · ${formatKes(i.total)}'),
        subtitle: Text('${i.number} · due ${formatDay(i.dueDate)}'),
        trailing: invoiceChip(i),
        onTap: () => context.push('/tenant/invoices/${i.id}'),
      ),
    );
  }
}

Widget invoiceChip(InvoiceRow i) {
  if (i.status == 'VOID') return const StatusChip('Void');
  if (i.overdue) return const StatusChip('Overdue', tone: Tone.bad);
  return switch (i.status) {
    'PAID' => const StatusChip('Paid', tone: Tone.good),
    'PARTIALLY_PAID' => const StatusChip('Part paid', tone: Tone.warn),
    _ => const StatusChip('Open'),
  };
}

class TenantInvoiceScreen extends ConsumerWidget {
  const TenantInvoiceScreen({super.key, required this.invoiceId});
  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoice = ref.watch(tenantInvoiceProvider(invoiceId));
    final tenantId = ref.watch(currentTenantIdProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(invoice.valueOrNull?.row.number ?? 'Invoice'),
        actions: [
          if (invoice.hasValue && tenantId != null)
            IconButton(
              tooltip: 'Open PDF',
              icon: const Icon(Icons.picture_as_pdf_outlined),
              onPressed: () =>
                  openApiPdf(
                    ref.read(apiClientProvider),
                    '${ref.read(tenantApiProvider).base(tenantId)}/invoices/$invoiceId/pdf',
                    '${invoice.value!.row.number}.pdf',
                  ).catchError((Object _) {
                    if (context.mounted) {
                      showMessage(context, 'Couldn’t open the PDF.');
                    }
                  }),
            ),
        ],
      ),
      body: AsyncBody(
        value: invoice,
        onRetry: () => ref.invalidate(tenantInvoiceProvider(invoiceId)),
        data: (d) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              title: formatPeriod(d.row.period),
              trailing: invoiceChip(d.row),
              children: [
                FactRow('Issued', formatDay(d.issueDate)),
                FactRow('Due', formatDay(d.row.dueDate)),
                if (d.row.unit != null) FactRow('Unit', d.row.unit!),
              ],
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Charges',
              children: [
                for (final l in d.lines)
                  FactRow(l.description, formatKes(l.amount)),
                const Divider(),
                FactRow('Total', formatKes(d.row.total), bold: true),
                if (d.credited > 0)
                  FactRow('Credited', '-${formatKes(d.credited)}'),
                FactRow('Paid', formatKes(d.amountPaid)),
                FactRow('Balance', formatKes(d.row.balance), bold: true),
              ],
            ),
            if (d.payments.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Payments',
                children: [
                  for (final p in d.payments)
                    FactRow(
                      '${p.number} · ${formatDay(p.receivedAt)}',
                      formatKes(p.amount),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
