import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'tenant_api.dart';
import 'tenant_home_screen.dart';
import 'tenant_payments_screen.dart';
import 'tenant_statement_screen.dart';

/// Unified tenant financial ledger screen with 3 segmented tabs (`Invoices | Payments | Statement`)
/// so the tenant bottom navigation bar stays lean (3 tabs: Home, Ledger, Repairs).
class TenantLedgerScreen extends StatefulWidget {
  const TenantLedgerScreen({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  State<TenantLedgerScreen> createState() => _TenantLedgerScreenState();
}

class _TenantLedgerScreenState extends State<TenantLedgerScreen> {
  late int _tab = widget.initialTab;

  @override
  void didUpdateWidget(covariant TenantLedgerScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialTab != widget.initialTab) {
      _tab = widget.initialTab;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: KodiHubSegmentedTabs(
            tabs: const ['Invoices', 'Payments', 'Statement'],
            index: _tab,
            onChanged: (i) => setState(() => _tab = i),
          ),
        ),
        Expanded(
          child: switch (_tab) {
            0 => const TenantInvoicesScreen(),
            1 => const TenantPaymentsScreen(),
            _ => const TenantStatementScreen(),
          },
        ),
      ],
    );
  }
}

class TenantInvoicesScreen extends ConsumerWidget {
  const TenantInvoicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(currentTenantIdProvider);
    if (id == null) {
      return ref.watch(sessionProvider).isLoading
          ? const KodiHubPageLoader()
          : const SizedBox.shrink();
    }
    final api = ref.watch(tenantApiProvider);
    return PagedList<InvoiceRow>(
      resetKey: id,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      load: (page) async {
        final p = await api.invoices(id, page: page);
        return (rows: p.rows, hasMore: p.hasMore);
      },
      empty: const EmptyState(
        title: 'No invoices yet',
        icon: Icons.receipt_long_outlined,
      ),
      itemBuilder: (context, i) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => context.push('/tenant/invoices/${i.id}'),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  if (i.unit != null) ...[
                    UnitBadge(i.unit!),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          formatPeriod(i.period),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${i.number} · due ${formatDay(i.dueDate)}',
                          style: TextStyle(
                            fontFamily: 'JetBrainsMono',
                            fontSize: 11.5,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        formatKes(i.total),
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      invoiceChip(i),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
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
    _ => const StatusChip('Open', tone: Tone.warn),
  };
}

class TenantInvoiceScreen extends ConsumerStatefulWidget {
  const TenantInvoiceScreen({super.key, required this.invoiceId});
  final String invoiceId;

  @override
  ConsumerState<TenantInvoiceScreen> createState() =>
      _TenantInvoiceScreenState();
}

class _TenantInvoiceScreenState extends ConsumerState<TenantInvoiceScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final invoiceId = widget.invoiceId;
    final invoice = ref.watch(tenantInvoiceProvider(invoiceId));
    final overview = ref.watch(tenantOverviewProvider).valueOrNull;
    final tenantId = ref.watch(currentTenantIdProvider);
    final inv = invoice.valueOrNull;
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(
          inv != null ? '${formatPeriod(inv.row.period)} invoice' : 'Invoice',
        ),
        subtitle: inv?.row.number,
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
        data: (d) {
          final dark = Theme.of(context).brightness == Brightness.dark;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              LedgerReceiptCard(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Kicker(
                        d.row.balance > 0
                            ? 'Left to pay'
                            : formatPeriod(d.row.period),
                        color: HodiColors.limeText,
                      ),
                      invoiceChip(d.row),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    formatKes(d.row.balance > 0 ? d.row.balance : d.row.total),
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.8,
                      color: dark ? Colors.white : HodiColors.navy,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Divider(),
                  const SizedBox(height: 6),
                  FactRow('Issued', formatDay(d.issueDate)),
                  FactRow('Due', formatDay(d.row.dueDate)),
                  if (d.row.unit != null) FactRow('Unit', d.row.unit!),
                  if (d.row.balance > 0 &&
                      overview != null &&
                      overview.canPayInApp) ...[
                    const SizedBox(height: 14),
                    FilledButton.icon(
                      style: KodiHubButtonStyles.money(height: 52),
                      icon: const Icon(
                        Icons.phone_iphone,
                        color: HodiColors.navy,
                      ),
                      label: Text('Pay ${formatKes(d.row.balance)} now'),
                      onPressed: () => showTenantPaySheet(
                        context,
                        ref,
                        overview,
                        amountCents: d.row.balance,
                        onSuccess: () =>
                            ref.invalidate(tenantInvoiceProvider(invoiceId)),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              KodiHubSegmentedTabs(
                tabs: [
                  'Charges (${d.lines.length})',
                  'Payments (${d.payments.length})',
                ],
                index: _tab,
                onChanged: (i) => setState(() => _tab = i),
              ),
              const SizedBox(height: 12),
              if (_tab == 0)
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
                )
              else
                SectionCard(
                  title: 'Payments',
                  children: [
                    if (d.payments.isEmpty)
                      const Text('No payments recorded for this invoice yet.'),
                    for (final p in d.payments)
                      FactRow(
                        '${p.number} · ${formatDay(p.receivedAt)}',
                        formatKes(p.amount),
                        onTap: tenantId == null || p.id == null
                            ? null
                            : () =>
                                  openApiPdf(
                                    ref.read(apiClientProvider),
                                    '${ref.read(tenantApiProvider).base(tenantId)}/payments/${p.id}/receipt',
                                    '${p.number}.pdf',
                                  ).catchError((Object _) {
                                    if (context.mounted) {
                                      showMessage(
                                        context,
                                        'Couldn’t open the receipt.',
                                      );
                                    }
                                  }),
                      ),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }
}
